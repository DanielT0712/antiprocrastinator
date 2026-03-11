use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailySummary {
    pub date: String,
    pub focus_minutes: i64,
    pub completed_blocks: i64,
    pub skipped_blocks: i64,
    pub tasks_completed: i64,
    pub processes_killed: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusStatPoint {
    pub date: String,
    pub focus_minutes: i64,
    pub completed_work_blocks: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskCompletionStat {
    pub task_id: i64,
    pub task_name: String,
    pub completion_count: i64,
    pub skipped_count: i64,
    pub total_focus_minutes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessKillStat {
    pub process_name: String,
    pub kill_count: i64,
    pub last_occurred_at: i64,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsEvent {
    pub id: i64,
    pub event_type: String,
    pub task_id: Option<i64>,
    pub block_id: Option<i64>,
    pub process_name: Option<String>,
    pub payload_json: Option<String>,
    pub occurred_at: i64,
}
