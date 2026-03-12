use tauri::State;

use crate::db::DatabaseState;

use super::{
    aggregator,
    models::{DailySummary, FocusStatPoint, ProcessKillStat, TaskCompletionStat},
};

#[tauri::command]
pub fn get_daily_summary(
    date: String,
    database: State<'_, DatabaseState>,
) -> Result<DailySummary, String> {
    let connection = database.connection()?;
    aggregator::get_daily_summary(&connection, date)
}

#[tauri::command]
pub fn get_focus_stats(
    from: i64,
    to: i64,
    database: State<'_, DatabaseState>,
) -> Result<Vec<FocusStatPoint>, String> {
    let connection = database.connection()?;
    aggregator::get_focus_stats(&connection, from, to)
}

#[tauri::command]
pub fn get_task_completion_stats(
    from: i64,
    to: i64,
    database: State<'_, DatabaseState>,
) -> Result<Vec<TaskCompletionStat>, String> {
    let connection = database.connection()?;
    aggregator::get_task_completion_stats(&connection, from, to)
}

#[tauri::command]
pub fn get_process_kill_stats(
    from: i64,
    to: i64,
    database: State<'_, DatabaseState>,
) -> Result<Vec<ProcessKillStat>, String> {
    let connection = database.connection()?;
    aggregator::get_process_kill_stats(&connection, from, to)
}
