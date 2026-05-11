use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskGroupClusteringMode {
    Priority,
    GroupSameGroupTasks,
    SeparateSameGroupTasks,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskChunkClusteringMode {
    GroupSameTaskChunks,
    SeparateSameTaskChunks,
}

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
    pub browser_title_allow_keywords: Vec<String>,
    pub browser_title_block_keywords: Vec<String>,
    pub classification_popups_enabled: bool,
    pub task_group_clustering: TaskGroupClusteringMode,
    pub task_chunk_clustering: TaskChunkClusteringMode,
    pub clustering_allows_priority_inversions: bool,
    pub fill_dead_gaps: bool,
    pub guard_restart_delay_seconds: u32,
    pub suspend_phrase: String,
    pub suspend_cooldown_minutes: u32,
}

impl Default for UserPreferences {
    fn default() -> Self {
        Self {
            theme: "minimal-dark".to_string(),
            work_duration_minutes: 90,
            break_duration_minutes: 30,
            minimum_rest_minutes: 5,
            maximum_rest_multiplier: 1.5,
            process_warning_seconds: 30,
            process_countdown_seconds: 30,
            process_scan_interval_seconds: 5,
            notifications_enabled: true,
            minimize_to_tray: true,
            launch_at_login: false,
            strong_guard_enabled: true,
            emergency_block_max_minutes: 120,
            emergency_allowed_apps: vec![],
            browser_title_allow_keywords: vec![],
            browser_title_block_keywords: vec![],
            classification_popups_enabled: true,
            task_group_clustering: TaskGroupClusteringMode::Priority,
            task_chunk_clustering: TaskChunkClusteringMode::GroupSameTaskChunks,
            clustering_allows_priority_inversions: true,
            fill_dead_gaps: true,
            guard_restart_delay_seconds: 3,
            suspend_phrase: "suspend".to_string(),
            suspend_cooldown_minutes: 60,
        }
    }
}
