use tauri::{AppHandle, State};

use super::watchdog::{GuardState, GuardStatus, QuitChallenge, QUIT_CHALLENGE_PHRASE};

#[tauri::command]
pub fn request_quit(guard: State<'_, GuardState>) -> Result<QuitChallenge, String> {
    Ok(guard.request_quit())
}

#[tauri::command]
pub fn confirm_quit(
    phrase: String,
    app: AppHandle,
    guard: State<'_, GuardState>,
) -> Result<bool, String> {
    if !guard.is_active()? {
        app.exit(0);
        return Ok(true);
    }

    if phrase.trim() != QUIT_CHALLENGE_PHRASE {
        return Err("quit phrase did not match".to_string());
    }

    app.exit(0);
    Ok(true)
}

#[tauri::command]
pub fn get_guard_status(guard: State<'_, GuardState>) -> Result<GuardStatus, String> {
    Ok(GuardStatus {
        active: guard.is_active()?,
        challenge_phrase: QUIT_CHALLENGE_PHRASE.to_string(),
    })
}
