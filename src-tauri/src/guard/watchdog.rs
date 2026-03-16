use std::{
    ffi::OsString,
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
        }
    }
}

impl GuardState {
    pub fn new() -> Self {
        Self {
            active: Mutex::new(true),
            allow_exit_once: Mutex::new(false),
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

        let main_alive = state.main_pid.is_some_and(is_process_alive);
        let launch_grace_elapsed = state
            .last_launch_at_epoch_secs
            .is_none_or(|ts| now.saturating_sub(ts) >= GUARD_LAUNCH_GRACE_SECS);

        if !main_alive && launch_grace_elapsed && can_attempt_restart(&mut state, now) {
            let executable = state
                .main_executable_path
                .clone()
                .map(PathBuf::from)
                .unwrap_or_else(|| config.main_executable.clone());

            if executable.exists() {
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
    let mut command = Command::new(executable);
    command.args(args);
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
