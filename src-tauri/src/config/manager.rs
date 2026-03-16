use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use tauri::{AppHandle, Manager, State};

use super::models::UserPreferences;
use crate::guard::watchdog;

pub struct ConfigState {
    preferences: Mutex<UserPreferences>,
    preferences_path: PathBuf,
}

impl ConfigState {
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        let preferences_path = preferences_path(app)?;

        if let Some(parent) = preferences_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }

        let preferences = load_or_create_preferences(&preferences_path)?;

        if let Err(error) = watchdog::sync_launch_at_login(app, preferences.launch_at_login) {
            log::warn!("failed to sync launch-at-login during startup: {error}");
        }

        Ok(Self {
            preferences: Mutex::new(preferences),
            preferences_path,
        })
    }

    pub fn get_preferences(&self) -> Result<UserPreferences, String> {
        self.preferences
            .lock()
            .map(|preferences| preferences.clone())
            .map_err(|error| error.to_string())
    }

    pub fn update_preferences(
        &self,
        app: &AppHandle,
        preferences: UserPreferences,
    ) -> Result<UserPreferences, String> {
        let current = self.get_preferences()?;

        if current.launch_at_login != preferences.launch_at_login {
            watchdog::sync_launch_at_login(app, preferences.launch_at_login)?;
        }

        write_preferences(&self.preferences_path, &preferences)?;

        let mut guard = self.preferences.lock().map_err(|error| error.to_string())?;
        *guard = preferences.clone();

        Ok(preferences)
    }
}

#[tauri::command]
pub fn get_preferences(config: State<'_, ConfigState>) -> Result<UserPreferences, String> {
    config.get_preferences()
}

#[tauri::command]
pub fn update_preferences(
    preferences: UserPreferences,
    app: AppHandle,
    config: State<'_, ConfigState>,
) -> Result<UserPreferences, String> {
    config.update_preferences(&app, preferences)
}

fn preferences_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    path.push("preferences.json");
    Ok(path)
}

fn load_or_create_preferences(path: &Path) -> Result<UserPreferences, String> {
    if path.exists() {
        let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
        let preferences = serde_json::from_str::<UserPreferences>(&contents)
            .map_err(|error| error.to_string())?;
        return Ok(preferences);
    }

    let defaults = UserPreferences::default();
    write_preferences(path, &defaults)?;
    Ok(defaults)
}

fn write_preferences(path: &Path, preferences: &UserPreferences) -> Result<(), String> {
    let json = serde_json::to_string_pretty(preferences).map_err(|error| error.to_string())?;
    fs::write(path, json).map_err(|error| error.to_string())
}
