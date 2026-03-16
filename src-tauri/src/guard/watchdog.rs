use std::{fs, sync::Mutex};

#[cfg(test)]
use std::path::PathBuf;
#[cfg(target_os = "windows")]
use std::process::Command;

use serde::{Deserialize, Serialize};
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

pub struct GuardState {
    active: Mutex<bool>,
    allow_exit_once: Mutex<bool>,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuitRequiredEvent {
    pub source: String,
    pub minimized_to_tray: bool,
    pub warning: String,
    pub required_phrase: String,
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
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let identifier = app.config().identifier.clone();

    #[cfg(target_os = "macos")]
    {
        return sync_launch_at_login_macos(&identifier, &executable, enabled);
    }

    #[cfg(target_os = "windows")]
    {
        return sync_launch_at_login_windows(&identifier, &executable, enabled);
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        return sync_launch_at_login_linux(&identifier, &executable, enabled);
    }

    #[allow(unreachable_code)]
    Ok(())
}

#[cfg(target_os = "macos")]
fn sync_launch_at_login_macos(
    identifier: &str,
    executable: &std::path::Path,
    enabled: bool,
) -> Result<(), String> {
    let mut path =
        dirs::home_dir().ok_or_else(|| "home directory was not available".to_string())?;
    path.push("Library");
    path.push("LaunchAgents");
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    path.push(format!("{identifier}.plist"));

    if enabled {
        let contents = launch_agent_plist(identifier, executable);
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
    executable: &std::path::Path,
    enabled: bool,
) -> Result<(), String> {
    let value_name = identifier;
    let quoted_exe = format!("\"{}\"", executable.display());
    let mut command = Command::new("reg");

    if enabled {
        command.args([
            "add",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
            "/v",
            value_name,
            "/t",
            "REG_SZ",
            "/d",
            &quoted_exe,
            "/f",
        ]);
    } else {
        command.args([
            "delete",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
            "/v",
            value_name,
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
    executable: &std::path::Path,
    enabled: bool,
) -> Result<(), String> {
    let mut path =
        dirs::config_dir().ok_or_else(|| "config directory was not available".to_string())?;
    path.push("autostart");
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    path.push(format!("{identifier}.desktop"));

    if enabled {
        let contents = desktop_autostart_entry(identifier, executable);
        fs::write(path, contents).map_err(|error| error.to_string())
    } else if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())
    } else {
        Ok(())
    }
}

#[cfg(target_os = "macos")]
fn launch_agent_plist(identifier: &str, executable: &std::path::Path) -> String {
    let executable = xml_escape(&executable.display().to_string());
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{identifier}</string>
  <key>ProgramArguments</key>
  <array>
    <string>{executable}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
"#
    )
}

#[cfg(all(unix, not(target_os = "macos")))]
fn desktop_autostart_entry(identifier: &str, executable: &std::path::Path) -> String {
    format!(
        "[Desktop Entry]\nType=Application\nVersion=1.0\nName=AntiProcrastinator\nComment=Keep AntiProcrastinator running at login\nExec={}\nTerminal=false\nX-GNOME-Autostart-enabled=true\nStartupWMClass={}\n",
        desktop_exec_escape(&executable.display().to_string()),
        identifier
    )
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

    #[cfg(target_os = "macos")]
    #[test]
    fn plist_includes_identifier_and_executable() {
        let plist = launch_agent_plist(
            "com.antiprocrastinator.app",
            &PathBuf::from(
                "/Applications/AntiProcrastinator.app/Contents/MacOS/AntiProcrastinator",
            ),
        );

        assert!(plist.contains("com.antiprocrastinator.app"));
        assert!(plist.contains("AntiProcrastinator.app"));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn desktop_entry_escapes_spaces() {
        let entry = desktop_autostart_entry(
            "com.antiprocrastinator.app",
            &PathBuf::from("/home/daniel/Apps/Anti Procrastinator"),
        );

        assert!(entry.contains("Exec=/home/daniel/Apps/Anti\\ Procrastinator"));
    }
}
