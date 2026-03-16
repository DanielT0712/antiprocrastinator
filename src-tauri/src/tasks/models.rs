use serde::{Deserialize, Serialize};

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
    pub work_ratio: Option<i64>,
    pub rest_ratio: Option<i64>,
    pub protect_generated_blocks: bool,
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
    pub work_ratio: Option<i64>,
    #[serde(default)]
    pub rest_ratio: Option<i64>,
    #[serde(default)]
    pub protect_generated_blocks: Option<bool>,
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
    pub work_ratio: Option<Option<i64>>,
    pub rest_ratio: Option<Option<i64>>,
    pub protect_generated_blocks: Option<bool>,
    pub average_priority: Option<f64>,
    pub average_actual_minutes: Option<Option<f64>>,
    pub completion_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskStats {
    pub task_id: i64,
    pub average_priority: f64,
    pub average_actual_minutes: Option<f64>,
    pub completion_count: i64,
}
