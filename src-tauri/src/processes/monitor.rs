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
    schedule::{engine as schedule_engine, models::BlockSource},
};

use super::{
    categories,
    models::{
        AppCategory, AppCategoryInput, BlockedProcessLogEntry, ClassificationAction,
        EnforcementDecision, EnforcementProfile, EnforcementProfileInput,
        EnforcementProfileOverride, EnforcementProfileOverrideInput, EnforcementStatus,
        FocusedWindowInfo, HistoryEntry, KnownApp, KnownAppInput, KnownAppUpdate,
        KnownBrowserTarget, KnownBrowserTargetInput, KnownBrowserTargetUpdate,
        PendingClassificationBatch, ProcessAction, ProcessInfo, ProcessRule, ProcessWarning,
    },
};

pub struct ProcessMonitorState {
    runtime: Mutex<ProcessMonitorRuntime>,
}

#[derive(Default)]
struct ProcessMonitorRuntime {
    warnings: HashMap<String, WarningState>,
    prompted_app_keys: HashSet<String>,
    prompted_browser_target_keys: HashSet<String>,
    reopen_counts: HashMap<String, u32>,
    current_context_key: Option<String>,
    status: EnforcementStatus,
}

#[derive(Debug, Clone)]
struct WarningState {
    kill_at: i64,
    warning_count: u32,
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

fn ensure_enforcement_defaults(connection: &Connection) -> Result<(), String> {
    let now = timestamp_ms();
    for category in categories::built_in_categories() {
        connection
            .execute(
                r#"
                INSERT INTO app_categories (name, builtin, created_at, updated_at)
                VALUES (?1, 1, ?2, ?2)
                ON CONFLICT(name) DO UPDATE SET
                    builtin = 1,
                    updated_at = excluded.updated_at
                "#,
                params![category.name, now],
            )
            .map_err(|error| error.to_string())?;
    }

    for profile in categories::built_in_profile_names() {
        connection
            .execute(
                r#"
                INSERT INTO enforcement_profiles (name, parent_name, builtin, created_at, updated_at)
                VALUES (?1, ?2, 1, ?3, ?3)
                ON CONFLICT(name) DO UPDATE SET
                    parent_name = excluded.parent_name,
                    builtin = 1,
                    updated_at = excluded.updated_at
                "#,
                params![profile.name, profile.parent_name, now],
            )
            .map_err(|error| error.to_string())?;
    }

    for target in categories::built_in_browser_targets() {
        connection
            .execute(
                r#"
                INSERT INTO known_browser_targets (
                    target_key, display_name, keyword, category_name, confidence,
                    classification_action, builtin, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, 'unclassified', 1, ?6)
                ON CONFLICT(target_key) DO UPDATE SET
                    display_name = excluded.display_name,
                    keyword = excluded.keyword,
                    category_name = excluded.category_name,
                    confidence = excluded.confidence,
                    builtin = 1,
                    updated_at = excluded.updated_at
                "#,
                params![
                    target.target_key,
                    target.display_name,
                    normalize_keyword(target.keyword).unwrap_or_else(|| target.keyword.to_string()),
                    Some(target.category_name.to_string()),
                    target.confidence,
                    now
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

pub fn scan_processes() -> Vec<ProcessInfo> {
    let mut system = System::new_all();
    system.refresh_processes(ProcessesToUpdate::All, true);

    system
        .processes()
        .iter()
        .filter_map(|(pid, process)| {
            let exe = process.exe().map(|p| p.to_path_buf());
            if !is_user_facing_app(exe.as_deref()) {
                return None;
            }
            Some(ProcessInfo {
                pid: pid.as_u32(),
                name: process.name().to_string_lossy().to_string(),
                exe_path: exe.map(|p| p.display().to_string()),
                memory_bytes: process.memory(),
            })
        })
        .collect()
}

/// Heuristic: a process is "user-facing" if its executable lives inside a
/// real .app bundle (macOS), an Applications/Steam-like folder, or a Linux
/// launcher path. System frameworks, daemons under /System/Library and
/// /usr/* are filtered out so the inventory matches what the user actually
/// thinks of as an app.
fn is_user_facing_app(exe: Option<&Path>) -> bool {
    let Some(path) = exe else {
        return false;
    };
    let display = path.to_string_lossy();

    #[cfg(target_os = "macos")]
    {
        // exclude OS daemons + helper processes inside system frameworks
        const DENY_PREFIXES: &[&str] = &[
            "/System/Library/",
            "/usr/libexec/",
            "/usr/sbin/",
            "/usr/bin/",
            "/sbin/",
            "/bin/",
            "/Library/Apple/",
            "/Library/Frameworks/",
            "/Library/PrivilegedHelperTools/",
            "/private/var/",
        ];
        for prefix in DENY_PREFIXES {
            if display.starts_with(prefix) {
                return false;
            }
        }
        // require the path to live inside a .app bundle OR a well-known
        // launcher root.
        if display.contains(".app/Contents/MacOS/") {
            // skip XPC services / Login Items / framework helpers — those
            // live under .app/Contents/Frameworks/.../XPCServices.
            if display.contains(".xpc/") || display.contains("/Frameworks/") {
                return false;
            }
            return true;
        }
        for root in [
            "/Applications/",
            "/System/Applications/",
            "/Applications/Setapp/",
        ] {
            if display.starts_with(root) {
                return true;
            }
        }
        // Steam games, ~/Applications, and user-installed CLI binaries
        if let Some(home) = std::env::var_os("HOME") {
            let home = home.to_string_lossy();
            let user_apps = format!("{}/Applications/", home);
            let steam_lib = format!(
                "{}/Library/Application Support/Steam/steamapps/",
                home
            );
            if display.starts_with(user_apps.as_str())
                || display.starts_with(steam_lib.as_str())
            {
                return true;
            }
        }
        false
    }

    #[cfg(target_os = "windows")]
    {
        const DENY_PREFIXES: &[&str] = &[
            "C:\\Windows\\System32\\",
            "C:\\Windows\\SysWOW64\\",
            "C:\\Windows\\WinSxS\\",
            "C:\\Windows\\servicing\\",
        ];
        for prefix in DENY_PREFIXES {
            if display.starts_with(prefix) {
                return false;
            }
        }
        const ALLOW_PREFIXES: &[&str] = &[
            "C:\\Program Files\\",
            "C:\\Program Files (x86)\\",
            "C:\\Users\\",
        ];
        for prefix in ALLOW_PREFIXES {
            if display.starts_with(prefix) {
                return true;
            }
        }
        false
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        const DENY_PREFIXES: &[&str] = &[
            "/usr/lib/",
            "/usr/libexec/",
            "/usr/sbin/",
            "/sbin/",
            "/bin/",
            "/lib/",
        ];
        for prefix in DENY_PREFIXES {
            if display.starts_with(prefix) {
                return false;
            }
        }
        const ALLOW_PREFIXES: &[&str] = &[
            "/usr/bin/",
            "/opt/",
            "/snap/",
            "/var/lib/flatpak/",
        ];
        for prefix in ALLOW_PREFIXES {
            if display.starts_with(prefix) {
                return true;
            }
        }
        if let Some(home) = std::env::var_os("HOME") {
            let home = home.to_string_lossy();
            if display.starts_with(&*home) {
                return true;
            }
        }
        false
    }
}

pub fn get_focused_window() -> Result<Option<FocusedWindowInfo>, String> {
    focused_window_for_platform()
}

pub fn get_known_apps(connection: &Connection) -> Result<Vec<KnownApp>, String> {
    ensure_enforcement_defaults(connection)?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT app_key, display_name, executable_name, executable_path, app_path,
                   platform, source, category_guess, category_override,
                   COALESCE(category_override, category_guess) AS effective_category,
                   classification_action, confidence, classification_status, first_seen_at, last_seen_running_at, updated_at
            FROM known_apps
            ORDER BY classification_status ASC, display_name ASC
            "#,
        )
        .map_err(|error| error.to_string())?;

    let mut rows = statement
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
                category_override: row.get(8)?,
                effective_category: row.get(9)?,
                categories: vec![],
                classification_action: classification_action_from_str(&row.get::<_, String>(10)?)
                    .map_err(to_from_sql_error)?,
                confidence: row.get(11)?,
                classification_status: row.get(12)?,
                first_seen_at: row.get(13)?,
                last_seen_running_at: row.get(14)?,
                updated_at: row.get(15)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    for app in &mut rows {
        app.categories = load_app_category_names(connection, &app.app_key)?;
    }

    Ok(rows)
}

pub fn update_known_app(
    connection: &Connection,
    app_key: &str,
    updates: KnownAppUpdate,
) -> Result<KnownApp, String> {
    let existing = get_known_app_by_key(connection, app_key)?
        .ok_or_else(|| format!("known app {app_key} does not exist"))?;
    let display_name = updates
        .display_name
        .unwrap_or_else(|| existing.display_name.clone());
    if display_name.trim().is_empty() {
        return Err("displayName cannot be empty".to_string());
    }

    let classification_status = updates
        .classification_status
        .unwrap_or_else(|| existing.classification_status.clone());
    validate_known_app_status(&classification_status)?;
    let classification_action = updates
        .classification_action
        .unwrap_or(existing.classification_action);
    let category_override = updates
        .category_override
        .unwrap_or(existing.category_override.clone());
    let now = timestamp_ms();

    connection
        .execute(
            r#"
            UPDATE known_apps
            SET display_name = ?1,
                category_override = ?2,
                classification_action = ?3,
                classification_status = ?4,
                updated_at = ?5
            WHERE app_key = ?6
            "#,
            params![
                display_name.trim(),
                category_override,
                classification_action_to_str(classification_action),
                classification_status,
                now,
                app_key
            ],
        )
        .map_err(|error| error.to_string())?;

    if let Some(category_names) = updates.category_names {
        replace_app_categories(connection, app_key, &category_names)?;
    }

    let updated = get_known_app_by_key(connection, app_key)?
        .ok_or_else(|| format!("known app {app_key} disappeared after update"))?;

    record_enforcement_history(
        connection,
        "known_app",
        app_key,
        "updated",
        serde_json::json!({
            "classificationAction": classification_action_to_str(updated.classification_action),
            "classificationStatus": updated.classification_status,
            "categories": updated.categories,
            "categoryOverride": updated.category_override
        }),
    );

    if updates.sync_rule.unwrap_or(true) {
        sync_known_app_to_rule(connection, &updated)?;
    }

    Ok(updated)
}

pub fn create_known_app(connection: &Connection, app: KnownAppInput) -> Result<KnownApp, String> {
    ensure_enforcement_defaults(connection)?;
    let display_name = app.display_name.trim();
    if display_name.is_empty() {
        return Err("displayName cannot be empty".to_string());
    }

    let executable_name = app.executable_name.clone().or_else(|| {
        app.executable_path
            .as_deref()
            .and_then(|path| Path::new(path).file_name())
            .map(|name| name.to_string_lossy().to_string())
    });
    let app_key = app_key_for(
        display_name,
        executable_name.as_deref(),
        app.executable_path.as_deref().or(app.app_path.as_deref()),
    );
    let fallback_category = app
        .category_override
        .clone()
        .or_else(|| app.category_names.first().cloned())
        .or_else(|| {
            classify_app_candidate(
                display_name,
                app.executable_path.as_deref().or(app.app_path.as_deref()),
            )
            .0
        });
    let now = timestamp_ms();
    let classification_status = match app.classification_action {
        ClassificationAction::Unclassified => "unclassified".to_string(),
        _ => "confirmed".to_string(),
    };

    connection
        .execute(
            r#"
            INSERT INTO known_apps (
                app_key, display_name, executable_name, executable_path, app_path,
                platform, source, category_guess, category_override, classification_action, confidence, classification_status,
                first_seen_at, last_seen_running_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'user_added', ?7, ?8, ?9, 1.0, ?10, ?11, NULL, ?11)
            ON CONFLICT(app_key) DO UPDATE SET
                display_name = excluded.display_name,
                executable_name = COALESCE(excluded.executable_name, known_apps.executable_name),
                executable_path = COALESCE(excluded.executable_path, known_apps.executable_path),
                app_path = COALESCE(excluded.app_path, known_apps.app_path),
                platform = excluded.platform,
                source = excluded.source,
                category_guess = COALESCE(excluded.category_guess, known_apps.category_guess),
                category_override = COALESCE(excluded.category_override, known_apps.category_override),
                classification_action = excluded.classification_action,
                confidence = excluded.confidence,
                classification_status = excluded.classification_status,
                updated_at = excluded.updated_at
            "#,
            params![
                app_key,
                display_name,
                executable_name,
                app.executable_path,
                app.app_path,
                std::env::consts::OS,
                fallback_category,
                app.category_override,
                classification_action_to_str(app.classification_action),
                classification_status,
                now
            ],
        )
        .map_err(|error| error.to_string())?;

    if app.category_names.is_empty() {
        if let Some(category_name) = fallback_category.as_deref() {
            ensure_category_membership(connection, &app_key, category_name)?;
        }
    } else {
        replace_app_categories(connection, &app_key, &app.category_names)?;
    }

    let created = get_known_app_by_key(connection, &app_key)?
        .ok_or_else(|| format!("known app {app_key} disappeared after create"))?;
    record_enforcement_history(
        connection,
        "known_app",
        &app_key,
        "created",
        serde_json::json!({
            "classificationAction": classification_action_to_str(created.classification_action),
            "classificationStatus": created.classification_status,
            "categories": created.categories,
            "categoryOverride": created.category_override
        }),
    );
    if app.sync_rule.unwrap_or(true) {
        sync_known_app_to_rule(connection, &created)?;
    }
    Ok(created)
}

pub fn refresh_known_apps_inventory(connection: &Connection) -> Result<(), String> {
    ensure_enforcement_defaults(connection)?;
    let discovered = discover_installed_apps();
    for app in discovered {
        upsert_known_app(connection, &app, None)?;
    }
    Ok(())
}

pub fn get_known_browser_targets(
    connection: &Connection,
) -> Result<Vec<KnownBrowserTarget>, String> {
    ensure_enforcement_defaults(connection)?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT target_key, display_name, keyword, category_name, confidence,
                   classification_action, builtin, first_seen_at, last_seen_at, updated_at
            FROM known_browser_targets
            ORDER BY display_name ASC
            "#,
        )
        .map_err(|error| error.to_string())?;

    let targets = statement
        .query_map([], |row| {
            Ok(KnownBrowserTarget {
                target_key: row.get(0)?,
                display_name: row.get(1)?,
                keyword: row.get(2)?,
                category_name: row.get(3)?,
                confidence: row.get(4)?,
                classification_action: classification_action_from_str(&row.get::<_, String>(5)?)
                    .map_err(to_from_sql_error)?,
                builtin: row.get(6)?,
                first_seen_at: row.get(7)?,
                last_seen_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(targets)
}

pub fn update_known_browser_target(
    connection: &Connection,
    target_key: &str,
    updates: KnownBrowserTargetUpdate,
) -> Result<KnownBrowserTarget, String> {
    ensure_enforcement_defaults(connection)?;
    let existing = get_known_browser_target_by_key(connection, target_key)?
        .ok_or_else(|| format!("browser target {target_key} does not exist"))?;
    let display_name = updates
        .display_name
        .unwrap_or(existing.display_name.clone());
    if display_name.trim().is_empty() {
        return Err("displayName cannot be empty".to_string());
    }
    let keyword = match updates.keyword.as_deref() {
        Some(value) => {
            normalize_keyword(value).ok_or_else(|| "keyword cannot be empty".to_string())?
        }
        None => existing.keyword.clone(),
    };
    let category_name = updates
        .category_name
        .unwrap_or(existing.category_name.clone());
    let classification_action = updates
        .classification_action
        .unwrap_or(existing.classification_action);
    let now = timestamp_ms();

    connection
        .execute(
            r#"
            UPDATE known_browser_targets
            SET display_name = ?1,
                keyword = ?2,
                category_name = ?3,
                classification_action = ?4,
                updated_at = ?5
            WHERE target_key = ?6
            "#,
            params![
                display_name.trim(),
                keyword,
                category_name,
                classification_action_to_str(classification_action),
                now,
                target_key
            ],
        )
        .map_err(|error| error.to_string())?;

    let updated = get_known_browser_target_by_key(connection, target_key)?
        .ok_or_else(|| format!("browser target {target_key} disappeared after update"))?;
    record_enforcement_history(
        connection,
        "browser_target",
        target_key,
        "updated",
        serde_json::json!({
            "displayName": updated.display_name,
            "keyword": updated.keyword,
            "classificationAction": classification_action_to_str(updated.classification_action),
            "categoryName": updated.category_name,
        }),
    );
    Ok(updated)
}

pub fn create_known_browser_target(
    connection: &Connection,
    target: KnownBrowserTargetInput,
) -> Result<KnownBrowserTarget, String> {
    ensure_enforcement_defaults(connection)?;
    let display_name = target.display_name.trim();
    if display_name.is_empty() {
        return Err("displayName cannot be empty".to_string());
    }
    let keyword =
        normalize_keyword(&target.keyword).ok_or_else(|| "keyword cannot be empty".to_string())?;
    let target_key = browser_target_key_for(&keyword);
    let now = timestamp_ms();
    connection
        .execute(
            r#"
            INSERT INTO known_browser_targets (
                target_key, display_name, keyword, category_name, confidence,
                classification_action, builtin, updated_at
            ) VALUES (?1, ?2, ?3, ?4, 1.0, ?5, 0, ?6)
            ON CONFLICT(target_key) DO UPDATE SET
                display_name = excluded.display_name,
                keyword = excluded.keyword,
                category_name = excluded.category_name,
                confidence = excluded.confidence,
                classification_action = excluded.classification_action,
                updated_at = excluded.updated_at
            "#,
            params![
                target_key,
                display_name,
                keyword,
                target.category_name,
                classification_action_to_str(target.classification_action),
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    let created = get_known_browser_target_by_key(connection, &target_key)?
        .ok_or_else(|| format!("browser target {target_key} disappeared after create"))?;
    record_enforcement_history(
        connection,
        "browser_target",
        &target_key,
        "created",
        serde_json::json!({
            "displayName": created.display_name,
            "keyword": created.keyword,
            "classificationAction": classification_action_to_str(created.classification_action),
            "categoryName": created.category_name,
        }),
    );
    Ok(created)
}

pub fn get_pending_classifications(
    connection: &Connection,
) -> Result<PendingClassificationBatch, String> {
    let apps = get_known_apps(connection)?
        .into_iter()
        .filter(|app| app.classification_action == ClassificationAction::Unclassified)
        .collect();
    let browser_targets = get_known_browser_targets(connection)?
        .into_iter()
        .filter(|target| {
            target.classification_action == ClassificationAction::Unclassified
                && target.last_seen_at.is_some()
        })
        .collect();
    Ok(PendingClassificationBatch {
        apps,
        browser_targets,
    })
}

pub fn get_app_categories(connection: &Connection) -> Result<Vec<AppCategory>, String> {
    ensure_enforcement_defaults(connection)?;
    let mut statement = connection
        .prepare(
            "SELECT name, builtin, created_at, updated_at FROM app_categories ORDER BY builtin DESC, name ASC",
        )
        .map_err(|error| error.to_string())?;
    let categories = statement
        .query_map([], |row| {
            Ok(AppCategory {
                name: row.get(0)?,
                builtin: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(categories)
}

pub fn upsert_app_category(
    connection: &Connection,
    category: AppCategoryInput,
) -> Result<AppCategory, String> {
    let name = category.name.trim();
    if name.is_empty() {
        return Err("name cannot be empty".to_string());
    }
    let now = timestamp_ms();
    connection
        .execute(
            r#"
            INSERT INTO app_categories (name, builtin, created_at, updated_at)
            VALUES (?1, 0, ?2, ?2)
            ON CONFLICT(name) DO UPDATE SET
                updated_at = excluded.updated_at
            "#,
            params![name, now],
        )
        .map_err(|error| error.to_string())?;
    record_enforcement_history(
        connection,
        "app_category",
        name,
        "upserted",
        serde_json::json!({}),
    );
    connection
        .query_row(
            "SELECT name, builtin, created_at, updated_at FROM app_categories WHERE name = ?1",
            params![name],
            |row| {
                Ok(AppCategory {
                    name: row.get(0)?,
                    builtin: row.get(1)?,
                    created_at: row.get(2)?,
                    updated_at: row.get(3)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

pub fn delete_app_category(connection: &Connection, name: &str) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.eq_ignore_ascii_case("Games")
        || trimmed.eq_ignore_ascii_case("Social Media")
        || trimmed.eq_ignore_ascii_case("Entertainment")
        || trimmed.eq_ignore_ascii_case("Browsers")
        || trimmed.eq_ignore_ascii_case("Communication")
    {
        return Err("built-in categories cannot be deleted".to_string());
    }
    let deleted = connection
        .execute(
            "DELETE FROM app_categories WHERE name = ?1",
            params![trimmed],
        )
        .map_err(|error| error.to_string())?;
    if deleted == 0 {
        return Err(format!("app category {trimmed} does not exist"));
    }
    record_enforcement_history(
        connection,
        "app_category",
        trimmed,
        "deleted",
        serde_json::json!({}),
    );
    Ok(())
}

pub fn get_enforcement_profiles(
    connection: &Connection,
) -> Result<Vec<EnforcementProfile>, String> {
    ensure_enforcement_defaults(connection)?;
    let mut statement = connection
        .prepare(
            "SELECT name, parent_name, builtin, created_at, updated_at FROM enforcement_profiles ORDER BY builtin DESC, name ASC",
        )
        .map_err(|error| error.to_string())?;
    let profiles = statement
        .query_map([], |row| {
            Ok(EnforcementProfile {
                name: row.get(0)?,
                parent_name: row.get(1)?,
                builtin: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(profiles)
}

pub fn upsert_enforcement_profile(
    connection: &Connection,
    profile: EnforcementProfileInput,
) -> Result<EnforcementProfile, String> {
    ensure_enforcement_defaults(connection)?;
    let name = normalize_profile_name(&profile.name)?;
    if let Some(parent_name) = &profile.parent_name {
        let parent_name = normalize_profile_name(parent_name)?;
        if parent_name == name {
            return Err("profile cannot inherit from itself".to_string());
        }
    }
    let now = timestamp_ms();
    let parent_name = profile
        .parent_name
        .map(|value| normalize_profile_name(&value))
        .transpose()?;
    connection
        .execute(
            r#"
            INSERT INTO enforcement_profiles (name, parent_name, builtin, created_at, updated_at)
            VALUES (?1, ?2, 0, ?3, ?3)
            ON CONFLICT(name) DO UPDATE SET
                parent_name = excluded.parent_name,
                updated_at = excluded.updated_at
            "#,
            params![name, parent_name, now],
        )
        .map_err(|error| error.to_string())?;
    record_enforcement_history(
        connection,
        "enforcement_profile",
        &name,
        "upserted",
        serde_json::json!({ "parentName": parent_name }),
    );
    connection
        .query_row(
            "SELECT name, parent_name, builtin, created_at, updated_at FROM enforcement_profiles WHERE name = ?1",
            params![name],
            |row| {
                Ok(EnforcementProfile {
                    name: row.get(0)?,
                    parent_name: row.get(1)?,
                    builtin: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

pub fn delete_enforcement_profile(connection: &Connection, name: &str) -> Result<(), String> {
    let name = normalize_profile_name(name)?;
    if matches!(name.as_str(), "rest" | "work" | "deep_work") {
        return Err("built-in profiles cannot be deleted".to_string());
    }
    let deleted = connection
        .execute(
            "DELETE FROM enforcement_profiles WHERE name = ?1",
            params![name],
        )
        .map_err(|error| error.to_string())?;
    if deleted == 0 {
        return Err(format!("enforcement profile {name} does not exist"));
    }
    record_enforcement_history(
        connection,
        "enforcement_profile",
        &name,
        "deleted",
        serde_json::json!({}),
    );
    Ok(())
}

pub fn get_enforcement_profile_overrides(
    connection: &Connection,
    profile_name: Option<&str>,
) -> Result<Vec<EnforcementProfileOverride>, String> {
    let map_row = |row: &rusqlite::Row<'_>| {
        Ok(EnforcementProfileOverride {
            profile_name: row.get(0)?,
            subject_type: row.get(1)?,
            subject_key: row.get(2)?,
            decision: enforcement_decision_from_str(&row.get::<_, String>(3)?)
                .map_err(to_from_sql_error)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    };
    if let Some(raw) = profile_name {
        let profile_name = normalize_profile_name(raw)?;
        let mut statement = connection
            .prepare(
                r#"
                SELECT profile_name, subject_type, subject_key, decision, created_at, updated_at
                FROM enforcement_profile_overrides
                WHERE profile_name = ?1
                ORDER BY subject_type ASC, subject_key ASC
                "#,
            )
            .map_err(|error| error.to_string())?;
        let overrides = statement
            .query_map(params![profile_name], map_row)
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        return Ok(overrides);
    }
    let mut statement = connection
        .prepare(
            r#"
            SELECT profile_name, subject_type, subject_key, decision, created_at, updated_at
            FROM enforcement_profile_overrides
            ORDER BY profile_name ASC, subject_type ASC, subject_key ASC
            "#,
        )
        .map_err(|error| error.to_string())?;
    let overrides = statement
        .query_map([], map_row)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(overrides)
}

pub fn set_enforcement_profile_override(
    connection: &Connection,
    override_entry: EnforcementProfileOverrideInput,
) -> Result<EnforcementProfileOverride, String> {
    let profile_name = normalize_profile_name(&override_entry.profile_name)?;
    let subject_type = normalize_subject_type(&override_entry.subject_type)?;
    let subject_key = normalize_subject_key(&override_entry.subject_key);
    if profile_name == categories::EMERGENCY_PROFILE_NAME
        && override_entry.decision == EnforcementDecision::Allow
    {
        if let Some(category) =
            resolve_subject_category(connection, &subject_type, &subject_key)?
        {
            if categories::EMERGENCY_BLOCKED_CATEGORIES
                .iter()
                .any(|blocked| blocked.eq_ignore_ascii_case(&category))
            {
                return Err(format!(
                    "Apps in the {category} category cannot be allowed during an emergency block."
                ));
            }
        }
    }
    let now = timestamp_ms();
    connection
        .execute(
            r#"
            INSERT INTO enforcement_profile_overrides (
                profile_name, subject_type, subject_key, decision, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
            ON CONFLICT(profile_name, subject_type, subject_key) DO UPDATE SET
                decision = excluded.decision,
                updated_at = excluded.updated_at
            "#,
            params![
                profile_name,
                subject_type,
                subject_key,
                enforcement_decision_to_str(override_entry.decision),
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    record_enforcement_history(
        connection,
        "profile_override",
        &format!("{profile_name}:{subject_type}:{subject_key}"),
        "set",
        serde_json::json!({ "decision": enforcement_decision_to_str(override_entry.decision) }),
    );
    connection
        .query_row(
            r#"
            SELECT profile_name, subject_type, subject_key, decision, created_at, updated_at
            FROM enforcement_profile_overrides
            WHERE profile_name = ?1 AND subject_type = ?2 AND subject_key = ?3
            "#,
            params![profile_name, subject_type, subject_key],
            |row| {
                Ok(EnforcementProfileOverride {
                    profile_name: row.get(0)?,
                    subject_type: row.get(1)?,
                    subject_key: row.get(2)?,
                    decision: enforcement_decision_from_str(&row.get::<_, String>(3)?)
                        .map_err(to_from_sql_error)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

pub fn delete_enforcement_profile_override(
    connection: &Connection,
    profile_name: &str,
    subject_type: &str,
    subject_key: &str,
) -> Result<(), String> {
    let profile_name = normalize_profile_name(profile_name)?;
    let subject_type = normalize_subject_type(subject_type)?;
    let subject_key = normalize_subject_key(subject_key);
    let deleted = connection
        .execute(
            "DELETE FROM enforcement_profile_overrides WHERE profile_name = ?1 AND subject_type = ?2 AND subject_key = ?3",
            params![profile_name, subject_type, subject_key],
        )
        .map_err(|error| error.to_string())?;
    if deleted == 0 {
        return Err("override does not exist".to_string());
    }
    record_enforcement_history(
        connection,
        "profile_override",
        &format!("{profile_name}:{subject_type}:{subject_key}"),
        "deleted",
        serde_json::json!({}),
    );
    Ok(())
}

pub fn get_enforcement_history(
    connection: &Connection,
    from: i64,
    to: i64,
) -> Result<Vec<HistoryEntry>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, entity_kind, entity_key, action, payload_json, occurred_at
            FROM enforcement_history
            WHERE occurred_at >= ?1 AND occurred_at < ?2
            ORDER BY occurred_at DESC, id DESC
            "#,
        )
        .map_err(|error| error.to_string())?;
    let history = statement
        .query_map(params![from, to], |row| {
            Ok(HistoryEntry {
                id: row.get(0)?,
                entity_kind: row.get(1)?,
                entity_key: row.get(2)?,
                action: row.get(3)?,
                payload_json: row.get(4)?,
                occurred_at: row.get(5)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(history)
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

    let saved_rule = connection
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
        .map_err(|error| error.to_string())?;
    record_enforcement_history(
        connection,
        "process_rule",
        &saved_rule.process_name,
        "set",
        serde_json::json!({
            "category": saved_rule.category,
            "action": process_action_to_str(saved_rule.action),
            "warnSeconds": saved_rule.warn_seconds
        }),
    );
    Ok(saved_rule)
}

pub fn delete_process_rule(connection: &Connection, process_name: &str) -> Result<(), String> {
    let normalized_name = normalize_process_name(process_name);
    let deleted = connection
        .execute(
            "DELETE FROM process_rules WHERE process_name = ?1",
            params![normalized_name],
        )
        .map_err(|error| error.to_string())?;

    if deleted == 0 {
        return Err(format!("process rule for {process_name} does not exist"));
    }

    record_enforcement_history(
        connection,
        "process_rule",
        &normalized_name,
        "deleted",
        serde_json::json!({}),
    );

    Ok(())
}

fn get_known_app_by_key(
    connection: &Connection,
    app_key: &str,
) -> Result<Option<KnownApp>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT app_key, display_name, executable_name, executable_path, app_path,
                   platform, source, category_guess, category_override,
                   COALESCE(category_override, category_guess) AS effective_category,
                   classification_action, confidence, classification_status, first_seen_at, last_seen_running_at, updated_at
            FROM known_apps
            WHERE app_key = ?1
            "#,
        )
        .map_err(|error| error.to_string())?;

    statement
        .query_row(params![app_key], |row| {
            Ok(KnownApp {
                app_key: row.get(0)?,
                display_name: row.get(1)?,
                executable_name: row.get(2)?,
                executable_path: row.get(3)?,
                app_path: row.get(4)?,
                platform: row.get(5)?,
                source: row.get(6)?,
                category_guess: row.get(7)?,
                category_override: row.get(8)?,
                effective_category: row.get(9)?,
                categories: vec![],
                classification_action: classification_action_from_str(&row.get::<_, String>(10)?)
                    .map_err(to_from_sql_error)?,
                confidence: row.get(11)?,
                classification_status: row.get(12)?,
                first_seen_at: row.get(13)?,
                last_seen_running_at: row.get(14)?,
                updated_at: row.get(15)?,
            })
        })
        .optional()
        .map_err(|error| error.to_string())?
        .map(|mut app| {
            app.categories = load_app_category_names(connection, &app.app_key)?;
            Ok(app)
        })
        .transpose()
}

fn get_known_browser_target_by_key(
    connection: &Connection,
    target_key: &str,
) -> Result<Option<KnownBrowserTarget>, String> {
    connection
        .query_row(
            r#"
            SELECT target_key, display_name, keyword, category_name, confidence,
                   classification_action, builtin, first_seen_at, last_seen_at, updated_at
            FROM known_browser_targets
            WHERE target_key = ?1
            "#,
            params![target_key],
            |row| {
                Ok(KnownBrowserTarget {
                    target_key: row.get(0)?,
                    display_name: row.get(1)?,
                    keyword: row.get(2)?,
                    category_name: row.get(3)?,
                    confidence: row.get(4)?,
                    classification_action: classification_action_from_str(
                        &row.get::<_, String>(5)?,
                    )
                    .map_err(to_from_sql_error)?,
                    builtin: row.get(6)?,
                    first_seen_at: row.get(7)?,
                    last_seen_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            },
        )
        .optional()
        .map_err(|error| error.to_string())
}

fn load_app_category_names(connection: &Connection, app_key: &str) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare(
            "SELECT category_name FROM app_category_memberships WHERE app_key = ?1 ORDER BY category_name ASC",
        )
        .map_err(|error| error.to_string())?;
    let category_names = statement
        .query_map(params![app_key], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(category_names)
}

fn ensure_category_membership(
    connection: &Connection,
    app_key: &str,
    category_name: &str,
) -> Result<(), String> {
    let category_name = category_name.trim();
    if category_name.is_empty() {
        return Ok(());
    }
    let now = timestamp_ms();
    connection
        .execute(
            "INSERT OR IGNORE INTO app_categories (name, builtin, created_at, updated_at) VALUES (?1, 0, ?2, ?2)",
            params![category_name, now],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT OR IGNORE INTO app_category_memberships (app_key, category_name) VALUES (?1, ?2)",
            params![app_key, category_name],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn replace_app_categories(
    connection: &Connection,
    app_key: &str,
    category_names: &[String],
) -> Result<(), String> {
    connection
        .execute(
            "DELETE FROM app_category_memberships WHERE app_key = ?1",
            params![app_key],
        )
        .map_err(|error| error.to_string())?;
    for category_name in category_names {
        ensure_category_membership(connection, app_key, category_name)?;
    }
    Ok(())
}

fn validate_known_app_status(status: &str) -> Result<(), String> {
    match status {
        "unclassified" | "confirmed" | "ignored" => Ok(()),
        _ => Err(format!("unknown known app classificationStatus: {status}")),
    }
}

fn sync_known_app_to_rule(connection: &Connection, app: &KnownApp) -> Result<(), String> {
    if app.classification_status == "ignored" {
        return Ok(());
    }

    let action = match app.classification_action {
        ClassificationAction::AlwaysBan => ProcessAction::AlwaysBlock,
        ClassificationAction::BanDuringWork => ProcessAction::BlockDuringWork,
        ClassificationAction::NeverBan | ClassificationAction::Unclassified => {
            ProcessAction::AlwaysAllow
        }
    };
    let Some(category) = app.effective_category.as_ref() else {
        return Ok(());
    };
    if action == ProcessAction::AlwaysAllow {
        return Ok(());
    }
    let process_name = normalized_name_token(app.app_key.as_str())
        .or_else(|| {
            app.executable_name
                .as_deref()
                .and_then(normalized_name_token)
        })
        .or_else(|| normalized_name_token(app.display_name.as_str()))
        .filter(|name| !name.is_empty());
    let Some(process_name) = process_name else {
        return Ok(());
    };

    let now = timestamp_ms();
    connection
        .execute(
            r#"
            INSERT INTO process_rules (process_name, category, action, warn_seconds, created_at, updated_at)
            VALUES (?1, ?2, ?3, NULL, ?4, ?4)
            ON CONFLICT(process_name) DO UPDATE SET
                category = excluded.category,
                action = excluded.action,
                updated_at = excluded.updated_at
            "#,
            params![
                process_name,
                category,
                process_action_to_str(action),
                now
            ],
        )
        .map_err(|error| error.to_string())?;

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

fn upsert_known_app(
    connection: &Connection,
    app: &DiscoveredApp,
    last_seen_running_at: Option<i64>,
) -> Result<(), String> {
    let existing = connection
        .query_row(
            "SELECT classification_status FROM known_apps WHERE app_key = ?1",
            params![app.app_key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let now = timestamp_ms();
    let classification_status = existing.unwrap_or_else(|| "unclassified".to_string());

    connection
        .execute(
            r#"
            INSERT INTO known_apps (
                app_key, display_name, executable_name, executable_path, app_path,
                platform, source, category_guess, category_override, classification_action, confidence, classification_status,
                first_seen_at, last_seen_running_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, 'unclassified', ?9, ?10, ?11, ?12, ?13)
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

    if let Some(category_name) = app.category_guess.clone() {
        ensure_category_membership(connection, &app.app_key, &category_name)?;
    }

    Ok(())
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
        ensure_enforcement_defaults(&connection)?;
        for process in &processes {
            let candidate = running_app_candidate(process);
            let _ = upsert_known_app(&connection, &candidate, Some(timestamp_ms()))?;
        }
    }
    let rules = {
        let connection = database.connection()?;
        get_process_rules(&connection)?
    };
    let known_apps = {
        let connection = database.connection()?;
        get_known_apps(&connection)?
    };
    let known_browser_targets = {
        let connection = database.connection()?;
        get_known_browser_targets(&connection)?
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
    let active_profile = {
        let connection = database.connection()?;
        schedule_engine::effective_enforcement_profile(&connection, &schedule)?
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
    let context_key = format!(
        "{}:{}",
        active_profile,
        current_block
            .as_ref()
            .map(|block| block.id.to_string())
            .unwrap_or_else(|| "none".to_string())
    );
    if runtime.current_context_key.as_deref() != Some(context_key.as_str()) {
        runtime.warnings.clear();
        runtime.prompted_app_keys.clear();
        runtime.prompted_browser_target_keys.clear();
        runtime.reopen_counts.clear();
        runtime.current_context_key = Some(context_key);
    }
    runtime.status.last_scan_at = Some(now);
    runtime.status.active_block_type = active_block_type;
    runtime.status.active_profile = Some(active_profile.clone());
    runtime.status.focused_window = focused_window.clone();
    runtime.status.last_killed_processes.clear();
    let mut prompted_app_keys = std::mem::take(&mut runtime.prompted_app_keys);
    let mut prompted_browser_target_keys =
        std::mem::take(&mut runtime.prompted_browser_target_keys);

    let enforcement_connection = database.connection()?;
    let candidates = build_enforcement_candidates(
        &enforcement_connection,
        &processes,
        &known_apps,
        &known_browser_targets,
        &rules,
        &active_profile,
        emergency_mode,
        &preferences.emergency_allowed_apps,
        preferences.classification_popups_enabled,
        &mut prompted_app_keys,
        &mut prompted_browser_target_keys,
        app,
        focused_window.as_ref(),
    );
    runtime.prompted_app_keys = prompted_app_keys;
    runtime.prompted_browser_target_keys = prompted_browser_target_keys;
    let active_keys: HashSet<String> = candidates
        .iter()
        .map(|candidate| candidate.key.clone())
        .collect();
    runtime.warnings.retain(|key, _| active_keys.contains(key));

    for candidate in candidates {
        let normalized_name = normalize_process_name(&candidate.process_name);
        let warning_count = if runtime.warnings.contains_key(&candidate.key) {
            runtime
                .reopen_counts
                .get(&candidate.key)
                .copied()
                .unwrap_or(1)
        } else {
            let next_count = runtime
                .reopen_counts
                .get(&candidate.key)
                .copied()
                .unwrap_or(0)
                + 1;
            runtime
                .reopen_counts
                .insert(candidate.key.clone(), next_count);
            next_count
        };
        let warn_seconds = if warning_count > 3 {
            0
        } else {
            find_warn_seconds(&normalized_name, &rules)
                .unwrap_or(preferences.process_warning_seconds)
        };

        let warning = runtime
            .warnings
            .entry(candidate.key.clone())
            .or_insert_with(|| WarningState {
                kill_at: now + i64::from(warn_seconds) * 1_000,
                warning_count,
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
        warning.warning_count = warning_count;

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
                    warning_count,
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
            warning_count: warning.warning_count,
            window_title: warning.window_title.clone(),
            match_reason: warning.match_reason.clone(),
        })
        .collect();

    Ok(())
}

fn resolve_legacy_process_action(
    process_name: &str,
    rules: &[ProcessRule],
    emergency_mode: bool,
    emergency_allowed_apps: &[String],
) -> Option<ProcessAction> {
    let normalized_name = normalize_process_name(process_name);

    if emergency_mode
        && emergency_allowed_apps
            .iter()
            .any(|candidate| normalize_process_name(candidate) == normalized_name)
    {
        return Some(ProcessAction::AlwaysAllow);
    }

    if let Some(rule) = rules
        .iter()
        .find(|rule| normalize_process_name(&rule.process_name) == normalized_name)
    {
        return Some(rule.action);
    }

    None
}

fn build_enforcement_candidates(
    connection: &Connection,
    processes: &[ProcessInfo],
    known_apps: &[KnownApp],
    known_browser_targets: &[KnownBrowserTarget],
    rules: &[ProcessRule],
    active_profile: &str,
    emergency_mode: bool,
    emergency_allowed_apps: &[String],
    classification_popups_enabled: bool,
    prompted_app_keys: &mut HashSet<String>,
    prompted_browser_target_keys: &mut HashSet<String>,
    app: &AppHandle,
    focused_window: Option<&FocusedWindowInfo>,
) -> Vec<EnforcementCandidate> {
    let mut candidates = Vec::new();
    let mut seen_browser = HashSet::new();
    let known_app_map = known_apps
        .iter()
        .cloned()
        .map(|known| (known.app_key.clone(), known))
        .collect::<HashMap<_, _>>();

    for process in processes {
        let normalized_name = normalize_process_name(&process.name);
        let browser = is_browser_process_name(&normalized_name);
        let running_candidate = running_app_candidate(process);
        let known_app = known_app_map.get(&running_candidate.app_key);

        if classification_popups_enabled
            && known_app
                .map(|app| app.classification_action == ClassificationAction::Unclassified)
                .unwrap_or(false)
            && prompted_app_keys.insert(running_candidate.app_key.clone())
        {
            let _ = app.emit(
                "unknown-app-detected",
                serde_json::json!({
                    "appKey": running_candidate.app_key,
                    "displayName": running_candidate.display_name,
                    "processName": process.name,
                    "executablePath": process.exe_path,
                    "categoryGuess": running_candidate.category_guess,
                    "confidence": running_candidate.confidence
                }),
            );
        }

        if browser {
            if !focused_window_matches_process(focused_window, process) {
                continue;
            }

            let title = focused_window.and_then(clean_browser_window_title);
            let matched_target = title
                .as_deref()
                .and_then(|cleaned| match_browser_target(cleaned, known_browser_targets));
            if let Some(target) = matched_target.clone() {
                let _ = mark_browser_target_seen(connection, &target.target_key);
                if classification_popups_enabled
                    && target.classification_action == ClassificationAction::Unclassified
                    && prompted_browser_target_keys.insert(target.target_key.clone())
                {
                    let _ = app.emit(
                        "unknown-browser-target-detected",
                        serde_json::json!({
                            "targetKey": target.target_key,
                            "displayName": target.display_name,
                            "windowTitle": title,
                            "categoryName": target.category_name,
                            "confidence": target.confidence
                        }),
                    );
                }
            }

            let legacy_action = resolve_legacy_process_action(
                &process.name,
                rules,
                emergency_mode,
                emergency_allowed_apps,
            );
            let resolved_action = resolve_effective_action(
                connection,
                active_profile,
                known_app,
                matched_target.as_ref(),
                legacy_action,
            );
            let Some(action) = resolved_action else {
                continue;
            };
            let key = format!(
                "browser:{}:{}",
                normalized_name,
                matched_target
                    .as_ref()
                    .map(|target| target.target_key.clone())
                    .unwrap_or_else(|| title.clone().unwrap_or_default())
            );
            if !seen_browser.insert(key.clone()) {
                continue;
            }
            candidates.push(EnforcementCandidate {
                key,
                process_name: process.name.clone(),
                window_title: title
                    .or_else(|| focused_window.and_then(|window| window.title.clone())),
                match_reason: matched_target
                    .as_ref()
                    .map(|target| format!("matched browser target '{}'", target.display_name)),
                pid: focused_window
                    .and_then(|window| window.pid)
                    .unwrap_or(process.pid),
                action,
            });
            continue;
        }

        let legacy_action = resolve_legacy_process_action(
            &process.name,
            rules,
            emergency_mode,
            emergency_allowed_apps,
        );
        let Some(action) =
            resolve_effective_action(connection, active_profile, known_app, None, legacy_action)
        else {
            continue;
        };

        if should_enforce_action(action) {
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
        .flat_map(|ch| {
            if ch.is_alphanumeric() || ch.is_whitespace() {
                ch.to_lowercase().collect::<Vec<_>>()
            } else {
                vec![' ']
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    (!cleaned.is_empty()).then_some(cleaned)
}

fn normalize_keyword(keyword: &str) -> Option<String> {
    let normalized = keyword
        .chars()
        .flat_map(|ch| {
            if ch.is_alphanumeric() || ch.is_whitespace() {
                ch.to_lowercase().collect::<Vec<_>>()
            } else {
                vec![' ']
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    (!normalized.is_empty()).then_some(normalized)
}

fn browser_target_key_for(keyword: &str) -> String {
    normalize_process_name(keyword).replace(' ', "_")
}

fn match_browser_target(
    cleaned_title: &str,
    targets: &[KnownBrowserTarget],
) -> Option<KnownBrowserTarget> {
    let mut matches = targets
        .iter()
        .filter(|target| cleaned_title.contains(target.keyword.as_str()))
        .cloned()
        .collect::<Vec<_>>();
    matches.sort_by(|left, right| {
        right
            .confidence
            .partial_cmp(&left.confidence)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| right.keyword.len().cmp(&left.keyword.len()))
    });
    matches.into_iter().next()
}

fn mark_browser_target_seen(connection: &Connection, target_key: &str) -> Result<(), String> {
    let now = timestamp_ms();
    connection
        .execute(
            r#"
            UPDATE known_browser_targets
            SET first_seen_at = COALESCE(first_seen_at, ?1),
                last_seen_at = ?1,
                updated_at = ?1
            WHERE target_key = ?2
            "#,
            params![now, target_key],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn resolve_effective_action(
    connection: &Connection,
    active_profile: &str,
    known_app: Option<&KnownApp>,
    browser_target: Option<&KnownBrowserTarget>,
    legacy_action: Option<ProcessAction>,
) -> Option<ProcessAction> {
    if let Some(legacy_action) = legacy_action {
        if legacy_action != ProcessAction::AlwaysAllow {
            return Some(legacy_action);
        }
    }

    if known_app
        .map(|app| app.classification_action == ClassificationAction::AlwaysBan)
        .unwrap_or(false)
        || browser_target
            .map(|target| target.classification_action == ClassificationAction::AlwaysBan)
            .unwrap_or(false)
    {
        return Some(ProcessAction::AlwaysBlock);
    }

    let lineage = profile_lineage(connection, active_profile).ok()?;
    if let Some(decision) =
        resolve_profile_override_decision(connection, &lineage, known_app, browser_target)
    {
        return match decision {
            EnforcementDecision::Block => Some(if active_profile == "rest" {
                ProcessAction::AlwaysBlock
            } else {
                ProcessAction::BlockDuringWork
            }),
            EnforcementDecision::Allow => None,
        };
    }

    let classification_action = browser_target
        .map(|target| target.classification_action)
        .unwrap_or_else(|| {
            known_app
                .map(|app| app.classification_action)
                .unwrap_or(ClassificationAction::Unclassified)
        });

    match classification_action {
        ClassificationAction::AlwaysBan => Some(ProcessAction::AlwaysBlock),
        ClassificationAction::BanDuringWork if active_profile != "rest" => {
            Some(ProcessAction::BlockDuringWork)
        }
        ClassificationAction::NeverBan | ClassificationAction::Unclassified => None,
        ClassificationAction::BanDuringWork => None,
    }
}

fn profile_lineage(connection: &Connection, active_profile: &str) -> Result<Vec<String>, String> {
    let mut lineage = Vec::new();
    let mut current = Some(normalize_profile_name(active_profile)?);
    while let Some(profile_name) = current {
        if lineage.contains(&profile_name) {
            break;
        }
        lineage.push(profile_name.clone());
        current = connection
            .query_row(
                "SELECT parent_name FROM enforcement_profiles WHERE name = ?1",
                params![profile_name],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?
            .flatten();
    }
    if lineage.is_empty() {
        lineage.push("rest".to_string());
    }
    Ok(lineage)
}

fn resolve_profile_override_decision(
    connection: &Connection,
    lineage: &[String],
    known_app: Option<&KnownApp>,
    browser_target: Option<&KnownBrowserTarget>,
) -> Option<EnforcementDecision> {
    for profile_name in lineage {
        if let Some(browser_target) = browser_target {
            if let Ok(Some(decision)) = get_profile_override(
                connection,
                profile_name,
                "browser_target",
                &browser_target.target_key,
            ) {
                return Some(decision);
            }
            if let Some(category_name) = browser_target.category_name.as_ref() {
                if let Ok(Some(decision)) =
                    get_profile_override(connection, profile_name, "category", category_name)
                {
                    return Some(decision);
                }
            }
        }

        if let Some(known_app) = known_app {
            if let Ok(Some(decision)) =
                get_profile_override(connection, profile_name, "app", &known_app.app_key)
            {
                return Some(decision);
            }

            let mut category_decision = None;
            for category_name in &known_app.categories {
                if let Ok(Some(decision)) =
                    get_profile_override(connection, profile_name, "category", category_name)
                {
                    if decision == EnforcementDecision::Block {
                        return Some(decision);
                    }
                    category_decision = Some(decision);
                }
            }
            if category_decision.is_some() {
                return category_decision;
            }
        }
    }

    None
}

fn get_profile_override(
    connection: &Connection,
    profile_name: &str,
    subject_type: &str,
    subject_key: &str,
) -> Result<Option<EnforcementDecision>, String> {
    connection
        .query_row(
            "SELECT decision FROM enforcement_profile_overrides WHERE profile_name = ?1 AND subject_type = ?2 AND subject_key = ?3",
            params![profile_name, subject_type, normalize_subject_key(subject_key)],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .map(|value| enforcement_decision_from_str(&value))
        .transpose()
}

fn find_warn_seconds(process_name: &str, rules: &[ProcessRule]) -> Option<u32> {
    rules
        .iter()
        .find(|rule| normalize_process_name(&rule.process_name) == process_name)
        .and_then(|rule| rule.warn_seconds)
}

fn should_enforce_action(action: ProcessAction) -> bool {
    matches!(
        action,
        ProcessAction::AlwaysBlock | ProcessAction::BlockDuringWork | ProcessAction::Warn
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

fn normalize_profile_name(name: &str) -> Result<String, String> {
    let normalized = normalize_process_name(name);
    if normalized.is_empty() {
        return Err("profile name cannot be empty".to_string());
    }
    Ok(normalized)
}

fn normalize_subject_type(subject_type: &str) -> Result<String, String> {
    match normalize_process_name(subject_type).as_str() {
        "app" | "category" | "browser_target" => Ok(normalize_process_name(subject_type)),
        _ => Err(format!("unknown subjectType: {subject_type}")),
    }
}

fn normalize_subject_key(subject_key: &str) -> String {
    normalize_process_name(subject_key)
}

fn resolve_subject_category(
    connection: &Connection,
    subject_type: &str,
    subject_key: &str,
) -> Result<Option<String>, String> {
    match subject_type {
        "category" => Ok(Some(subject_key.to_string())),
        "app" => connection
            .query_row(
                r#"
                SELECT COALESCE(category_override, category_guess)
                FROM known_apps
                WHERE app_key = ?1
                "#,
                params![subject_key],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map(|outer| outer.flatten())
            .map_err(|error| error.to_string()),
        "browser_target" => connection
            .query_row(
                "SELECT category_name FROM known_browser_targets WHERE target_key = ?1",
                params![subject_key],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map(|outer| outer.flatten())
            .map_err(|error| error.to_string()),
        _ => Ok(None),
    }
}

pub fn get_emergency_allowlist(connection: &Connection) -> Result<Vec<KnownApp>, String> {
    ensure_enforcement_defaults(connection)?;
    let apps = get_known_apps(connection)?;
    Ok(apps
        .into_iter()
        .filter(|app| {
            let blocked = app
                .effective_category
                .as_deref()
                .map(|category| {
                    categories::EMERGENCY_BLOCKED_CATEGORIES
                        .iter()
                        .any(|forbidden| forbidden.eq_ignore_ascii_case(category))
                })
                .unwrap_or(false);
            !blocked
        })
        .collect())
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

fn classification_action_to_str(action: ClassificationAction) -> &'static str {
    match action {
        ClassificationAction::Unclassified => "unclassified",
        ClassificationAction::AlwaysBan => "always_ban",
        ClassificationAction::BanDuringWork => "ban_during_work",
        ClassificationAction::NeverBan => "never_ban",
    }
}

fn classification_action_from_str(value: &str) -> Result<ClassificationAction, String> {
    match value {
        "unclassified" => Ok(ClassificationAction::Unclassified),
        "always_ban" => Ok(ClassificationAction::AlwaysBan),
        "ban_during_work" => Ok(ClassificationAction::BanDuringWork),
        "never_ban" => Ok(ClassificationAction::NeverBan),
        _ => Err(format!("unknown classification action: {value}")),
    }
}

fn enforcement_decision_to_str(decision: EnforcementDecision) -> &'static str {
    match decision {
        EnforcementDecision::Allow => "allow",
        EnforcementDecision::Block => "block",
    }
}

fn enforcement_decision_from_str(value: &str) -> Result<EnforcementDecision, String> {
    match value {
        "allow" => Ok(EnforcementDecision::Allow),
        "block" => Ok(EnforcementDecision::Block),
        _ => Err(format!("unknown enforcement decision: {value}")),
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

fn record_enforcement_history(
    connection: &Connection,
    entity_kind: &str,
    entity_key: &str,
    action: &str,
    payload: serde_json::Value,
) {
    let _ = connection.execute(
        "INSERT INTO enforcement_history (entity_kind, entity_key, action, payload_json, occurred_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![entity_kind, entity_key, action, payload.to_string(), timestamp_ms()],
    );
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
        clean_browser_window_title, create_known_app, create_known_browser_target, get_known_apps,
        match_browser_target, running_app_candidate, update_known_app, upsert_known_app,
        FocusedWindowInfo, ProcessInfo,
    };
    use crate::{
        db::migrations::run_migrations,
        processes::models::{
            ClassificationAction, KnownAppInput, KnownAppUpdate, KnownBrowserTarget,
            KnownBrowserTargetInput,
        },
    };

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
    fn browser_target_matching_prefers_confident_keyword_hits() {
        let matched = match_browser_target(
            "github youtube video",
            &[
                KnownBrowserTarget {
                    target_key: "github".to_string(),
                    display_name: "GitHub".to_string(),
                    keyword: "github".to_string(),
                    category_name: Some("Communication".to_string()),
                    confidence: 0.7,
                    classification_action: ClassificationAction::NeverBan,
                    builtin: true,
                    first_seen_at: None,
                    last_seen_at: None,
                    updated_at: 0,
                },
                KnownBrowserTarget {
                    target_key: "youtube".to_string(),
                    display_name: "YouTube".to_string(),
                    keyword: "youtube".to_string(),
                    category_name: Some("Entertainment".to_string()),
                    confidence: 0.95,
                    classification_action: ClassificationAction::BanDuringWork,
                    builtin: true,
                    first_seen_at: None,
                    last_seen_at: None,
                    updated_at: 0,
                },
            ],
        )
        .expect("browser target should match");

        assert_eq!(matched.target_key, "youtube");
    }

    #[test]
    fn updating_known_app_can_confirm_category_and_sync_rule() {
        let connection = Connection::open_in_memory().expect("in-memory database should open");
        run_migrations(&connection).expect("migrations should run");

        let process = ProcessInfo {
            pid: 42,
            name: "discord".to_string(),
            exe_path: Some("C:/Users/test/AppData/Local/Discord/Discord.exe".to_string()),
            memory_bytes: 0,
        };
        let candidate = running_app_candidate(&process);
        upsert_known_app(&connection, &candidate, Some(1234)).expect("upsert should work");

        let updated = update_known_app(
            &connection,
            &candidate.app_key,
            KnownAppUpdate {
                category_override: Some(Some("Social Media".to_string())),
                classification_action: Some(ClassificationAction::BanDuringWork),
                classification_status: Some("confirmed".to_string()),
                sync_rule: Some(true),
                ..KnownAppUpdate::default()
            },
        )
        .expect("known app should update");

        let rule_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM process_rules WHERE process_name = 'discord'",
                [],
                |row| row.get(0),
            )
            .expect("process rule count should query");

        assert_eq!(updated.classification_status, "confirmed");
        assert_eq!(updated.category_override.as_deref(), Some("Social Media"));
        assert_eq!(updated.effective_category.as_deref(), Some("Social Media"));
        assert_eq!(rule_count, 1);
    }

    #[test]
    fn can_create_custom_browser_target_with_unicode_keyword() {
        let connection = Connection::open_in_memory().expect("in-memory database should open");
        run_migrations(&connection).expect("migrations should run");

        let created = create_known_browser_target(
            &connection,
            KnownBrowserTargetInput {
                display_name: "Bilibili".to_string(),
                keyword: "哔哩哔哩".to_string(),
                category_name: Some("Entertainment".to_string()),
                classification_action: ClassificationAction::BanDuringWork,
            },
        )
        .expect("browser target should create");

        let matched = match_browser_target("新视频 哔哩哔哩", &[created.clone()])
            .expect("unicode keyword should match");

        assert_eq!(created.keyword, "哔哩哔哩");
        assert_eq!(matched.target_key, created.target_key);
    }

    #[test]
    fn can_create_custom_known_app_and_sync_rule() {
        let connection = Connection::open_in_memory().expect("in-memory database should open");
        run_migrations(&connection).expect("migrations should run");

        let created = create_known_app(
            &connection,
            KnownAppInput {
                display_name: "Beeper".to_string(),
                executable_name: Some("beeper".to_string()),
                executable_path: Some("/Applications/Beeper.app/Contents/MacOS/Beeper".to_string()),
                app_path: Some("/Applications/Beeper.app".to_string()),
                category_names: vec!["Communication".to_string()],
                category_override: Some("Communication".to_string()),
                classification_action: ClassificationAction::BanDuringWork,
                sync_rule: Some(true),
            },
        )
        .expect("known app should create");

        let rule_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM process_rules WHERE process_name = 'beeper'",
                [],
                |row| row.get(0),
            )
            .expect("process rule count should query");

        assert_eq!(created.classification_status, "confirmed");
        assert_eq!(created.effective_category.as_deref(), Some("Communication"));
        assert_eq!(rule_count, 1);
    }
}
