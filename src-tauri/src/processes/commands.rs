use tauri::State;

use crate::db::DatabaseState;

use super::{
    categories,
    models::{
        AppCategory, AppCategoryInput, BlockedProcessLogEntry, EnforcementProfile,
        EnforcementProfileInput, EnforcementProfileOverride, EnforcementProfileOverrideInput,
        EnforcementStatus, FocusedWindowInfo, HistoryEntry, KnownApp, KnownAppInput,
        KnownAppUpdate, KnownBrowserTarget, KnownBrowserTargetInput, KnownBrowserTargetUpdate,
        PendingClassificationBatch, ProcessCategory, ProcessInfo, ProcessRule,
    },
    monitor::{self, ProcessMonitorState},
};

#[tauri::command]
pub fn get_running_processes() -> Result<Vec<ProcessInfo>, String> {
    Ok(monitor::scan_processes())
}

#[tauri::command]
pub fn get_focused_window() -> Result<Option<FocusedWindowInfo>, String> {
    monitor::get_focused_window()
}

#[tauri::command]
pub fn get_known_apps(database: State<'_, DatabaseState>) -> Result<Vec<KnownApp>, String> {
    let connection = database.connection()?;
    monitor::get_known_apps(&connection)
}

#[tauri::command]
pub fn get_emergency_allowlist(
    database: State<'_, DatabaseState>,
) -> Result<Vec<KnownApp>, String> {
    let connection = database.connection()?;
    monitor::get_emergency_allowlist(&connection)
}

#[tauri::command]
pub fn get_emergency_blocked_categories() -> Result<Vec<String>, String> {
    Ok(categories::EMERGENCY_BLOCKED_CATEGORIES
        .iter()
        .map(|name| (*name).to_string())
        .collect())
}

#[tauri::command]
pub fn refresh_known_apps_inventory(
    database: State<'_, DatabaseState>,
) -> Result<Vec<KnownApp>, String> {
    let connection = database.connection()?;
    monitor::refresh_known_apps_inventory(&connection)?;
    monitor::get_known_apps(&connection)
}

#[tauri::command]
pub fn update_known_app(
    app_key: String,
    updates: KnownAppUpdate,
    database: State<'_, DatabaseState>,
) -> Result<KnownApp, String> {
    let connection = database.connection()?;
    monitor::update_known_app(&connection, &app_key, updates)
}

#[tauri::command]
pub fn create_known_app(
    app: KnownAppInput,
    database: State<'_, DatabaseState>,
) -> Result<KnownApp, String> {
    let connection = database.connection()?;
    monitor::create_known_app(&connection, app)
}

#[tauri::command]
pub fn get_known_browser_targets(
    database: State<'_, DatabaseState>,
) -> Result<Vec<KnownBrowserTarget>, String> {
    let connection = database.connection()?;
    monitor::get_known_browser_targets(&connection)
}

#[tauri::command]
pub fn update_known_browser_target(
    target_key: String,
    updates: KnownBrowserTargetUpdate,
    database: State<'_, DatabaseState>,
) -> Result<KnownBrowserTarget, String> {
    let connection = database.connection()?;
    monitor::update_known_browser_target(&connection, &target_key, updates)
}

#[tauri::command]
pub fn create_known_browser_target(
    target: KnownBrowserTargetInput,
    database: State<'_, DatabaseState>,
) -> Result<KnownBrowserTarget, String> {
    let connection = database.connection()?;
    monitor::create_known_browser_target(&connection, target)
}

#[tauri::command]
pub fn get_pending_classifications(
    database: State<'_, DatabaseState>,
) -> Result<PendingClassificationBatch, String> {
    let connection = database.connection()?;
    monitor::get_pending_classifications(&connection)
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
pub fn get_app_categories(database: State<'_, DatabaseState>) -> Result<Vec<AppCategory>, String> {
    let connection = database.connection()?;
    monitor::get_app_categories(&connection)
}

#[tauri::command]
pub fn upsert_app_category(
    category: AppCategoryInput,
    database: State<'_, DatabaseState>,
) -> Result<AppCategory, String> {
    let connection = database.connection()?;
    monitor::upsert_app_category(&connection, category)
}

#[tauri::command]
pub fn delete_app_category(name: String, database: State<'_, DatabaseState>) -> Result<(), String> {
    let connection = database.connection()?;
    monitor::delete_app_category(&connection, &name)
}

#[tauri::command]
pub fn get_enforcement_profiles(
    database: State<'_, DatabaseState>,
) -> Result<Vec<EnforcementProfile>, String> {
    let connection = database.connection()?;
    monitor::get_enforcement_profiles(&connection)
}

#[tauri::command]
pub fn upsert_enforcement_profile(
    profile: EnforcementProfileInput,
    database: State<'_, DatabaseState>,
) -> Result<EnforcementProfile, String> {
    let connection = database.connection()?;
    monitor::upsert_enforcement_profile(&connection, profile)
}

#[tauri::command]
pub fn delete_enforcement_profile(
    name: String,
    database: State<'_, DatabaseState>,
) -> Result<(), String> {
    let connection = database.connection()?;
    monitor::delete_enforcement_profile(&connection, &name)
}

#[tauri::command]
pub fn get_enforcement_profile_overrides(
    profile_name: String,
    database: State<'_, DatabaseState>,
) -> Result<Vec<EnforcementProfileOverride>, String> {
    let connection = database.connection()?;
    monitor::get_enforcement_profile_overrides(&connection, &profile_name)
}

#[tauri::command]
pub fn set_enforcement_profile_override(
    override_entry: EnforcementProfileOverrideInput,
    database: State<'_, DatabaseState>,
) -> Result<EnforcementProfileOverride, String> {
    let connection = database.connection()?;
    monitor::set_enforcement_profile_override(&connection, override_entry)
}

#[tauri::command]
pub fn delete_enforcement_profile_override(
    profile_name: String,
    subject_type: String,
    subject_key: String,
    database: State<'_, DatabaseState>,
) -> Result<(), String> {
    let connection = database.connection()?;
    monitor::delete_enforcement_profile_override(
        &connection,
        &profile_name,
        &subject_type,
        &subject_key,
    )
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

#[tauri::command]
pub fn get_enforcement_history(
    from: i64,
    to: i64,
    database: State<'_, DatabaseState>,
) -> Result<Vec<HistoryEntry>, String> {
    let connection = database.connection()?;
    monitor::get_enforcement_history(&connection, from, to)
}
