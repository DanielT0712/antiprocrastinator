use serde::{Deserialize, Serialize};

use crate::schedule::models::BlockType;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClassificationAction {
    Unclassified,
    AlwaysBan,
    BanDuringWork,
    NeverBan,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EnforcementDecision {
    Allow,
    Block,
}

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
pub struct AppCategory {
    pub name: String,
    pub builtin: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnforcementProfile {
    pub name: String,
    pub parent_name: Option<String>,
    pub builtin: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnforcementProfileOverride {
    pub profile_name: String,
    pub subject_type: String,
    pub subject_key: String,
    pub decision: EnforcementDecision,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnforcementProfileInput {
    pub name: String,
    #[serde(default)]
    pub parent_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppCategoryInput {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnforcementProfileOverrideInput {
    pub profile_name: String,
    pub subject_type: String,
    pub subject_key: String,
    pub decision: EnforcementDecision,
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
pub struct FocusedWindowInfo {
    pub process_name: Option<String>,
    pub pid: Option<u32>,
    pub title: Option<String>,
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
    pub category_override: Option<String>,
    pub effective_category: Option<String>,
    pub categories: Vec<String>,
    pub classification_action: ClassificationAction,
    pub confidence: f64,
    pub classification_status: String,
    pub first_seen_at: i64,
    pub last_seen_running_at: Option<i64>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct KnownAppUpdate {
    pub display_name: Option<String>,
    pub category_override: Option<Option<String>>,
    pub category_names: Option<Vec<String>>,
    pub classification_action: Option<ClassificationAction>,
    pub classification_status: Option<String>,
    pub sync_rule: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownAppInput {
    pub display_name: String,
    #[serde(default)]
    pub executable_name: Option<String>,
    #[serde(default)]
    pub executable_path: Option<String>,
    #[serde(default)]
    pub app_path: Option<String>,
    #[serde(default)]
    pub category_names: Vec<String>,
    #[serde(default)]
    pub category_override: Option<String>,
    pub classification_action: ClassificationAction,
    #[serde(default)]
    pub sync_rule: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownBrowserTarget {
    pub target_key: String,
    pub display_name: String,
    pub keyword: String,
    pub category_name: Option<String>,
    pub confidence: f64,
    pub classification_action: ClassificationAction,
    pub builtin: bool,
    pub first_seen_at: Option<i64>,
    pub last_seen_at: Option<i64>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct KnownBrowserTargetUpdate {
    pub display_name: Option<String>,
    pub keyword: Option<String>,
    pub category_name: Option<Option<String>>,
    pub classification_action: Option<ClassificationAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownBrowserTargetInput {
    pub display_name: String,
    pub keyword: String,
    #[serde(default)]
    pub category_name: Option<String>,
    pub classification_action: ClassificationAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingClassificationBatch {
    pub apps: Vec<KnownApp>,
    pub browser_targets: Vec<KnownBrowserTarget>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: i64,
    pub entity_kind: String,
    pub entity_key: String,
    pub action: String,
    pub payload_json: Option<String>,
    pub occurred_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessWarning {
    pub process_name: String,
    pub seconds_until_kill: u32,
    #[serde(default)]
    pub warning_count: u32,
    #[serde(default)]
    pub window_title: Option<String>,
    #[serde(default)]
    pub match_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessKillFailure {
    pub process_name: String,
    pub pid: u32,
    pub reason: String,
    pub window_title: Option<String>,
    pub occurred_at: i64,
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
    #[serde(default)]
    pub active_profile: Option<String>,
    pub focused_window: Option<FocusedWindowInfo>,
    pub warnings: Vec<ProcessWarning>,
    pub last_killed_processes: Vec<String>,
    #[serde(default)]
    pub last_kill_failures: Vec<ProcessKillFailure>,
    #[serde(default, skip_serializing)]
    pub window_topmost: bool,
}

impl Default for EnforcementStatus {
    fn default() -> Self {
        Self {
            last_scan_at: None,
            active_block_type: None,
            active_profile: None,
            focused_window: None,
            warnings: vec![],
            last_killed_processes: vec![],
            last_kill_failures: vec![],
            window_topmost: false,
        }
    }
}
