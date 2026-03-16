use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection, OptionalExtension};
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
        BlockedProcessLogEntry, EnforcementStatus, FocusedWindowInfo, KnownApp, ProcessAction,
        ProcessInfo, ProcessRule, ProcessWarning,
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
    pid: Option<u32>,
    process_name: String,
    window_title: Option<String>,
    match_reason: Option<String>,
}

#[derive(Debug, Clone)]
struct DiscoveredApp {
    app_key: String,
    display_name: String,
    executable_name: Option<String>,
    executable_path: Option<String>,
    app_path: Option<String>,
    platform: String,
    source: String,
    category_guess: Option<String>,
    confidence: f64,
}

#[derive(Debug, Clone)]
struct EnforcementCandidate {
    key: String,
    process_name: String,
    window_title: Option<String>,
    match_reason: Option<String>,
    pid: u32,
    action: ProcessAction,
}

#[derive(Debug, Clone)]
struct BrowserTitleMatch {
    decision: BrowserTitleDecision,
    reason: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BrowserTitleDecision {
    NoMatch,
    Allow,
    Block,
}

pub fn new_state() -> ProcessMonitorState {
    ProcessMonitorState {
        runtime: Mutex::new(ProcessMonitorRuntime::default()),
    }
}

pub fn start_monitor_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = refresh_known_apps_from_app(&app) {
            log::error!("initial known app refresh failed: {error}");
        }

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

pub fn get_focused_window() -> Result<Option<FocusedWindowInfo>, String> {
    focused_window_for_platform()
}

pub fn get_known_apps(connection: &Connection) -> Result<Vec<KnownApp>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT app_key, display_name, executable_name, executable_path, app_path,
                   platform, source, category_guess, confidence, classification_status,
                   first_seen_at, last_seen_running_at, updated_at
            FROM known_apps
            ORDER BY classification_status ASC, display_name ASC
            "#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok(KnownApp {
                app_key: row.get(0)?,
                display_name: row.get(1)?,
                executable_name: row.get(2)?,
                executable_path: row.get(3)?,
                app_path: row.get(4)?,
                platform: row.get(5)?,
                source: row.get(6)?,
                category_guess: row.get(7)?,
                confidence: row.get(8)?,
                classification_status: row.get(9)?,
                first_seen_at: row.get(10)?,
                last_seen_running_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

pub fn refresh_known_apps_inventory(connection: &Connection) -> Result<(), String> {
    let discovered = discover_installed_apps();
    for app in discovered {
        upsert_known_app(connection, &app, None)?;
    }
    Ok(())
}

fn refresh_known_apps_from_app(app: &AppHandle) -> Result<(), String> {
    let database = app.state::<DatabaseState>();
    let connection = database.connection()?;
    refresh_known_apps_inventory(&connection)
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

struct UpsertOutcome {
    inserted: bool,
    classification_status: String,
}

fn upsert_known_app(
    connection: &Connection,
    app: &DiscoveredApp,
    last_seen_running_at: Option<i64>,
) -> Result<UpsertOutcome, String> {
    let existing = connection
        .query_row(
            "SELECT classification_status FROM known_apps WHERE app_key = ?1",
            params![app.app_key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let inserted = existing.is_none();
    let now = timestamp_ms();
    let classification_status = existing.unwrap_or_else(|| "unclassified".to_string());

    connection
        .execute(
            r#"
            INSERT INTO known_apps (
                app_key, display_name, executable_name, executable_path, app_path,
                platform, source, category_guess, confidence, classification_status,
                first_seen_at, last_seen_running_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
            ON CONFLICT(app_key) DO UPDATE SET
                display_name = excluded.display_name,
                executable_name = COALESCE(excluded.executable_name, known_apps.executable_name),
                executable_path = COALESCE(excluded.executable_path, known_apps.executable_path),
                app_path = COALESCE(excluded.app_path, known_apps.app_path),
                platform = excluded.platform,
                source = excluded.source,
                category_guess = COALESCE(known_apps.category_guess, excluded.category_guess),
                confidence = MAX(known_apps.confidence, excluded.confidence),
                last_seen_running_at = COALESCE(excluded.last_seen_running_at, known_apps.last_seen_running_at),
                updated_at = excluded.updated_at
            "#,
            params![
                app.app_key,
                app.display_name,
                app.executable_name,
                app.executable_path,
                app.app_path,
                app.platform,
                app.source,
                app.category_guess,
                app.confidence,
                classification_status,
                now,
                last_seen_running_at,
                now
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(UpsertOutcome {
        inserted,
        classification_status,
    })
}

fn running_app_candidate(process: &ProcessInfo) -> DiscoveredApp {
    let display_name = executable_display_name(process);
    let executable_name = process
        .exe_path
        .as_deref()
        .and_then(|path| Path::new(path).file_name())
        .map(|name| name.to_string_lossy().to_string())
        .or_else(|| Some(process.name.clone()));
    let (category_guess, confidence) =
        classify_app_candidate(&display_name, process.exe_path.as_deref());
    DiscoveredApp {
        app_key: app_key_for(
            &display_name,
            executable_name.as_deref(),
            process.exe_path.as_deref(),
        ),
        display_name,
        executable_name,
        executable_path: process.exe_path.clone(),
        app_path: process.exe_path.clone(),
        platform: std::env::consts::OS.to_string(),
        source: "running_detected".to_string(),
        category_guess,
        confidence,
    }
}

fn discover_installed_apps() -> Vec<DiscoveredApp> {
    let mut apps = Vec::new();
    let mut seen = HashSet::new();

    for candidate in discover_installed_apps_for_platform() {
        if seen.insert(candidate.app_key.clone()) {
            apps.push(candidate);
        }
    }

    apps
}

#[cfg(target_os = "macos")]
fn discover_installed_apps_for_platform() -> Vec<DiscoveredApp> {
    let mut apps = Vec::new();
    let mut roots = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/System/Applications"),
    ];
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join("Applications"));
    }

    for root in roots {
        collect_app_bundles(&root, &mut apps);
    }

    apps
}

#[cfg(target_os = "windows")]
fn discover_installed_apps_for_platform() -> Vec<DiscoveredApp> {
    let mut apps = Vec::new();
    let mut roots = Vec::new();

    for key in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
        if let Ok(value) = std::env::var(key) {
            let path = PathBuf::from(value);
            if key == "LOCALAPPDATA" {
                roots.push(path.join("Programs"));
            } else {
                roots.push(path);
            }
        }
    }
    if let Ok(program_data) = std::env::var("ProgramData") {
        roots.push(PathBuf::from(program_data).join("Microsoft/Windows/Start Menu/Programs"));
    }
    if let Ok(app_data) = std::env::var("APPDATA") {
        roots.push(PathBuf::from(app_data).join("Microsoft/Windows/Start Menu/Programs"));
    }

    for root in roots {
        collect_windows_apps(&root, &mut apps);
    }

    apps
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn discover_installed_apps_for_platform() -> Vec<DiscoveredApp> {
    vec![]
}

#[cfg(target_os = "macos")]
fn collect_app_bundles(root: &Path, apps: &mut Vec<DiscoveredApp>) {
    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("app") {
                continue;
            }
            let Some(display_name) = path
                .file_stem()
                .map(|name| name.to_string_lossy().to_string())
            else {
                continue;
            };
            let path_str = path.display().to_string();
            let (category_guess, confidence) =
                classify_app_candidate(&display_name, Some(&path_str));
            apps.push(DiscoveredApp {
                app_key: app_key_for(&display_name, Some(&display_name), Some(&path_str)),
                display_name: display_name.clone(),
                executable_name: Some(display_name.clone()),
                executable_path: None,
                app_path: Some(path_str),
                platform: "macos".to_string(),
                source: "installed_scan".to_string(),
                category_guess,
                confidence,
            });
        }
    }
}

#[cfg(target_os = "windows")]
fn collect_windows_apps(root: &Path, apps: &mut Vec<DiscoveredApp>) {
    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            let display_name = if path.is_dir() {
                path.file_name()
                    .map(|name| name.to_string_lossy().to_string())
            } else {
                path.file_stem()
                    .map(|name| name.to_string_lossy().to_string())
            };
            let Some(display_name) = display_name.filter(|name| !name.trim().is_empty()) else {
                continue;
            };
            let path_str = path.display().to_string();
            let (category_guess, confidence) =
                classify_app_candidate(&display_name, Some(&path_str));
            apps.push(DiscoveredApp {
                app_key: app_key_for(&display_name, Some(&display_name), Some(&path_str)),
                display_name: display_name.clone(),
                executable_name: path
                    .file_name()
                    .map(|name| name.to_string_lossy().to_string()),
                executable_path: if path.extension().and_then(|ext| ext.to_str()) == Some("exe") {
                    Some(path_str.clone())
                } else {
                    None
                },
                app_path: Some(path_str),
                platform: "windows".to_string(),
                source: "installed_scan".to_string(),
                category_guess,
                confidence,
            });
        }
    }
}

fn executable_display_name(process: &ProcessInfo) -> String {
    process
        .exe_path
        .as_deref()
        .and_then(|path| Path::new(path).file_stem())
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| process.name.clone())
}

fn app_key_for(display_name: &str, executable_name: Option<&str>, path: Option<&str>) -> String {
    let primary = executable_name
        .and_then(normalized_name_token)
        .or_else(|| normalized_name_token(display_name))
        .or_else(|| path.and_then(normalized_path_token))
        .unwrap_or_else(|| normalize_process_name(display_name));
    primary
}

fn normalized_name_token(value: &str) -> Option<String> {
    let stem = Path::new(value)
        .file_stem()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| value.to_string());
    let normalized = normalize_process_name(&stem);
    (!normalized.is_empty()).then_some(normalized)
}

fn normalized_path_token(path: &str) -> Option<String> {
    Path::new(path)
        .file_stem()
        .map(|name| normalize_process_name(&name.to_string_lossy()))
        .filter(|token| !token.is_empty())
}

fn classify_app_candidate(display_name: &str, path: Option<&str>) -> (Option<String>, f64) {
    let normalized = normalize_process_name(display_name);
    for category in categories::built_in_categories() {
        if category
            .process_names
            .iter()
            .any(|candidate| normalize_process_name(candidate) == normalized)
        {
            return (Some(category.name), 0.95);
        }
    }

    let haystack = format!(
        "{} {}",
        normalized,
        path.map(normalize_process_name).unwrap_or_default()
    );
    for (category, keywords) in [
        ("Games", &["steam", "riot", "epic", "battle", "game"][..]),
        (
            "Social Media",
            &[
                "discord", "telegram", "whatsapp", "signal", "wechat", "line",
            ][..],
        ),
        (
            "Entertainment",
            &["spotify", "vlc", "iina", "netflix", "music"][..],
        ),
        (
            "Browsers",
            &[
                "chrome", "firefox", "safari", "edge", "arc", "brave", "browser",
            ][..],
        ),
    ] {
        if keywords.iter().any(|keyword| haystack.contains(keyword)) {
            return (Some(category.to_string()), 0.65);
        }
    }

    (None, 0.0)
}

fn scan_and_enforce(app: &AppHandle) -> Result<(), String> {
    let database = app.state::<DatabaseState>();
    let config = app.state::<ConfigState>();
    let schedule = app.state::<crate::schedule::engine::ScheduleState>();
    let process_state = app.state::<ProcessMonitorState>();

    let processes = scan_processes();
    {
        let connection = database.connection()?;
        for process in &processes {
            let candidate = running_app_candidate(process);
            let outcome = upsert_known_app(&connection, &candidate, Some(timestamp_ms()))?;
            if outcome.inserted && outcome.classification_status == "unclassified" {
                app.emit(
                    "unknown-app-detected",
                    serde_json::json!({
                        "appKey": candidate.app_key,
                        "displayName": candidate.display_name,
                        "processName": process.name,
                        "executablePath": process.exe_path
                    }),
                )
                .map_err(|error| error.to_string())?;
            }
        }
    }
    let rules = {
        let connection = database.connection()?;
        get_process_rules(&connection)?
    };
    let current_block = {
        let connection = database.connection()?;
        schedule_engine::get_current_block(&connection, &schedule)?
    };
    let focused_window = get_focused_window()?;
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
    runtime.status.focused_window = focused_window.clone();
    runtime.status.last_killed_processes.clear();

    if active_block_type != Some(BlockType::Work) && !emergency_mode {
        runtime.warnings.clear();
        runtime.status.warnings.clear();
        return Ok(());
    }

    let candidates = build_enforcement_candidates(
        &processes,
        &rules,
        emergency_mode,
        &preferences.emergency_allowed_apps,
        &preferences.browser_title_allow_keywords,
        &preferences.browser_title_block_keywords,
        focused_window.as_ref(),
    );
    let active_keys: HashSet<String> = candidates
        .iter()
        .map(|candidate| candidate.key.clone())
        .collect();
    runtime.warnings.retain(|key, _| active_keys.contains(key));

    for candidate in candidates {
        let normalized_name = normalize_process_name(&candidate.process_name);
        let warn_seconds = find_warn_seconds(&normalized_name, &rules)
            .unwrap_or(preferences.process_warning_seconds);
        let browser_close_mode =
            candidate.window_title.is_some() && candidate.action == ProcessAction::Warn;

        if candidate.action == ProcessAction::Warn && !browser_close_mode {
            app.emit(
                "process-warning",
                ProcessWarning {
                    process_name: candidate.process_name.clone(),
                    seconds_until_kill: warn_seconds,
                    window_title: candidate.window_title.clone(),
                    match_reason: candidate.match_reason.clone(),
                },
            )
            .map_err(|error| error.to_string())?;
            continue;
        }

        let warning = runtime
            .warnings
            .entry(candidate.key.clone())
            .or_insert_with(|| WarningState {
                kill_at: now + i64::from(warn_seconds) * 1_000,
                block_id: current_block.as_ref().map(|block| block.id),
                task_id: current_block.as_ref().and_then(|block| block.task_id),
                pid: Some(candidate.pid),
                process_name: candidate.process_name.clone(),
                window_title: candidate.window_title.clone(),
                match_reason: candidate.match_reason.clone(),
            });

        warning.pid = Some(candidate.pid);
        warning.process_name = candidate.process_name.clone();
        warning.window_title = candidate.window_title.clone();
        warning.match_reason = candidate.match_reason.clone();

        let seconds_until_kill = if warn_seconds == 0 {
            0
        } else {
            ((warning.kill_at - now).max(0) / 1_000) as u32
        };

        if warn_seconds == 0 || now >= warning.kill_at {
            if kill_process(candidate.pid) {
                let connection = database.connection()?;
                connection
                    .execute(
                        r#"
                        INSERT INTO blocked_processes_log (process_name, rule_action, block_id, task_id, occurred_at)
                        VALUES (?1, ?2, ?3, ?4, ?5)
                        "#,
                        params![
                            normalized_name,
                            process_action_to_str(candidate.action),
                            warning.block_id,
                            warning.task_id,
                            now
                        ],
                    )
                    .map_err(|error| error.to_string())?;

                runtime
                    .status
                    .last_killed_processes
                    .push(candidate.process_name.clone());
                app.emit(
                    "process-killed",
                    serde_json::json!({
                        "processName": candidate.process_name,
                        "windowTitle": candidate.window_title,
                        "timestamp": now
                    }),
                )
                .map_err(|error| error.to_string())?;
            }
            runtime.warnings.remove(&candidate.key);
        } else {
            app.emit(
                "process-warning",
                ProcessWarning {
                    process_name: candidate.process_name.clone(),
                    seconds_until_kill,
                    window_title: candidate.window_title.clone(),
                    match_reason: candidate.match_reason.clone(),
                },
            )
            .map_err(|error| error.to_string())?;
        }
    }

    runtime.status.warnings = runtime
        .warnings
        .values()
        .map(|warning| ProcessWarning {
            process_name: warning.process_name.clone(),
            seconds_until_kill: ((warning.kill_at - now).max(0) / 1_000) as u32,
            window_title: warning.window_title.clone(),
            match_reason: warning.match_reason.clone(),
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

fn build_enforcement_candidates(
    processes: &[ProcessInfo],
    rules: &[ProcessRule],
    emergency_mode: bool,
    emergency_allowed_apps: &[String],
    browser_title_allow_keywords: &[String],
    browser_title_block_keywords: &[String],
    focused_window: Option<&FocusedWindowInfo>,
) -> Vec<EnforcementCandidate> {
    let mut candidates = Vec::new();
    let mut seen_browser = HashSet::new();

    for process in processes {
        let action = resolve_process_action(process, rules, emergency_mode, emergency_allowed_apps);
        if action == ProcessAction::AlwaysAllow {
            continue;
        }

        let normalized_name = normalize_process_name(&process.name);
        let browser = is_browser_process_name(&normalized_name);
        if browser {
            if !focused_window_matches_process(focused_window, process) {
                continue;
            }

            let title = focused_window.and_then(clean_browser_window_title);
            let browser_match = match_browser_title_keywords(
                title.as_deref(),
                browser_title_allow_keywords,
                browser_title_block_keywords,
            );
            if matches!(browser_match.decision, BrowserTitleDecision::Allow) {
                continue;
            }
            let key = format!(
                "browser:{}:{}",
                normalized_name,
                title.clone().unwrap_or_default()
            );
            if !seen_browser.insert(key.clone()) {
                continue;
            }
            candidates.push(EnforcementCandidate {
                key,
                process_name: process.name.clone(),
                window_title: title
                    .or_else(|| focused_window.and_then(|window| window.title.clone())),
                match_reason: browser_match.reason,
                pid: focused_window
                    .and_then(|window| window.pid)
                    .unwrap_or(process.pid),
                action: if matches!(browser_match.decision, BrowserTitleDecision::Block) {
                    ProcessAction::Warn
                } else {
                    action
                },
            });
            continue;
        }

        if action == ProcessAction::Warn || should_block_during_work(action) {
            candidates.push(EnforcementCandidate {
                key: normalized_name,
                process_name: process.name.clone(),
                window_title: None,
                match_reason: None,
                pid: process.pid,
                action,
            });
        }
    }

    candidates
}

fn is_browser_process_name(normalized_name: &str) -> bool {
    categories::built_in_categories()
        .into_iter()
        .find(|category| category.name == "Browsers")
        .map(|category| {
            category
                .process_names
                .iter()
                .any(|candidate| normalize_process_name(candidate) == normalized_name)
        })
        .unwrap_or(false)
}

fn focused_window_matches_process(
    focused_window: Option<&FocusedWindowInfo>,
    process: &ProcessInfo,
) -> bool {
    let Some(focused_window) = focused_window else {
        return false;
    };

    if let Some(pid) = focused_window.pid {
        return pid == process.pid;
    }

    focused_window
        .process_name
        .as_deref()
        .map(normalize_process_name)
        .map(|name| name == normalize_process_name(&process.name))
        .unwrap_or(false)
}

fn clean_browser_window_title(window: &FocusedWindowInfo) -> Option<String> {
    let mut title = window.title.as_deref()?.trim().to_string();
    for suffix in [
        " - google chrome",
        " - chrome",
        " - arc",
        " - mozilla firefox",
        " - firefox",
        " - safari",
        " - microsoft edge",
        " - edge",
        " - brave",
        " - brave browser",
    ] {
        let normalized = title.to_lowercase();
        if normalized.ends_with(suffix) {
            let new_len = title.len().saturating_sub(suffix.len());
            title.truncate(new_len);
            title = title.trim().trim_matches('-').trim().to_string();
        }
    }

    let cleaned = title
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch.is_whitespace() {
                ch.to_ascii_lowercase()
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    (!cleaned.is_empty()).then_some(cleaned)
}

fn match_browser_title_keywords(
    cleaned_title: Option<&str>,
    allow_keywords: &[String],
    block_keywords: &[String],
) -> BrowserTitleMatch {
    let Some(cleaned_title) = cleaned_title else {
        return BrowserTitleMatch {
            decision: BrowserTitleDecision::NoMatch,
            reason: None,
        };
    };

    if let Some(keyword) = block_keywords
        .iter()
        .filter_map(|keyword| normalize_keyword(keyword))
        .find(|keyword| cleaned_title.contains(keyword))
    {
        return BrowserTitleMatch {
            decision: BrowserTitleDecision::Block,
            reason: Some(format!("matched blocked keyword '{}'", keyword)),
        };
    }

    if let Some(keyword) = allow_keywords
        .iter()
        .filter_map(|keyword| normalize_keyword(keyword))
        .find(|keyword| cleaned_title.contains(keyword))
    {
        return BrowserTitleMatch {
            decision: BrowserTitleDecision::Allow,
            reason: Some(format!("matched allowed keyword '{}'", keyword)),
        };
    }

    BrowserTitleMatch {
        decision: BrowserTitleDecision::NoMatch,
        reason: None,
    }
}

fn normalize_keyword(keyword: &str) -> Option<String> {
    let normalized = keyword
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch.is_whitespace() {
                ch.to_ascii_lowercase()
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    (!normalized.is_empty()).then_some(normalized)
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

#[cfg(target_os = "macos")]
fn focused_window_for_platform() -> Result<Option<FocusedWindowInfo>, String> {
    let script = r#"
tell application "System Events"
    set frontProc to first application process whose frontmost is true
    set appName to name of frontProc
    set windowTitle to ""
    try
        set windowTitle to name of front window of frontProc
    end try
    return appName & linefeed & windowTitle
end tell
"#;
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Ok(None);
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut lines = stdout.lines();
    let process_name = lines
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let title = lines
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if process_name.is_none() && title.is_none() {
        return Ok(None);
    }
    Ok(Some(FocusedWindowInfo {
        process_name: process_name.map(ToOwned::to_owned),
        pid: None,
        title: title.map(ToOwned::to_owned),
    }))
}

#[cfg(target_os = "windows")]
fn focused_window_for_platform() -> Result<Option<FocusedWindowInfo>, String> {
    let script = r#"
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class WinApi {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@;
$hwnd = [WinApi]::GetForegroundWindow();
if ($hwnd -eq [IntPtr]::Zero) { return }
$builder = New-Object System.Text.StringBuilder 1024
[void][WinApi]::GetWindowText($hwnd, $builder, $builder.Capacity)
$pid = 0
[void][WinApi]::GetWindowThreadProcessId($hwnd, [ref]$pid)
$process = Get-Process -Id $pid -ErrorAction SilentlyContinue
[pscustomobject]@{
  processName = if ($process) { $process.ProcessName } else { $null }
  pid = if ($pid -gt 0) { $pid } else { $null }
  title = if ($builder.ToString()) { $builder.ToString() } else { $null }
} | ConvertTo-Json -Compress
"#;
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Ok(None);
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.trim().is_empty() {
        return Ok(None);
    }
    serde_json::from_str::<FocusedWindowInfo>(stdout.trim())
        .map(Some)
        .map_err(|error| error.to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn focused_window_for_platform() -> Result<Option<FocusedWindowInfo>, String> {
    Ok(None)
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

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::{
        clean_browser_window_title, get_known_apps, match_browser_title_keywords,
        running_app_candidate, upsert_known_app, BrowserTitleDecision, FocusedWindowInfo,
        ProcessInfo,
    };
    use crate::db::migrations::run_migrations;

    #[test]
    fn persists_new_running_processes_into_known_apps() {
        let connection = Connection::open_in_memory().expect("in-memory database should open");
        run_migrations(&connection).expect("migrations should run");

        let process = ProcessInfo {
            pid: 42,
            name: "ObscureApp".to_string(),
            exe_path: Some("/Applications/ObscureApp.app".to_string()),
            memory_bytes: 0,
        };
        let candidate = running_app_candidate(&process);
        upsert_known_app(&connection, &candidate, Some(1234)).expect("upsert should work");

        let apps = get_known_apps(&connection).expect("known apps should load");
        assert_eq!(apps.len(), 1);
        assert_eq!(apps[0].display_name, "ObscureApp");
        assert_eq!(apps[0].classification_status, "unclassified");
    }

    #[test]
    fn cleans_browser_title_before_matching_keywords() {
        let cleaned = clean_browser_window_title(&FocusedWindowInfo {
            process_name: Some("Google Chrome".to_string()),
            pid: Some(1),
            title: Some("GitHub Pull Request - Google Chrome".to_string()),
        })
        .expect("title should clean");

        assert_eq!(cleaned, "github pull request");
    }

    #[test]
    fn browser_keyword_block_takes_priority_over_allow() {
        let matched = match_browser_title_keywords(
            Some("github youtube video"),
            &[String::from("github")],
            &[String::from("youtube")],
        );

        assert_eq!(matched.decision, BrowserTitleDecision::Block);
        assert_eq!(
            matched.reason.as_deref(),
            Some("matched blocked keyword 'youtube'")
        );
    }
}
