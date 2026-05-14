use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskKind {
    Flexible,
    Fixed,
}

impl Default for TaskKind {
    fn default() -> Self {
        TaskKind::Flexible
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecurrenceKind {
    None,
    Daily,
    Weekdays,
    Weekly,
    Once,
}

impl Default for RecurrenceKind {
    fn default() -> Self {
        RecurrenceKind::None
    }
}

pub fn task_kind_from_str(value: &str) -> TaskKind {
    match value {
        "fixed" => TaskKind::Fixed,
        _ => TaskKind::Flexible,
    }
}

pub fn task_kind_to_str(value: TaskKind) -> &'static str {
    match value {
        TaskKind::Fixed => "fixed",
        TaskKind::Flexible => "flexible",
    }
}

pub fn recurrence_kind_from_str(value: &str) -> RecurrenceKind {
    match value {
        "daily" => RecurrenceKind::Daily,
        "weekdays" => RecurrenceKind::Weekdays,
        "weekly" => RecurrenceKind::Weekly,
        "once" => RecurrenceKind::Once,
        _ => RecurrenceKind::None,
    }
}

pub fn recurrence_kind_to_str(value: RecurrenceKind) -> &'static str {
    match value {
        RecurrenceKind::None => "none",
        RecurrenceKind::Daily => "daily",
        RecurrenceKind::Weekdays => "weekdays",
        RecurrenceKind::Weekly => "weekly",
        RecurrenceKind::Once => "once",
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskGroup {
    pub id: i64,
    pub name: String,
    pub color: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: i64,
    pub name: String,
    pub group_id: Option<i64>,
    pub priority: i64,
    pub estimated_minutes: Option<i64>,
    pub deadline: Option<i64>,
    pub max_chunk_minutes: Option<i64>,
    pub min_chunk_minutes: Option<i64>,
    pub minimum_rest_minutes: Option<i64>,
    pub work_ratio: Option<i64>,
    pub rest_ratio: Option<i64>,
    pub protect_generated_blocks: bool,
    pub enforcement_profile: Option<String>,
    pub kind: TaskKind,
    pub fixed_window_start_minute: Option<i64>,
    pub fixed_window_end_minute: Option<i64>,
    pub recurrence_kind: RecurrenceKind,
    pub recurrence_days_mask: i64,
    pub recurrence_anchor_date: Option<i64>,
    #[serde(default)]
    pub recurrence_dates: Option<Vec<i64>>,
    #[serde(default)]
    pub recurrence_overrides: Option<String>,
    pub average_priority: f64,
    pub average_actual_minutes: Option<f64>,
    pub completion_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TaskFilter {
    pub group_id: Option<i64>,
    pub query: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewTask {
    pub name: String,
    #[serde(default)]
    pub group_id: Option<i64>,
    #[serde(default)]
    pub priority: Option<i64>,
    #[serde(default)]
    pub estimated_minutes: Option<i64>,
    #[serde(default)]
    pub deadline: Option<i64>,
    #[serde(default)]
    pub max_chunk_minutes: Option<i64>,
    #[serde(default)]
    pub min_chunk_minutes: Option<i64>,
    #[serde(default)]
    pub minimum_rest_minutes: Option<i64>,
    #[serde(default)]
    pub work_ratio: Option<i64>,
    #[serde(default)]
    pub rest_ratio: Option<i64>,
    #[serde(default)]
    pub protect_generated_blocks: Option<bool>,
    #[serde(default)]
    pub enforcement_profile: Option<String>,
    #[serde(default)]
    pub kind: Option<TaskKind>,
    #[serde(default)]
    pub fixed_window_start_minute: Option<i64>,
    #[serde(default)]
    pub fixed_window_end_minute: Option<i64>,
    #[serde(default)]
    pub recurrence_kind: Option<RecurrenceKind>,
    #[serde(default)]
    pub recurrence_days_mask: Option<i64>,
    #[serde(default)]
    pub recurrence_anchor_date: Option<i64>,
    #[serde(default)]
    pub recurrence_dates: Option<Vec<i64>>,
    #[serde(default)]
    pub recurrence_overrides: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TaskUpdate {
    pub name: Option<String>,
    pub group_id: Option<Option<i64>>,
    pub priority: Option<i64>,
    pub estimated_minutes: Option<Option<i64>>,
    pub deadline: Option<Option<i64>>,
    pub max_chunk_minutes: Option<Option<i64>>,
    pub min_chunk_minutes: Option<Option<i64>>,
    pub minimum_rest_minutes: Option<Option<i64>>,
    pub work_ratio: Option<Option<i64>>,
    pub rest_ratio: Option<Option<i64>>,
    pub protect_generated_blocks: Option<bool>,
    pub enforcement_profile: Option<Option<String>>,
    pub average_priority: Option<f64>,
    pub average_actual_minutes: Option<Option<f64>>,
    pub completion_count: Option<i64>,
    pub kind: Option<TaskKind>,
    pub fixed_window_start_minute: Option<Option<i64>>,
    pub fixed_window_end_minute: Option<Option<i64>>,
    pub recurrence_kind: Option<RecurrenceKind>,
    pub recurrence_days_mask: Option<i64>,
    pub recurrence_anchor_date: Option<Option<i64>>,
    pub recurrence_dates: Option<Option<Vec<i64>>>,
    pub recurrence_overrides: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskStats {
    pub task_id: i64,
    pub average_priority: f64,
    pub average_actual_minutes: Option<f64>,
    pub completion_count: i64,
}
