use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection};
use sysinfo::{ProcessesToUpdate, Signal, System};
use tauri::{AppHandle, Emitter, Manager};

use crate::{
    config::manager::ConfigState,
    db::DatabaseState,
    schedule::{
        engine as schedule_engine,
        models::{BlockSource, BlockType},
    },
};

use super::{
    categories,
    models::{
        BlockedProcessLogEntry, EnforcementStatus, ProcessAction, ProcessInfo, ProcessRule,
        ProcessWarning,
    },
};

pub struct ProcessMonitorState {
    runtime: Mutex<ProcessMonitorRuntime>,
}

#[derive(Default)]
struct ProcessMonitorRuntime {
    warnings: HashMap<String, WarningState>,
    status: EnforcementStatus,
}

#[derive(Debug, Clone)]
struct WarningState {
    kill_at: i64,
    block_id: Option<i64>,
    task_id: Option<i64>,
}

pub fn new_state() -> ProcessMonitorState {
    ProcessMonitorState {
        runtime: Mutex::new(ProcessMonitorRuntime::default()),
    }
}

pub fn start_monitor_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            if let Err(error) = scan_and_enforce(&app) {
                log::error!("process monitor scan failed: {error}");
            }

            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });
}

pub fn scan_processes() -> Vec<ProcessInfo> {
    let mut system = System::new_all();
    system.refresh_processes(ProcessesToUpdate::All, true);

    system
        .processes()
        .iter()
        .map(|(pid, process)| ProcessInfo {
            pid: pid.as_u32(),
            name: process.name().to_string_lossy().to_string(),
            exe_path: process.exe().map(|path| path.display().to_string()),
            memory_bytes: process.memory(),
        })
        .collect()
}

pub fn get_process_rules(connection: &Connection) -> Result<Vec<ProcessRule>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT process_name, category, action, warn_seconds, created_at, updated_at
            FROM process_rules
            ORDER BY process_name ASC
            "#,
        )
        .map_err(|error| error.to_string())?;

    let rules = statement
        .query_map([], |row| {
            Ok(ProcessRule {
                process_name: row.get(0)?,
                category: row.get(1)?,
                action: process_action_from_str(&row.get::<_, String>(2)?)
                    .map_err(to_from_sql_error)?,
                warn_seconds: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(rules)
}

pub fn set_process_rule(connection: &Connection, rule: ProcessRule) -> Result<ProcessRule, String> {
    let normalized_name = normalize_process_name(&rule.process_name);
    if normalized_name.is_empty() {
        return Err("processName cannot be empty".to_string());
    }

    let now = timestamp_ms();
    connection
        .execute(
            r#"
            INSERT INTO process_rules (process_name, category, action, warn_seconds, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(process_name) DO UPDATE SET
                category = excluded.category,
                action = excluded.action,
                warn_seconds = excluded.warn_seconds,
                updated_at = excluded.updated_at
            "#,
            params![
                normalized_name,
                rule.category,
                process_action_to_str(rule.action),
                rule.warn_seconds,
                now,
                now
            ],
        )
        .map_err(|error| error.to_string())?;

    connection
        .query_row(
            r#"
            SELECT process_name, category, action, warn_seconds, created_at, updated_at
            FROM process_rules
            WHERE process_name = ?1
            "#,
            params![normalized_name],
            |row| {
                Ok(ProcessRule {
                    process_name: row.get(0)?,
                    category: row.get(1)?,
                    action: process_action_from_str(&row.get::<_, String>(2)?)
                        .map_err(to_from_sql_error)?,
                    warn_seconds: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

pub fn delete_process_rule(connection: &Connection, process_name: &str) -> Result<(), String> {
    let deleted = connection
        .execute(
            "DELETE FROM process_rules WHERE process_name = ?1",
            params![normalize_process_name(process_name)],
        )
        .map_err(|error| error.to_string())?;

    if deleted == 0 {
        return Err(format!("process rule for {process_name} does not exist"));
    }

    Ok(())
}

pub fn get_enforcement_status(state: &ProcessMonitorState) -> Result<EnforcementStatus, String> {
    state
        .runtime
        .lock()
        .map(|runtime| runtime.status.clone())
        .map_err(|error| error.to_string())
}

pub fn get_blocked_processes_log(
    connection: &Connection,
    from: i64,
    to: i64,
) -> Result<Vec<BlockedProcessLogEntry>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, process_name, rule_action, block_id, task_id, occurred_at
            FROM blocked_processes_log
            WHERE occurred_at >= ?1 AND occurred_at < ?2
            ORDER BY occurred_at DESC
            "#,
        )
        .map_err(|error| error.to_string())?;

    let entries = statement
        .query_map(params![from, to], |row| {
            Ok(BlockedProcessLogEntry {
                id: row.get(0)?,
                process_name: row.get(1)?,
                rule_action: process_action_from_str(&row.get::<_, String>(2)?)
                    .map_err(to_from_sql_error)?,
                block_id: row.get(3)?,
                task_id: row.get(4)?,
                occurred_at: row.get(5)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(entries)
}

fn scan_and_enforce(app: &AppHandle) -> Result<(), String> {
    let database = app.state::<DatabaseState>();
    let config = app.state::<ConfigState>();
    let schedule = app.state::<crate::schedule::engine::ScheduleState>();
    let process_state = app.state::<ProcessMonitorState>();

    let processes = scan_processes();
    let rules = {
        let connection = database.connection()?;
        get_process_rules(&connection)?
    };
    let current_block = {
        let connection = database.connection()?;
        schedule_engine::get_current_block(&connection, &schedule)?
    };
    let preferences = config.get_preferences()?;
    let active_block_type = {
        let connection = database.connection()?;
        schedule_engine::effective_enforcement_block_type(&connection, &schedule)?
    };
    let emergency_mode = current_block
        .as_ref()
        .map(|block| block.source == BlockSource::Emergency)
        .unwrap_or(false);
    let now = timestamp_ms();
    let mut runtime = process_state
        .runtime
        .lock()
        .map_err(|error| error.to_string())?;
    runtime.status.last_scan_at = Some(now);
    runtime.status.active_block_type = active_block_type;
    runtime.status.last_killed_processes.clear();

    if active_block_type != Some(BlockType::Work) && !emergency_mode {
        runtime.warnings.clear();
        runtime.status.warnings.clear();
        return Ok(());
    }

    let blocked_names: Vec<String> = processes
        .iter()
        .filter_map(|process| {
            let action = resolve_process_action(
                process,
                &rules,
                emergency_mode,
                &preferences.emergency_allowed_apps,
            );
            should_block_during_work(action).then_some(process.name.clone())
        })
        .collect();

    runtime.warnings.retain(|name, _| {
        blocked_names
            .iter()
            .any(|blocked| blocked.eq_ignore_ascii_case(name))
    });

    for process in &processes {
        let action = resolve_process_action(
            process,
            &rules,
            emergency_mode,
            &preferences.emergency_allowed_apps,
        );
        let normalized_name = normalize_process_name(&process.name);

        match action {
            ProcessAction::AlwaysAllow => {}
            ProcessAction::Warn => {
                app.emit(
                    "process-warning",
                    ProcessWarning {
                        process_name: process.name.clone(),
                        seconds_until_kill: preferences.process_warning_seconds,
                    },
                )
                .map_err(|error| error.to_string())?;
            }
            ProcessAction::AlwaysBlock
            | ProcessAction::BlockDuringWork
            | ProcessAction::AllowDuringBreak => {
                let warn_seconds = find_warn_seconds(&normalized_name, &rules)
                    .unwrap_or(preferences.process_warning_seconds);

                let warning = runtime
                    .warnings
                    .entry(normalized_name.clone())
                    .or_insert_with(|| WarningState {
                        kill_at: now + i64::from(warn_seconds) * 1_000,
                        block_id: current_block.as_ref().map(|block| block.id),
                        task_id: current_block.as_ref().and_then(|block| block.task_id),
                    });

                let seconds_until_kill = if warn_seconds == 0 {
                    0
                } else {
                    ((warning.kill_at - now).max(0) / 1_000) as u32
                };

                if warn_seconds == 0 || now >= warning.kill_at {
                    if kill_process(process.pid) {
                        let connection = database.connection()?;
                        connection
                            .execute(
                                r#"
                                INSERT INTO blocked_processes_log (process_name, rule_action, block_id, task_id, occurred_at)
                                VALUES (?1, ?2, ?3, ?4, ?5)
                                "#,
                                params![
                                    normalized_name,
                                    process_action_to_str(action),
                                    warning.block_id,
                                    warning.task_id,
                                    now
                                ],
                            )
                            .map_err(|error| error.to_string())?;

                        runtime
                            .status
                            .last_killed_processes
                            .push(process.name.clone());
                        app.emit(
                            "process-killed",
                            serde_json::json!({
                                "processName": process.name,
                                "timestamp": now
                            }),
                        )
                        .map_err(|error| error.to_string())?;
                    }
                    runtime.warnings.remove(&normalized_name);
                } else {
                    app.emit(
                        "process-warning",
                        ProcessWarning {
                            process_name: process.name.clone(),
                            seconds_until_kill,
                        },
                    )
                    .map_err(|error| error.to_string())?;
                }
            }
        }
    }

    runtime.status.warnings = runtime
        .warnings
        .iter()
        .map(|(process_name, warning)| ProcessWarning {
            process_name: process_name.clone(),
            seconds_until_kill: ((warning.kill_at - now).max(0) / 1_000) as u32,
        })
        .collect();

    Ok(())
}

fn resolve_process_action(
    process: &ProcessInfo,
    rules: &[ProcessRule],
    emergency_mode: bool,
    emergency_allowed_apps: &[String],
) -> ProcessAction {
    let normalized_name = normalize_process_name(&process.name);

    if emergency_mode
        && emergency_allowed_apps
            .iter()
            .any(|candidate| normalize_process_name(candidate) == normalized_name)
    {
        return ProcessAction::AlwaysAllow;
    }

    if let Some(rule) = rules
        .iter()
        .find(|rule| normalize_process_name(&rule.process_name) == normalized_name)
    {
        return rule.action;
    }

    for category in categories::built_in_categories() {
        if category
            .process_names
            .iter()
            .any(|candidate| normalize_process_name(candidate) == normalized_name)
        {
            return category.default_action;
        }
    }

    ProcessAction::AlwaysAllow
}

fn find_warn_seconds(process_name: &str, rules: &[ProcessRule]) -> Option<u32> {
    rules
        .iter()
        .find(|rule| normalize_process_name(&rule.process_name) == process_name)
        .and_then(|rule| rule.warn_seconds)
}

fn should_block_during_work(action: ProcessAction) -> bool {
    matches!(
        action,
        ProcessAction::AlwaysBlock
            | ProcessAction::BlockDuringWork
            | ProcessAction::AllowDuringBreak
    )
}

fn kill_process(pid: u32) -> bool {
    let mut system = System::new_all();
    system.refresh_processes(ProcessesToUpdate::All, true);
    system
        .processes()
        .iter()
        .find(|(process_pid, _)| process_pid.as_u32() == pid)
        .map(|(_, process)| process.kill_with(Signal::Kill).unwrap_or(false))
        .unwrap_or(false)
}

fn normalize_process_name(name: &str) -> String {
    name.trim().to_lowercase()
}

fn timestamp_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_millis() as i64
}

pub fn process_action_to_str(action: ProcessAction) -> &'static str {
    match action {
        ProcessAction::AlwaysBlock => "always_block",
        ProcessAction::BlockDuringWork => "block_during_work",
        ProcessAction::AllowDuringBreak => "allow_during_break",
        ProcessAction::Warn => "warn",
        ProcessAction::AlwaysAllow => "always_allow",
    }
}

pub fn process_action_from_str(value: &str) -> Result<ProcessAction, String> {
    match value {
        "always_block" => Ok(ProcessAction::AlwaysBlock),
        "block_during_work" => Ok(ProcessAction::BlockDuringWork),
        "allow_during_break" => Ok(ProcessAction::AllowDuringBreak),
        "warn" => Ok(ProcessAction::Warn),
        "always_allow" => Ok(ProcessAction::AlwaysAllow),
        _ => Err(format!("unknown process action: {value}")),
    }
}

fn to_from_sql_error(error: String) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        0,
        rusqlite::types::Type::Text,
        Box::new(std::io::Error::other(error)),
    )
}
