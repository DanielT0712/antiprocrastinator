use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BlockType {
    Work,
    Break,
    Sleep,
    Meal,
    Custom,
}

impl BlockType {
    pub fn default_title(self) -> &'static str {
        match self {
            Self::Work => "Work",
            Self::Break => "Break",
            Self::Sleep => "Sleep",
            Self::Meal => "Meal",
            Self::Custom => "Custom",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BlockStatus {
    Scheduled,
    Active,
    Completed,
    Skipped,
    Paused,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BlockSource {
    Manual,
    Template,
    Planner,
    Emergency,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeBlock {
    pub id: i64,
    pub title: String,
    pub block_type: BlockType,
    pub start_time: i64,
    pub end_time: i64,
    pub task_id: Option<i64>,
    pub status: BlockStatus,
    pub intensity: u8,
    pub source: BlockSource,
    pub is_protected: bool,
    pub enforcement_profile: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleWarning {
    pub kind: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleMutation {
    pub kind: String,
    pub block_id: Option<i64>,
    pub task_id: Option<i64>,
    #[serde(default)]
    pub before: Option<TimeBlock>,
    #[serde(default)]
    pub after: Option<TimeBlock>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleMutationResult {
    pub current_block: Option<TimeBlock>,
    #[serde(default)]
    pub blocks: Vec<TimeBlock>,
    pub warnings: Vec<ScheduleWarning>,
    #[serde(default)]
    pub pseudo_deadline: Option<i64>,
    #[serde(default)]
    pub mutations: Vec<ScheduleMutation>,
}

pub type ScheduleActionResult = ScheduleMutationResult;
pub type ScheduleRebuildResult = ScheduleMutationResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleMutationHistoryEntry {
    pub id: i64,
    pub action: String,
    pub payload_json: String,
    pub occurred_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockDecisionPrompt {
    pub block: TimeBlock,
    pub next_work_start: Option<i64>,
    pub continuing: bool,
}

impl TimeBlock {
    pub fn duration_secs(&self) -> i64 {
        ((self.end_time - self.start_time) / 1_000).max(0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewTimeBlock {
    pub title: String,
    pub block_type: BlockType,
    pub start_time: i64,
    pub end_time: i64,
    #[serde(default)]
    pub task_id: Option<i64>,
    #[serde(default = "default_intensity")]
    pub intensity: u8,
    #[serde(default)]
    pub source: Option<BlockSource>,
    #[serde(default)]
    pub is_protected: Option<bool>,
    #[serde(default)]
    pub enforcement_profile: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TimeBlockUpdate {
    pub title: Option<String>,
    pub block_type: Option<BlockType>,
    pub start_time: Option<i64>,
    pub end_time: Option<i64>,
    pub task_id: Option<Option<i64>>,
    pub status: Option<BlockStatus>,
    pub intensity: Option<u8>,
    pub source: Option<BlockSource>,
    pub is_protected: Option<bool>,
    pub enforcement_profile: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerTickPayload {
    pub remaining_secs: i64,
    pub total_secs: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmergencyBlockRequest {
    #[serde(default)]
    pub title: Option<String>,
    pub duration_minutes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyTemplate {
    #[serde(default = "default_work_minutes")]
    pub default_work_minutes: u16,
    #[serde(default = "default_break_minutes")]
    pub default_break_minutes: u16,
    #[serde(default)]
    pub days: Vec<DayTemplate>,
    #[serde(default)]
    pub fixed_blocks: Vec<FixedTemplateBlock>,
}

impl Default for WeeklyTemplate {
    fn default() -> Self {
        Self {
            default_work_minutes: default_work_minutes(),
            default_break_minutes: default_break_minutes(),
            days: Weekday::all()
                .into_iter()
                .map(|day| DayTemplate {
                    day,
                    enabled: true,
                    sleep_start_minute: Some(23 * 60),
                    sleep_end_minute: Some(7 * 60),
                    work_minutes: None,
                    break_minutes: None,
                })
                .collect(),
            fixed_blocks: vec![],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayTemplate {
    pub day: Weekday,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub sleep_start_minute: Option<u16>,
    #[serde(default)]
    pub sleep_end_minute: Option<u16>,
    #[serde(default)]
    pub work_minutes: Option<u16>,
    #[serde(default)]
    pub break_minutes: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FixedTemplateBlock {
    pub title: String,
    pub block_type: BlockType,
    pub days_of_week: Vec<Weekday>,
    pub start_minute: u16,
    pub duration_minutes: u16,
    #[serde(default = "default_intensity")]
    pub intensity: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Weekday {
    Monday,
    Tuesday,
    Wednesday,
    Thursday,
    Friday,
    Saturday,
    Sunday,
}

impl Weekday {
    pub fn all() -> [Self; 7] {
        [
            Self::Monday,
            Self::Tuesday,
            Self::Wednesday,
            Self::Thursday,
            Self::Friday,
            Self::Saturday,
            Self::Sunday,
        ]
    }
}

fn default_true() -> bool {
    true
}

fn default_intensity() -> u8 {
    3
}

fn default_work_minutes() -> u16 {
    90
}

fn default_break_minutes() -> u16 {
    30
}
