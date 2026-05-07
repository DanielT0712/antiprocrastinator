use tauri::State;

use crate::db::DatabaseState;

use super::{
    models::{NewTask, Task, TaskFilter, TaskGroup, TaskStats, TaskUpdate},
    repository,
};

#[tauri::command]
pub fn get_tasks(
    filter: Option<TaskFilter>,
    database: State<'_, DatabaseState>,
) -> Result<Vec<Task>, String> {
    let connection = database.connection()?;
    repository::get_tasks(&connection, filter)
}

#[tauri::command]
pub fn search_tasks(
    query: String,
    database: State<'_, DatabaseState>,
) -> Result<Vec<Task>, String> {
    let connection = database.connection()?;
    repository::search_tasks(&connection, &query)
}

#[tauri::command]
pub fn create_task(task: NewTask, database: State<'_, DatabaseState>) -> Result<Task, String> {
    let connection = database.connection()?;
    repository::create_task(&connection, task)
}

#[tauri::command]
pub fn update_task(
    id: i64,
    updates: TaskUpdate,
    database: State<'_, DatabaseState>,
) -> Result<Task, String> {
    let connection = database.connection()?;
    repository::update_task(&connection, id, updates)
}

#[tauri::command]
pub fn delete_task(id: i64, database: State<'_, DatabaseState>) -> Result<(), String> {
    let connection = database.connection()?;
    repository::delete_task(&connection, id)
}

#[tauri::command]
pub fn get_task_groups(database: State<'_, DatabaseState>) -> Result<Vec<TaskGroup>, String> {
    let connection = database.connection()?;
    repository::get_task_groups(&connection)
}

#[tauri::command]
pub fn create_task_group(
    name: String,
    color: Option<String>,
    database: State<'_, DatabaseState>,
) -> Result<TaskGroup, String> {
    let connection = database.connection()?;
    repository::create_task_group(&connection, &name, color)
}

#[tauri::command]
pub fn update_task_group(
    id: i64,
    name: Option<String>,
    color: Option<Option<String>>,
    database: State<'_, DatabaseState>,
) -> Result<TaskGroup, String> {
    let connection = database.connection()?;
    repository::update_task_group(&connection, id, name, color)
}

#[tauri::command]
pub fn delete_task_group(
    id: i64,
    reassign_to: Option<i64>,
    database: State<'_, DatabaseState>,
) -> Result<(), String> {
    let connection = database.connection()?;
    repository::delete_task_group(&connection, id, reassign_to)
}

#[tauri::command]
pub fn get_task_stats(
    task_id: i64,
    database: State<'_, DatabaseState>,
) -> Result<TaskStats, String> {
    let connection = database.connection()?;
    repository::get_task_stats(&connection, task_id)
}
