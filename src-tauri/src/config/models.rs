use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UserPreferences {
    pub theme: String,
    pub work_duration_minutes: u32,
    pub break_duration_minutes: u32,
    pub minimum_rest_minutes: u32,
    pub maximum_rest_multiplier: f32,
    pub process_warning_seconds: u32,
    pub process_countdown_seconds: u32,
    pub process_scan_interval_seconds: u32,
    pub notifications_enabled: bool,
    pub minimize_to_tray: bool,
    pub launch_at_login: bool,
    pub strong_guard_enabled: bool,
    pub emergency_block_max_minutes: u32,
    pub emergency_allowed_apps: Vec<String>,
}

impl Default for UserPreferences {
    fn default() -> Self {
        Self {
            theme: "minimal-dark".to_string(),
            work_duration_minutes: 90,
            break_duration_minutes: 30,
            minimum_rest_minutes: 5,
            maximum_rest_multiplier: 1.5,
            process_warning_seconds: 120,
            process_countdown_seconds: 30,
            process_scan_interval_seconds: 5,
            notifications_enabled: true,
            minimize_to_tray: true,
            launch_at_login: false,
            strong_guard_enabled: true,
            emergency_block_max_minutes: 120,
            emergency_allowed_apps: vec![],
        }
    }
}
