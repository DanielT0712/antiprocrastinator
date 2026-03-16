use serde::{Deserialize, Serialize};

use crate::schedule::models::BlockType;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProcessAction {
    AlwaysBlock,
    BlockDuringWork,
    AllowDuringBreak,
    Warn,
    AlwaysAllow,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessRule {
    pub process_name: String,
    pub category: Option<String>,
    pub action: ProcessAction,
    pub warn_seconds: Option<u32>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessCategory {
    pub name: String,
    pub process_names: Vec<String>,
    pub default_action: ProcessAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub exe_path: Option<String>,
    pub memory_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownApp {
    pub app_key: String,
    pub display_name: String,
    pub executable_name: Option<String>,
    pub executable_path: Option<String>,
    pub app_path: Option<String>,
    pub platform: String,
    pub source: String,
    pub category_guess: Option<String>,
    pub confidence: f64,
    pub classification_status: String,
    pub first_seen_at: i64,
    pub last_seen_running_at: Option<i64>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessWarning {
    pub process_name: String,
    pub seconds_until_kill: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockedProcessLogEntry {
    pub id: i64,
    pub process_name: String,
    pub rule_action: ProcessAction,
    pub block_id: Option<i64>,
    pub task_id: Option<i64>,
    pub occurred_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnforcementStatus {
    pub last_scan_at: Option<i64>,
    pub active_block_type: Option<BlockType>,
    pub warnings: Vec<ProcessWarning>,
    pub last_killed_processes: Vec<String>,
}

impl Default for EnforcementStatus {
    fn default() -> Self {
        Self {
            last_scan_at: None,
            active_block_type: None,
            warnings: vec![],
            last_killed_processes: vec![],
        }
    }
}
