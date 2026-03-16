use tauri::State;

use crate::{config::manager::ConfigState, db::DatabaseState};

use super::{
    engine,
    models::{
        EmergencyBlockRequest, NewTimeBlock, ScheduleActionResult, ScheduleRebuildResult,
        TimeBlock, TimeBlockUpdate, WeeklyTemplate,
    },
};

#[tauri::command]
pub fn get_current_block(
    database: State<'_, DatabaseState>,
    schedule: State<'_, engine::ScheduleState>,
) -> Result<Option<TimeBlock>, String> {
    let connection = database.connection()?;
    engine::get_current_block(&connection, &schedule)
}

#[tauri::command]
pub fn get_next_block(
    database: State<'_, DatabaseState>,
    schedule: State<'_, engine::ScheduleState>,
) -> Result<Option<TimeBlock>, String> {
    let connection = database.connection()?;
    engine::get_next_block(&connection, &schedule)
}

#[tauri::command]
pub fn get_schedule_range(
    from: i64,
    to: i64,
    database: State<'_, DatabaseState>,
) -> Result<Vec<TimeBlock>, String> {
    let connection = database.connection()?;
    engine::get_schedule_range(&connection, from, to)
}

#[tauri::command]
pub fn add_time_block(
    block: NewTimeBlock,
    database: State<'_, DatabaseState>,
) -> Result<TimeBlock, String> {
    let connection = database.connection()?;
    engine::add_time_block(&connection, block)
}

#[tauri::command]
pub fn update_time_block(
    id: i64,
    updates: TimeBlockUpdate,
    database: State<'_, DatabaseState>,
) -> Result<TimeBlock, String> {
    let connection = database.connection()?;
    engine::update_time_block(&connection, id, updates)
}

#[tauri::command]
pub fn delete_time_block(id: i64, database: State<'_, DatabaseState>) -> Result<(), String> {
    let connection = database.connection()?;
    engine::delete_time_block(&connection, id)
}

#[tauri::command]
pub fn apply_weekly_template(
    template: WeeklyTemplate,
    from: i64,
    to: i64,
    database: State<'_, DatabaseState>,
) -> Result<Vec<TimeBlock>, String> {
    let connection = database.connection()?;
    engine::apply_weekly_template(&connection, template, from, to)
}

#[tauri::command]
pub fn get_weekly_template(
    database: State<'_, DatabaseState>,
) -> Result<Option<WeeklyTemplate>, String> {
    let connection = database.connection()?;
    engine::get_weekly_template(&connection)
}

#[tauri::command]
pub fn save_weekly_template(
    template: WeeklyTemplate,
    database: State<'_, DatabaseState>,
) -> Result<WeeklyTemplate, String> {
    let connection = database.connection()?;
    engine::save_weekly_template(&connection, template)
}

#[tauri::command]
pub fn complete_current_block(
    database: State<'_, DatabaseState>,
    schedule: State<'_, engine::ScheduleState>,
    config: State<'_, ConfigState>,
) -> Result<ScheduleActionResult, String> {
    let connection = database.connection()?;
    let preferences = config.get_preferences()?;
    engine::complete_current_block(&connection, &schedule, &preferences)
}

#[tauri::command]
pub fn skip_current_block(
    database: State<'_, DatabaseState>,
    schedule: State<'_, engine::ScheduleState>,
) -> Result<Option<TimeBlock>, String> {
    let connection = database.connection()?;
    engine::skip_current_block(&connection, &schedule)
}

#[tauri::command]
pub fn extend_current_block(
    minutes: i64,
    database: State<'_, DatabaseState>,
    schedule: State<'_, engine::ScheduleState>,
    config: State<'_, ConfigState>,
) -> Result<ScheduleActionResult, String> {
    let connection = database.connection()?;
    let preferences = config.get_preferences()?;
    engine::extend_current_block(&connection, &schedule, &preferences, minutes)
}

#[tauri::command]
pub fn pause_current_block(
    database: State<'_, DatabaseState>,
    schedule: State<'_, engine::ScheduleState>,
    config: State<'_, ConfigState>,
) -> Result<ScheduleActionResult, String> {
    let connection = database.connection()?;
    let preferences = config.get_preferences()?;
    engine::pause_current_block(&connection, &schedule, &preferences)
}

#[tauri::command]
pub fn resume_current_block(
    database: State<'_, DatabaseState>,
    schedule: State<'_, engine::ScheduleState>,
    config: State<'_, ConfigState>,
) -> Result<ScheduleActionResult, String> {
    let connection = database.connection()?;
    let preferences = config.get_preferences()?;
    engine::resume_current_block(&connection, &schedule, &preferences)
}

#[tauri::command]
pub fn start_emergency_block(
    request: EmergencyBlockRequest,
    database: State<'_, DatabaseState>,
    schedule: State<'_, engine::ScheduleState>,
    config: State<'_, ConfigState>,
) -> Result<ScheduleActionResult, String> {
    let connection = database.connection()?;
    let preferences = config.get_preferences()?;
    engine::start_emergency_block(&connection, &schedule, &preferences, request)
}

#[tauri::command]
pub fn rebuild_schedule(
    from: Option<i64>,
    database: State<'_, DatabaseState>,
    config: State<'_, ConfigState>,
) -> Result<ScheduleRebuildResult, String> {
    let connection = database.connection()?;
    let preferences = config.get_preferences()?;
    engine::rebuild_schedule(
        &connection,
        from.unwrap_or_else(engine::now_ms),
        &preferences,
    )
}
