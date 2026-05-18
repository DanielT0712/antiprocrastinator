use std::{
    ffi::{OsStr, OsString},
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

#[cfg(test)]
use std::path::PathBuf as TestPathBuf;

use serde::{Deserialize, Serialize};
use sysinfo::{Pid, ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

pub const QUIT_CHALLENGE_PHRASE: &str = "I WANT TO PROCRASTINATE";
pub const QUIT_REQUIRED_EVENT: &str = "guard-quit-required";
pub const MAIN_WINDOW_LABEL: &str = "main";
pub const WARNING_OVERLAY_LABEL_PREFIX: &str = "warning_overlay_";
pub const WARNING_POPUP_LABEL: &str = "warning_popup";
pub const MAIN_TRAY_ID: &str = "main";
pub const TRAY_SHOW_ID: &str = "tray_show_main";
pub const TRAY_REQUEST_QUIT_ID: &str = "tray_request_quit";
pub const DEFAULT_APP_IDENTIFIER: &str = "com.antiprocrastinator.app";
pub const HELPER_BINARY_NAME: &str = "guard_helper";
pub const GUARD_HEARTBEAT_INTERVAL_SECS: u64 = 5;
pub const GUARD_POLL_INTERVAL_SECS: u64 = 5;
pub const GUARD_LAUNCH_GRACE_SECS: u64 = 20;
pub const GUARD_RESTART_WINDOW_SECS: u64 = 600;
pub const GUARD_MAX_RESTARTS_PER_WINDOW: u32 = 3;

pub struct GuardState {
    active: Mutex<bool>,
    allow_exit_once: Mutex<bool>,
    last_frontend_heartbeat_ms: Mutex<Option<i64>>,
    popup_show_until_ms: Mutex<i64>,
    popup_visible: Mutex<bool>,
    active_warning: Mutex<Option<ActiveWarning>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SupervisorMode {
    Enforced,
    Suspended,
    Disabled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuitChallenge {
    pub warning: String,
    pub required_phrase: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuardStatus {
    pub active: bool,
    pub challenge_phrase: String,
    pub supervisor_mode: SupervisorMode,
    pub suspended_until_epoch_secs: Option<u64>,
    pub helper_running: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuitRequiredEvent {
    pub source: String,
    pub minimized_to_tray: bool,
    pub warning: String,
    pub required_phrase: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveWarning {
    pub kind: String,
    pub process_name: Option<String>,
    pub title: Option<String>,
    pub message: String,
    pub match_reason: Option<String>,
    pub warning_count: u32,
    pub kill_at: Option<i64>,
    pub received_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuardSupervisorState {
    pub version: u32,
    pub mode: SupervisorMode,
    pub suspended_until_epoch_secs: Option<u64>,
    pub suspension_reason: Option<String>,
    pub main_pid: Option<u32>,
    pub helper_pid: Option<u32>,
    pub session_id: Option<String>,
    pub last_heartbeat_at_epoch_secs: Option<u64>,
    pub last_launch_at_epoch_secs: Option<u64>,
    pub restart_count_window: u32,
    pub restart_window_started_at_epoch_secs: Option<u64>,
    pub main_executable_path: Option<String>,
    #[serde(default)]
    pub dev_relaunch_cwd: Option<String>,
    #[serde(default)]
    pub dev_relaunch_program: Option<String>,
    #[serde(default)]
    pub dev_relaunch_args: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct TimedSuspendRequest {
    pub duration_minutes: u32,
    pub reason: Option<String>,
}

#[derive(Debug, Clone)]
struct HelperConfig {
    identifier: String,
    main_executable: PathBuf,
}

impl Default for GuardSupervisorState {
    fn default() -> Self {
        Self {
            version: 1,
            mode: SupervisorMode::Enforced,
            suspended_until_epoch_secs: None,
            suspension_reason: None,
            main_pid: None,
            helper_pid: None,
            session_id: None,
            last_heartbeat_at_epoch_secs: None,
            last_launch_at_epoch_secs: None,
            restart_count_window: 0,
            restart_window_started_at_epoch_secs: None,
            main_executable_path: None,
            dev_relaunch_cwd: None,
            dev_relaunch_program: None,
            dev_relaunch_args: Vec::new(),
        }
    }
}

impl GuardState {
    pub fn new() -> Self {
        Self {
            active: Mutex::new(true),
            allow_exit_once: Mutex::new(false),
            last_frontend_heartbeat_ms: Mutex::new(None),
            popup_show_until_ms: Mutex::new(0),
            popup_visible: Mutex::new(false),
            active_warning: Mutex::new(None),
        }
    }

    pub fn request_popup_show_until(&self, ts_ms: i64) {
        if let Ok(mut guard) = self.popup_show_until_ms.lock() {
            if ts_ms > *guard {
                *guard = ts_ms;
            }
        }
    }

    pub fn popup_show_until(&self) -> i64 {
        self.popup_show_until_ms.lock().map(|g| *g).unwrap_or(0)
    }

    pub fn force_hide_popup(&self) {
        if let Ok(mut g) = self.popup_show_until_ms.lock() {
            *g = 0;
        }
    }

    pub fn set_active_warning(&self, warning: ActiveWarning) {
        if let Ok(mut guard) = self.active_warning.lock() {
            *guard = Some(warning);
        }
    }

    pub fn active_warning(&self) -> Option<ActiveWarning> {
        self.active_warning
            .lock()
            .ok()
            .and_then(|guard| guard.clone())
    }

    pub fn clear_active_warning(&self) {
        if let Ok(mut guard) = self.active_warning.lock() {
            *guard = None;
        }
    }

    pub fn clear_active_warning_for_process(&self, process_name: &str) {
        if let Ok(mut guard) = self.active_warning.lock() {
            let should_clear = guard
                .as_ref()
                .and_then(|warning| warning.process_name.as_deref())
                .map(|name| name == process_name)
                .unwrap_or(false);
            if should_clear {
                *guard = None;
            }
        }
    }

    pub fn record_frontend_heartbeat(&self) {
        if let Ok(mut guard) = self.last_frontend_heartbeat_ms.lock() {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            *guard = Some(now);
        }
    }

    /// True when the React UI has pinged within the last `stale_ms` and we
    /// can therefore trust the in-app challenge dialog to actually appear.
    /// If the bundle ever fails to mount (white screen), the dialog never
    /// renders, so strong-guard quit-blocking would trap the user forever
    /// — bypass it instead.
    pub fn frontend_alive(&self, stale_ms: i64) -> bool {
        let last = match self.last_frontend_heartbeat_ms.lock() {
            Ok(g) => *g,
            Err(_) => return false,
        };
        match last {
            None => false,
            Some(ts) => {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0);
                now - ts < stale_ms
            }
        }
    }

    pub fn is_active(&self) -> Result<bool, String> {
        self.active
            .lock()
            .map(|value| *value)
            .map_err(|error| error.to_string())
    }

    pub fn request_quit(&self) -> QuitChallenge {
        QuitChallenge {
            warning:
                "Stopping the app also stops the guardrails that were supposed to keep you focused."
                    .to_string(),
            required_phrase: QUIT_CHALLENGE_PHRASE.to_string(),
        }
    }

    pub fn allow_exit_once(&self) -> Result<(), String> {
        let mut guard = self
            .allow_exit_once
            .lock()
            .map_err(|error| error.to_string())?;
        *guard = true;
        Ok(())
    }

    pub fn consume_exit_allowance(&self) -> Result<bool, String> {
        let mut guard = self
            .allow_exit_once
            .lock()
            .map_err(|error| error.to_string())?;
        let allowed = *guard;
        *guard = false;
        Ok(allowed)
    }
}

pub fn emit_quit_required<R: Runtime>(
    app: &AppHandle<R>,
    source: &str,
    minimized_to_tray: bool,
) -> Result<(), String> {
    let challenge = app.state::<GuardState>().request_quit();
    app.emit(
        QUIT_REQUIRED_EVENT,
        QuitRequiredEvent {
            source: source.to_string(),
            minimized_to_tray,
            warning: challenge.warning,
            required_phrase: challenge.required_phrase,
        },
    )
    .map_err(|error| error.to_string())
}

pub fn show_main_window<R: Runtime, M: Manager<R>>(manager: &M) -> Result<(), String> {
    let window = manager
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "main window was not available".to_string())?;
    let _ = window.unminimize();
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

/// Spawn one borderless, click-through, always-on-top tint overlay per
/// monitor. Pointer events pass through so the user can still interact
/// with whatever's beneath. This is the visual layer only — the
/// countdown text lives in a separate unclosable popup window.
pub fn show_warning_overlay<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    for (idx, monitor) in monitors.iter().enumerate() {
        let label = format!("{WARNING_OVERLAY_LABEL_PREFIX}{idx}");
        let window = match app.get_webview_window(&label) {
            Some(w) => w,
            None => tauri::WebviewWindowBuilder::new(
                app,
                &label,
                tauri::WebviewUrl::App("index.html?view=overlay".into()),
            )
            .title("AntiProcrastinator overlay")
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .focused(false)
            .resizable(false)
            .closable(false)
            .minimizable(false)
            .maximizable(false)
            .shadow(false)
            .visible(false)
            .build()
            .map_err(|e| e.to_string())?,
        };
        let size = monitor.size();
        let pos = monitor.position();
        let _ = window.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
        let _ = window.set_size(tauri::PhysicalSize::new(size.width, size.height));
        let _ = window.set_ignore_cursor_events(true);
        let _ = window.set_always_on_top(true);
        let _ = window.show();
    }
    Ok(())
}

pub fn hide_warning_overlay<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    // Close every overlay window we previously spawned. Labels start with
    // the known prefix so iterating webview_windows() is enough. Popup
    // is intentionally NOT hidden — it's always-on with ticking text.
    for (label, win) in app.webview_windows() {
        if label.starts_with(WARNING_OVERLAY_LABEL_PREFIX) {
            let _ = win.hide();
        }
    }
    Ok(())
}

/// Small unclosable always-on-top popup with the countdown text. No
/// traffic-light buttons (decorations off + closable/min/max all false)
/// so the user can't dismiss it from the OS.
pub fn show_warning_popup<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = match app.get_webview_window(WARNING_POPUP_LABEL) {
        Some(w) => w,
        None => tauri::WebviewWindowBuilder::new(
            app,
            WARNING_POPUP_LABEL,
            tauri::WebviewUrl::App("index.html?view=popup".into()),
        )
        .title("AntiProcrastinator warning")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .resizable(false)
        .closable(false)
        .minimizable(false)
        .maximizable(false)
        .shadow(true)
        .inner_size(480.0, 160.0)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?,
    };

    if let Ok(Some(monitor)) = window.primary_monitor() {
        let m_size = monitor.size();
        let m_pos = monitor.position();
        // Center horizontally near the top of the primary monitor.
        let scale = monitor.scale_factor().max(1.0);
        let win_w = (480.0 * scale) as i32;
        let win_h = (160.0 * scale) as i32;
        let x = m_pos.x + (m_size.width as i32 - win_w) / 2;
        let y = m_pos.y + (m_size.height as i32 / 12).max(48);
        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    }

    let _ = window.set_always_on_top(true);
    let _ = window.show();
    Ok(())
}

pub fn hide_warning_popup<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(WARNING_POPUP_LABEL) {
        let _ = window.hide();
    }
    Ok(())
}

/// Warning surface selected by the user in Settings → Warnings.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WarningDisplay {
    Fullscreen,
    Window,
    Banner,
    Menubar,
}

impl WarningDisplay {
    pub fn parse(value: &str) -> Self {
        match value {
            "fullscreen" => Self::Fullscreen,
            "window" => Self::Window,
            "menubar" => Self::Menubar,
            _ => Self::Banner,
        }
    }
}

/// Run on the schedule tick. Reads `popup_show_until_ms` and toggles the
/// popup window when the desired state crosses the current state. Only
/// actually shows the popup when the user's warning-display preference
/// is `window`.
pub fn reconcile_warning_popup<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let guard = app.state::<GuardState>();
    let mode = current_warning_display(app);
    let until = guard.popup_show_until();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let want = mode == WarningDisplay::Window && now < until;
    let mut cache = guard.popup_visible.lock().map_err(|e| e.to_string())?;
    if want == *cache {
        return Ok(());
    }
    if want {
        show_warning_popup(app)?;
    } else {
        hide_warning_popup(app)?;
    }
    *cache = want;
    Ok(())
}

pub fn current_warning_display<R: Runtime>(app: &AppHandle<R>) -> WarningDisplay {
    let config = app.state::<crate::config::manager::ConfigState>();
    match config.get_preferences() {
        Ok(prefs) => WarningDisplay::parse(&prefs.warning_display),
        Err(_) => WarningDisplay::Banner,
    }
}

pub fn set_main_window_topmost<R: Runtime, M: Manager<R>>(
    manager: &M,
    on: bool,
) -> Result<(), String> {
    let window = match manager.get_webview_window(MAIN_WINDOW_LABEL) {
        Some(w) => w,
        None => return Ok(()),
    };
    window
        .set_always_on_top(on)
        .map_err(|error| error.to_string())?;
    if on {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

pub fn hide_main_window<R: Runtime, M: Manager<R>>(manager: &M) -> Result<(), String> {
    manager
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "main window was not available".to_string())?
        .hide()
        .map_err(|error| error.to_string())
}

pub fn setup_system_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if app.tray_by_id(MAIN_TRAY_ID).is_some() {
        return Ok(());
    }

    let show_item = MenuItem::with_id(
        app,
        TRAY_SHOW_ID,
        "Show AntiProcrastinator",
        true,
        None::<&str>,
    )
    .map_err(|error| error.to_string())?;
    let quit_item = MenuItem::with_id(app, TRAY_REQUEST_QUIT_ID, "Quit...", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let menu =
        Menu::with_items(app, &[&show_item, &quit_item]).map_err(|error| error.to_string())?;

    let mut tray = TrayIconBuilder::with_id(MAIN_TRAY_ID)
        .menu(&menu)
        .tooltip("AntiProcrastinator")
        .show_menu_on_left_click(false);

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(app).map_err(|error| error.to_string())?;
    Ok(())
}

pub fn set_tray_warning<R: Runtime>(
    app: &AppHandle<R>,
    warning: Option<&ActiveWarning>,
) -> Result<(), String> {
    let Some(tray) = app.tray_by_id(MAIN_TRAY_ID) else {
        return Ok(());
    };
    let tooltip = warning
        .map(|warning| format!("AntiProcrastinator: {}", warning.message))
        .unwrap_or_else(|| "AntiProcrastinator".to_string());
    tray.set_tooltip(Some(tooltip))
        .map_err(|error| error.to_string())
}

pub fn handle_tray_event<R: Runtime>(app: &AppHandle<R>, event: &TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = event
    {
        let _ = show_main_window(app);
    }
}

pub fn sync_launch_at_login(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let current_executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let identifier = app.config().identifier.clone();
    let helper_executable = helper_binary_path(&current_executable);
    let main_executable = main_binary_path(&current_executable);
    let helper_args = helper_args(&identifier, &main_executable);

    #[cfg(target_os = "macos")]
    {
        return sync_launch_at_login_macos(&identifier, &helper_executable, &helper_args, enabled);
    }

    #[cfg(target_os = "windows")]
    {
        return sync_launch_at_login_windows(
            &identifier,
            &helper_executable,
            &helper_args,
            enabled,
        );
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        return sync_launch_at_login_linux(&identifier, &helper_executable, &helper_args, enabled);
    }

    #[allow(unreachable_code)]
    Ok(())
}

pub fn start_supervisor_runtime(app: &AppHandle) -> Result<(), String> {
    register_main_instance(app)?;
    ensure_helper_running(app)?;
    start_heartbeat_loop(app.clone());
    Ok(())
}

pub fn get_guard_status(app: &AppHandle, guard: &GuardState) -> Result<GuardStatus, String> {
    let state = load_supervisor_state_for_app(app)?;
    Ok(GuardStatus {
        active: guard.is_active()?,
        challenge_phrase: QUIT_CHALLENGE_PHRASE.to_string(),
        supervisor_mode: state.mode,
        suspended_until_epoch_secs: state.suspended_until_epoch_secs,
        helper_running: state.helper_pid.is_some_and(is_process_alive),
    })
}

pub fn disable_supervisor(app: &AppHandle) -> Result<(), String> {
    let mut state = load_supervisor_state_for_app(app)?;
    state.mode = SupervisorMode::Disabled;
    state.suspended_until_epoch_secs = None;
    state.suspension_reason = None;
    state.last_heartbeat_at_epoch_secs = Some(now_epoch_secs());
    write_supervisor_state_for_app(app, &state)
}

pub fn suspend_supervisor(app: &AppHandle, request: TimedSuspendRequest) -> Result<(), String> {
    if request.duration_minutes == 0 {
        return Err("suspension duration must be at least 1 minute".to_string());
    }

    let mut state = load_supervisor_state_for_app(app)?;
    state.mode = SupervisorMode::Suspended;
    state.suspended_until_epoch_secs =
        Some(now_epoch_secs() + u64::from(request.duration_minutes) * 60);
    state.suspension_reason = request.reason;
    state.last_heartbeat_at_epoch_secs = Some(now_epoch_secs());
    write_supervisor_state_for_app(app, &state)
}

pub fn run_guard_helper_from_cli() -> Result<(), String> {
    let config = parse_helper_config(std::env::args_os().skip(1).collect())?;
    run_guard_helper(config)
}

fn run_guard_helper(config: HelperConfig) -> Result<(), String> {
    let helper_pid = std::process::id();
    if let Some(existing_pid) = find_running_helper_pid(&config.identifier, helper_pid) {
        let mut state = load_supervisor_state(&config.identifier)?;
        state.helper_pid = Some(existing_pid);
        write_supervisor_state(&config.identifier, &state)?;
        return Ok(());
    }

    loop {
        let mut state = load_supervisor_state(&config.identifier)?;
        let now = now_epoch_secs();

        state.helper_pid = Some(helper_pid);
        if state.main_executable_path.is_none() {
            state.main_executable_path = Some(config.main_executable.display().to_string());
        }

        match state.mode {
            SupervisorMode::Disabled => {
                state.helper_pid = None;
                write_supervisor_state(&config.identifier, &state)?;
                return Ok(());
            }
            SupervisorMode::Suspended => {
                if let Some(until) = state.suspended_until_epoch_secs {
                    if now < until {
                        write_supervisor_state(&config.identifier, &state)?;
                        thread::sleep(Duration::from_secs(GUARD_POLL_INTERVAL_SECS));
                        continue;
                    }
                }

                state.mode = SupervisorMode::Enforced;
                state.suspended_until_epoch_secs = None;
                state.suspension_reason = None;
            }
            SupervisorMode::Enforced => {}
        }

        let executable = state
            .main_executable_path
            .clone()
            .map(PathBuf::from)
            .unwrap_or_else(|| config.main_executable.clone());
        let running_main_pid = find_running_pid_by_executable(&executable, Some(helper_pid));
        let main_alive = state.main_pid.is_some_and(is_process_alive) || running_main_pid.is_some();
        if let Some(pid) = running_main_pid {
            state.main_pid = Some(pid);
        }
        let launch_grace_elapsed = state
            .last_launch_at_epoch_secs
            .is_none_or(|ts| now.saturating_sub(ts) >= GUARD_LAUNCH_GRACE_SECS);

        if !main_alive && launch_grace_elapsed && can_attempt_restart(&mut state, now) {
            if let Some((program, args, cwd)) = dev_relaunch_command(&state) {
                spawn_process_with_cwd(
                    OsStr::new(&program),
                    &args.iter().map(OsString::from).collect::<Vec<_>>(),
                    cwd.as_deref().map(Path::new),
                )?;
                state.last_launch_at_epoch_secs = Some(now);
                state.last_heartbeat_at_epoch_secs = None;
                state.main_pid = None;
                state.session_id = None;
            } else if executable.exists() {
                spawn_process(&executable, &[])?;
                state.last_launch_at_epoch_secs = Some(now);
                state.last_heartbeat_at_epoch_secs = None;
                state.main_pid = None;
                state.session_id = None;
            }
        }

        write_supervisor_state(&config.identifier, &state)?;
        thread::sleep(Duration::from_secs(GUARD_POLL_INTERVAL_SECS));
    }
}

fn register_main_instance(app: &AppHandle) -> Result<(), String> {
    let current_executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let mut state = load_supervisor_state_for_app(app)?;
    state.mode = SupervisorMode::Enforced;
    state.suspended_until_epoch_secs = None;
    state.suspension_reason = None;
    state.main_pid = Some(std::process::id());
    state.session_id = Some(generate_session_id());
    state.last_heartbeat_at_epoch_secs = Some(now_epoch_secs());
    state.main_executable_path = Some(main_binary_path(&current_executable).display().to_string());
    #[cfg(debug_assertions)]
    {
        if let Some(project_root) = dev_project_root(&current_executable) {
            state.dev_relaunch_cwd = Some(project_root.display().to_string());
            state.dev_relaunch_program = Some("npm".to_string());
            state.dev_relaunch_args = vec![
                "run".to_string(),
                "tauri".to_string(),
                "--".to_string(),
                "dev".to_string(),
            ];
        }
    }
    #[cfg(not(debug_assertions))]
    {
        state.dev_relaunch_cwd = None;
        state.dev_relaunch_program = None;
        state.dev_relaunch_args = Vec::new();
    }
    write_supervisor_state_for_app(app, &state)
}

fn start_heartbeat_loop(app: AppHandle) {
    thread::spawn(move || loop {
        let _ = touch_heartbeat(&app);
        thread::sleep(Duration::from_secs(GUARD_HEARTBEAT_INTERVAL_SECS));
    });
}

fn touch_heartbeat(app: &AppHandle) -> Result<(), String> {
    let mut state = load_supervisor_state_for_app(app)?;
    state.main_pid = Some(std::process::id());
    state.last_heartbeat_at_epoch_secs = Some(now_epoch_secs());
    write_supervisor_state_for_app(app, &state)
}

fn ensure_helper_running(app: &AppHandle) -> Result<(), String> {
    let state = load_supervisor_state_for_app(app)?;
    if state.helper_pid.is_some_and(is_process_alive) {
        return Ok(());
    }

    let current_executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let helper_executable = helper_binary_path(&current_executable);
    if !helper_executable.exists() {
        log::warn!(
            "guard helper binary was not found at {}",
            helper_executable.display()
        );
        return Ok(());
    }

    let main_executable = main_binary_path(&current_executable);
    let identifier = app.config().identifier.clone();
    if let Some(helper_pid) = find_running_helper_pid(&identifier, std::process::id()) {
        let mut state = state;
        state.helper_pid = Some(helper_pid);
        write_supervisor_state_for_app(app, &state)?;
        return Ok(());
    }

    spawn_process(
        &helper_executable,
        &helper_args(&identifier, &main_executable),
    )
}

fn parse_helper_config(args: Vec<OsString>) -> Result<HelperConfig, String> {
    let mut identifier = None;
    let mut main_executable = None;
    let mut index = 0;

    while index < args.len() {
        match args[index].to_string_lossy().as_ref() {
            "--identifier" => {
                index += 1;
                identifier = args
                    .get(index)
                    .map(PathBuf::from)
                    .map(|value| value.into_os_string().to_string_lossy().to_string());
            }
            "--main-executable" => {
                index += 1;
                main_executable = args.get(index).map(PathBuf::from);
            }
            _ => {}
        }
        index += 1;
    }

    Ok(HelperConfig {
        identifier: identifier.unwrap_or_else(|| DEFAULT_APP_IDENTIFIER.to_string()),
        main_executable: main_executable.unwrap_or_else(|| {
            main_binary_path(
                &std::env::current_exe().unwrap_or_else(|_| PathBuf::from("guard-helper")),
            )
        }),
    })
}

fn load_supervisor_state_for_app(app: &AppHandle) -> Result<GuardSupervisorState, String> {
    load_supervisor_state(&app.config().identifier)
}

fn write_supervisor_state_for_app(
    app: &AppHandle,
    state: &GuardSupervisorState,
) -> Result<(), String> {
    write_supervisor_state(&app.config().identifier, state)
}

fn load_supervisor_state(identifier: &str) -> Result<GuardSupervisorState, String> {
    let path = guard_state_path(identifier)?;
    if !path.exists() {
        return Ok(GuardSupervisorState::default());
    }

    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str::<GuardSupervisorState>(&contents).map_err(|error| error.to_string())
}

fn write_supervisor_state(identifier: &str, state: &GuardSupervisorState) -> Result<(), String> {
    let path = guard_state_path(identifier)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let contents = serde_json::to_string_pretty(state).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn can_attempt_restart(state: &mut GuardSupervisorState, now: u64) -> bool {
    match state.restart_window_started_at_epoch_secs {
        Some(start) if now.saturating_sub(start) <= GUARD_RESTART_WINDOW_SECS => {
            if state.restart_count_window >= GUARD_MAX_RESTARTS_PER_WINDOW {
                return false;
            }
            state.restart_count_window += 1;
        }
        _ => {
            state.restart_window_started_at_epoch_secs = Some(now);
            state.restart_count_window = 1;
        }
    }

    true
}

fn spawn_process(executable: &Path, args: &[OsString]) -> Result<(), String> {
    spawn_process_with_cwd(executable.as_os_str(), args, None)
}

fn spawn_process_with_cwd(
    executable: &OsStr,
    args: &[OsString],
    cwd: Option<&Path>,
) -> Result<(), String> {
    let mut command = Command::new(executable);
    command.args(args);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn helper_args(identifier: &str, main_executable: &Path) -> Vec<OsString> {
    vec![
        OsString::from("--identifier"),
        OsString::from(identifier),
        OsString::from("--main-executable"),
        main_executable.as_os_str().to_os_string(),
    ]
}

fn helper_binary_path(current_executable: &Path) -> PathBuf {
    sibling_binary_path(current_executable, HELPER_BINARY_NAME)
}

fn main_binary_path(current_executable: &Path) -> PathBuf {
    let package_name = env!("CARGO_PKG_NAME");
    sibling_binary_path(current_executable, package_name)
}

fn sibling_binary_path(current_executable: &Path, binary_name: &str) -> PathBuf {
    let mut path = if current_executable
        .file_stem()
        .and_then(|value| value.to_str())
        .is_some_and(|name| name == binary_name || name == env!("CARGO_PKG_NAME"))
    {
        current_executable
            .parent()
            .map(PathBuf::from)
            .unwrap_or_default()
    } else {
        current_executable.to_path_buf()
    };

    if path.is_file() {
        path.pop();
    }

    let extension = current_executable
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let executable_name = if extension.is_empty() {
        binary_name.to_string()
    } else {
        format!("{binary_name}.{extension}")
    };

    path.push(executable_name);
    path
}

fn dev_relaunch_command(
    state: &GuardSupervisorState,
) -> Option<(String, Vec<String>, Option<PathBuf>)> {
    let program = state.dev_relaunch_program.clone()?;
    if state.dev_relaunch_args.is_empty() {
        return None;
    }

    let cwd = state.dev_relaunch_cwd.as_ref().map(PathBuf::from);
    Some((program, state.dev_relaunch_args.clone(), cwd))
}

#[cfg(debug_assertions)]
fn dev_project_root(current_executable: &Path) -> Option<PathBuf> {
    let mut path = current_executable.parent()?.to_path_buf();
    while let Some(name) = path.file_name().and_then(|value| value.to_str()) {
        if name == "src-tauri" {
            return path.parent().map(PathBuf::from);
        }
        if !path.pop() {
            break;
        }
    }
    None
}

fn guard_state_path(identifier: &str) -> Result<PathBuf, String> {
    let mut path = app_data_directory(identifier)?;
    path.push("guard_state.json");
    Ok(path)
}

fn app_data_directory(identifier: &str) -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        let mut path =
            dirs::home_dir().ok_or_else(|| "home directory was not available".to_string())?;
        path.push("Library");
        path.push("Application Support");
        path.push(identifier);
        return Ok(path);
    }

    #[cfg(target_os = "windows")]
    {
        let mut path = dirs::data_local_dir()
            .ok_or_else(|| "local app data directory was not available".to_string())?;
        path.push(identifier);
        return Ok(path);
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let mut path =
            dirs::data_dir().ok_or_else(|| "data directory was not available".to_string())?;
        path.push(identifier);
        return Ok(path);
    }

    #[allow(unreachable_code)]
    Err("unsupported platform".to_string())
}

fn is_process_alive(pid: u32) -> bool {
    let mut system = System::new_all();
    system.refresh_processes(ProcessesToUpdate::All, true);
    system.process(Pid::from_u32(pid)).is_some()
}

fn find_running_helper_pid(identifier: &str, current_pid: u32) -> Option<u32> {
    let mut system = System::new_all();
    system.refresh_processes(ProcessesToUpdate::All, true);
    system.processes().iter().find_map(|(pid, process)| {
        let raw_pid = pid.as_u32();
        if raw_pid == current_pid {
            return None;
        }

        let command = process
            .cmd()
            .iter()
            .map(|part| part.to_string_lossy())
            .collect::<Vec<_>>();
        let is_helper = process
            .exe()
            .and_then(|path| path.file_name())
            .and_then(|name| name.to_str())
            .is_some_and(|name| name == HELPER_BINARY_NAME)
            || command
                .iter()
                .any(|part| part.ends_with(HELPER_BINARY_NAME));
        let has_identifier = command.iter().any(|part| part.as_ref() == identifier);
        (is_helper && has_identifier).then_some(raw_pid)
    })
}

fn find_running_pid_by_executable(executable: &Path, except_pid: Option<u32>) -> Option<u32> {
    let mut system = System::new_all();
    system.refresh_processes(ProcessesToUpdate::All, true);
    system.processes().iter().find_map(|(pid, process)| {
        let raw_pid = pid.as_u32();
        if except_pid == Some(raw_pid) {
            return None;
        }
        let process_exe = process.exe()?;
        paths_match(process_exe, executable).then_some(raw_pid)
    })
}

fn paths_match(left: &Path, right: &Path) -> bool {
    if left == right {
        return true;
    }
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

fn now_epoch_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn generate_session_id() -> String {
    format!("{}-{}", now_epoch_secs(), std::process::id())
}

#[cfg(target_os = "macos")]
fn sync_launch_at_login_macos(
    identifier: &str,
    executable: &Path,
    args: &[OsString],
    enabled: bool,
) -> Result<(), String> {
    let mut path =
        dirs::home_dir().ok_or_else(|| "home directory was not available".to_string())?;
    path.push("Library");
    path.push("LaunchAgents");
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    path.push(format!("{identifier}.plist"));

    if enabled {
        let contents = launch_agent_plist(identifier, executable, args);
        fs::write(path, contents).map_err(|error| error.to_string())
    } else if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())
    } else {
        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn sync_launch_at_login_windows(
    identifier: &str,
    executable: &Path,
    args: &[OsString],
    enabled: bool,
) -> Result<(), String> {
    let quoted_command = windows_command_line(executable, args);
    let mut command = Command::new("reg");

    if enabled {
        command.args([
            "add",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
            "/v",
            identifier,
            "/t",
            "REG_SZ",
            "/d",
            &quoted_command,
            "/f",
        ]);
    } else {
        command.args([
            "delete",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
            "/v",
            identifier,
            "/f",
        ]);
    }

    let output = command.output().map_err(|error| error.to_string())?;
    if output.status.success() {
        return Ok(());
    }

    if !enabled && String::from_utf8_lossy(&output.stderr).contains("unable to find") {
        return Ok(());
    }

    Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn sync_launch_at_login_linux(
    identifier: &str,
    executable: &Path,
    args: &[OsString],
    enabled: bool,
) -> Result<(), String> {
    let mut path =
        dirs::config_dir().ok_or_else(|| "config directory was not available".to_string())?;
    path.push("autostart");
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    path.push(format!("{identifier}.desktop"));

    if enabled {
        let contents = desktop_autostart_entry(identifier, executable, args);
        fs::write(path, contents).map_err(|error| error.to_string())
    } else if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())
    } else {
        Ok(())
    }
}

#[cfg(target_os = "macos")]
fn launch_agent_plist(identifier: &str, executable: &Path, args: &[OsString]) -> String {
    let arguments = std::iter::once(executable.as_os_str().to_os_string())
        .chain(args.iter().cloned())
        .map(|argument| {
            format!(
                "    <string>{}</string>",
                xml_escape(&argument.to_string_lossy())
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{identifier}</string>
  <key>ProgramArguments</key>
  <array>
{arguments}
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
"#
    )
}

#[cfg(all(unix, not(target_os = "macos")))]
fn desktop_autostart_entry(identifier: &str, executable: &Path, args: &[OsString]) -> String {
    let command = std::iter::once(executable.as_os_str().to_os_string())
        .chain(args.iter().cloned())
        .map(|argument| desktop_exec_escape(&argument.to_string_lossy()))
        .collect::<Vec<_>>()
        .join(" ");

    format!(
        "[Desktop Entry]\nType=Application\nVersion=1.0\nName=AntiProcrastinator Guard Helper\nComment=Restart AntiProcrastinator when guardrails should be active\nExec={command}\nTerminal=false\nX-GNOME-Autostart-enabled=true\nStartupWMClass={identifier}\n"
    )
}

#[cfg(target_os = "windows")]
fn windows_command_line(executable: &Path, args: &[OsString]) -> String {
    std::iter::once(executable.as_os_str().to_os_string())
        .chain(args.iter().cloned())
        .map(|argument| format!("\"{}\"", argument.to_string_lossy().replace('"', "\\\"")))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(target_os = "macos")]
fn xml_escape(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(all(unix, not(target_os = "macos")))]
fn desktop_exec_escape(input: &str) -> String {
    input.replace('\\', "\\\\").replace(' ', "\\ ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn helper_args_include_identifier_and_main_executable() {
        let args = helper_args(
            "com.antiprocrastinator.app",
            &TestPathBuf::from("/tmp/antiprocrastinator"),
        );

        assert_eq!(args[0], "--identifier");
        assert_eq!(args[1], "com.antiprocrastinator.app");
        assert_eq!(args[2], "--main-executable");
        assert_eq!(args[3], "/tmp/antiprocrastinator");
    }

    #[test]
    fn restart_window_limits_restart_attempts() {
        let mut state = GuardSupervisorState::default();
        let now = 1000;

        assert!(can_attempt_restart(&mut state, now));
        assert!(can_attempt_restart(&mut state, now + 1));
        assert!(can_attempt_restart(&mut state, now + 2));
        assert!(!can_attempt_restart(&mut state, now + 3));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn plist_includes_identifier_and_executable() {
        let plist = launch_agent_plist(
            "com.antiprocrastinator.app",
            &TestPathBuf::from("/Applications/AntiProcrastinator.app/Contents/MacOS/guard-helper"),
            &helper_args(
                "com.antiprocrastinator.app",
                &TestPathBuf::from(
                    "/Applications/AntiProcrastinator.app/Contents/MacOS/antiprocrastinator",
                ),
            ),
        );

        assert!(plist.contains("com.antiprocrastinator.app"));
        assert!(plist.contains("guard-helper"));
        assert!(plist.contains("antiprocrastinator"));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn desktop_entry_escapes_spaces() {
        let entry = desktop_autostart_entry(
            "com.antiprocrastinator.app",
            &TestPathBuf::from("/home/daniel/Apps/guard helper"),
            &helper_args(
                "com.antiprocrastinator.app",
                &TestPathBuf::from("/home/daniel/Apps/Anti Procrastinator"),
            ),
        );

        assert!(entry.contains("Exec=/home/daniel/Apps/guard\\ helper"));
        assert!(entry.contains("/home/daniel/Apps/Anti\\ Procrastinator"));
    }
}
