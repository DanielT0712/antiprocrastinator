use tauri::State;

use crate::db::DatabaseState;

use super::{
    categories,
    models::{
        BlockedProcessLogEntry, EnforcementStatus, ProcessCategory, ProcessInfo, ProcessRule,
    },
    monitor::{self, ProcessMonitorState},
};

#[tauri::command]
pub fn get_running_processes() -> Result<Vec<ProcessInfo>, String> {
    Ok(monitor::scan_processes())
}

#[tauri::command]
pub fn get_process_rules(database: State<'_, DatabaseState>) -> Result<Vec<ProcessRule>, String> {
    let connection = database.connection()?;
    monitor::get_process_rules(&connection)
}

#[tauri::command]
pub fn set_process_rule(
    rule: ProcessRule,
    database: State<'_, DatabaseState>,
) -> Result<ProcessRule, String> {
    let connection = database.connection()?;
    monitor::set_process_rule(&connection, rule)
}

#[tauri::command]
pub fn delete_process_rule(
    process_name: String,
    database: State<'_, DatabaseState>,
) -> Result<(), String> {
    let connection = database.connection()?;
    monitor::delete_process_rule(&connection, &process_name)
}

#[tauri::command]
pub fn get_process_categories() -> Result<Vec<ProcessCategory>, String> {
    Ok(categories::built_in_categories())
}

#[tauri::command]
pub fn get_enforcement_status(
    monitor_state: State<'_, ProcessMonitorState>,
) -> Result<EnforcementStatus, String> {
    monitor::get_enforcement_status(&monitor_state)
}

#[tauri::command]
pub fn get_blocked_processes_log(
    from: i64,
    to: i64,
    database: State<'_, DatabaseState>,
) -> Result<Vec<BlockedProcessLogEntry>, String> {
    let connection = database.connection()?;
    monitor::get_blocked_processes_log(&connection, from, to)
}
