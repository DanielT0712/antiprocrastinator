use tauri::{Manager, RunEvent, WindowEvent};

const APP_MENU_QUIT_ID: &str = "app_menu_quit";

mod analytics;
mod config;
mod db;
pub mod guard;
#[cfg(target_os = "macos")]
mod macos_quit;
mod processes;
mod schedule;
mod tasks;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            let _ = guard::watchdog::show_main_window(app);
        }))
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .on_menu_event(|app, event| {
            if event.id() == guard::watchdog::TRAY_SHOW_ID {
                let _ = guard::watchdog::show_main_window(app);
                return;
            }

            if event.id() == guard::watchdog::TRAY_REQUEST_QUIT_ID {
                handle_quit_request(app, "tray_menu");
                return;
            }

            if event.id() == APP_MENU_QUIT_ID {
                handle_quit_request(app, "app_menu");
            }
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                handle_window_close(window, api);
            }
        })
        .on_tray_icon_event(|app, event| {
            guard::watchdog::handle_tray_event(app, &event);
        })
        .invoke_handler(tauri::generate_handler![
            schedule::commands::get_current_block,
            schedule::commands::get_next_block,
            schedule::commands::get_projected_finish,
            schedule::commands::get_pause_buffer_minutes,
            schedule::commands::get_schedule_range,
            schedule::commands::get_schedule_mutation_history,
            schedule::commands::add_time_block,
            schedule::commands::update_time_block,
            schedule::commands::delete_time_block,
            schedule::commands::apply_weekly_template,
            schedule::commands::get_weekly_template,
            schedule::commands::save_weekly_template,
            schedule::commands::complete_current_block,
            schedule::commands::extend_current_block,
            schedule::commands::pause_current_block,
            schedule::commands::resume_current_block,
            schedule::commands::continue_current_block,
            schedule::commands::start_emergency_block,
            schedule::commands::rebuild_schedule,
            analytics::commands::get_daily_summary,
            analytics::commands::get_focus_stats,
            analytics::commands::get_task_completion_stats,
            analytics::commands::get_process_kill_stats,
            processes::commands::get_running_processes,
            processes::commands::get_focused_window,
            processes::commands::get_known_apps,
            processes::commands::get_app_icon,
            processes::commands::get_emergency_allowlist,
            processes::commands::get_emergency_blocked_categories,
            processes::commands::refresh_known_apps_inventory,
            processes::commands::update_known_app,
            processes::commands::create_known_app,
            processes::commands::get_known_browser_targets,
            processes::commands::update_known_browser_target,
            processes::commands::create_known_browser_target,
            processes::commands::get_pending_classifications,
            processes::commands::get_process_rules,
            processes::commands::set_process_rule,
            processes::commands::delete_process_rule,
            processes::commands::get_process_categories,
            processes::commands::get_app_categories,
            processes::commands::upsert_app_category,
            processes::commands::delete_app_category,
            processes::commands::get_enforcement_profiles,
            processes::commands::upsert_enforcement_profile,
            processes::commands::delete_enforcement_profile,
            processes::commands::get_enforcement_profile_overrides,
            processes::commands::set_enforcement_profile_override,
            processes::commands::delete_enforcement_profile_override,
            processes::commands::get_enforcement_status,
            processes::commands::get_blocked_processes_log,
            processes::commands::get_enforcement_history,
            tasks::commands::get_tasks,
            tasks::commands::search_tasks,
            tasks::commands::create_task,
            tasks::commands::update_task,
            tasks::commands::delete_task,
            tasks::commands::get_task_groups,
            tasks::commands::create_task_group,
            tasks::commands::update_task_group,
            tasks::commands::delete_task_group,
            tasks::commands::get_task_stats,
            config::manager::get_preferences,
            config::manager::update_preferences,
            guard::commands::request_quit,
            guard::commands::confirm_quit,
            guard::commands::suspend_guard,
            guard::commands::get_guard_status,
            guard::commands::frontend_heartbeat,
            guard::commands::get_active_warning,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let database = db::DatabaseState::new(app.handle()).map_err(std::io::Error::other)?;
            let config =
                config::manager::ConfigState::new(app.handle()).map_err(std::io::Error::other)?;
            let schedule = schedule::engine::ScheduleState::new();
            let processes = processes::monitor::new_state();
            let guard = guard::watchdog::GuardState::new();

            log::info!("database initialized at {}", database.path().display());

            app.manage(database);
            app.manage(config);
            app.manage(schedule);
            app.manage(processes);
            app.manage(guard);

            install_app_menu(&app.handle()).map_err(std::io::Error::other)?;
            #[cfg(target_os = "macos")]
            macos_quit::install(app.handle().clone()).map_err(std::io::Error::other)?;
            guard::watchdog::setup_system_tray(&app.handle()).map_err(std::io::Error::other)?;
            guard::watchdog::start_supervisor_runtime(&app.handle())
                .map_err(std::io::Error::other)?;
            spawn_termination_signal_listener(app.handle().clone());

            schedule::engine::start_timer_loop(app.handle().clone());
            processes::monitor::start_monitor_loop(app.handle().clone());
            repair_generated_schedule(&app.handle());

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            RunEvent::ExitRequested { api, code, .. } => {
                handle_exit_request(app, &api, code);
            }
            RunEvent::Reopen { .. } => {
                let _ = guard::watchdog::show_main_window(app);
            }
            _ => {}
        });
}

fn repair_generated_schedule(app: &tauri::AppHandle) {
    let database = app.state::<db::DatabaseState>();
    let config = app.state::<config::manager::ConfigState>();
    let connection = match database.connection() {
        Ok(connection) => connection,
        Err(error) => {
            log::warn!("failed to open database for startup schedule repair: {error}");
            return;
        }
    };
    let preferences = match config.get_preferences() {
        Ok(preferences) => preferences,
        Err(error) => {
            log::warn!("failed to load preferences for startup schedule repair: {error}");
            return;
        }
    };
    if let Err(error) = schedule::engine::repair_generated_schedule(&connection, &preferences) {
        log::warn!("failed to repair generated schedule on startup: {error}");
    }
}

fn handle_window_close<R: tauri::Runtime>(window: &tauri::Window<R>, api: &tauri::CloseRequestApi) {
    let app = window.app_handle();
    let preferences = match app
        .state::<config::manager::ConfigState>()
        .get_preferences()
    {
        Ok(preferences) => preferences,
        Err(error) => {
            log::warn!("failed to load preferences during close interception: {error}");
            return;
        }
    };

    let guard = app.state::<guard::watchdog::GuardState>();
    let strong_guard_active =
        preferences.strong_guard_enabled && guard.is_active().unwrap_or(false);

    if !strong_guard_active && !preferences.minimize_to_tray {
        return;
    }

    // If the React UI hasn't pinged in 15s (e.g. white screen / mount
    // failure), the challenge dialog can never render. Don't trap the
    // user — let the close proceed; the exit handler will then disable
    // the supervisor through its non-generic AppHandle path.
    if strong_guard_active && !guard.frontend_alive(15_000) {
        log::warn!("frontend heartbeat stale during close; bypassing strong guard");
        let _ = guard.allow_exit_once();
        return;
    }

    api.prevent_close();

    // When strong guard is on, the close button means "I want to stop the
    // app" — show the challenge dialog instead of silently minimizing,
    // otherwise the user sees the window disappear and assumes the click
    // worked. Only minimize-to-tray when strong guard is off.
    let minimized_to_tray = if strong_guard_active {
        let _ = guard::watchdog::show_main_window(app);
        false
    } else if preferences.minimize_to_tray {
        guard::watchdog::hide_main_window(app).is_ok()
    } else {
        let _ = guard::watchdog::show_main_window(app);
        false
    };

    if strong_guard_active {
        let _ = guard::watchdog::emit_quit_required(app, "window_close", minimized_to_tray);
    }
}

fn handle_exit_request(app: &tauri::AppHandle, api: &tauri::ExitRequestApi, code: Option<i32>) {
    let guard = app.state::<guard::watchdog::GuardState>();
    match guard.consume_exit_allowance() {
        Ok(true) => return,
        Ok(false) => {}
        Err(error) => {
            log::warn!("failed to read quit allowance during exit interception: {error}");
        }
    }

    if code == Some(tauri::RESTART_EXIT_CODE) {
        return;
    }

    let preferences = match app
        .state::<config::manager::ConfigState>()
        .get_preferences()
    {
        Ok(preferences) => preferences,
        Err(error) => {
            log::warn!("failed to load preferences during exit interception: {error}");
            return;
        }
    };

    let strong_guard_active =
        preferences.strong_guard_enabled && guard.is_active().unwrap_or(false);
    if !strong_guard_active {
        let _ = guard::watchdog::disable_supervisor(app);
        return;
    }

    if !guard.frontend_alive(15_000) {
        log::warn!("frontend heartbeat stale during exit; bypassing strong guard");
        let _ = guard::watchdog::disable_supervisor(app);
        return;
    }

    api.prevent_exit();
    let _ = guard::watchdog::show_main_window(app);
    let _ = guard::watchdog::emit_quit_required(app, "app_exit", false);
}

fn handle_quit_request(app: &tauri::AppHandle, source: &str) {
    let preferences = match app
        .state::<config::manager::ConfigState>()
        .get_preferences()
    {
        Ok(preferences) => preferences,
        Err(error) => {
            log::warn!("failed to load preferences during quit request: {error}");
            return;
        }
    };

    let guard = app.state::<guard::watchdog::GuardState>();
    let strong_guard_active =
        preferences.strong_guard_enabled && guard.is_active().unwrap_or(false);

    if strong_guard_active && guard.frontend_alive(15_000) {
        let _ = guard::watchdog::show_main_window(app);
        let _ = guard::watchdog::emit_quit_required(app, source, false);
        return;
    }

    if strong_guard_active {
        log::warn!("frontend heartbeat stale during quit ({source}); bypassing strong guard");
    }

    let _ = guard::watchdog::disable_supervisor(app);
    if let Err(error) = guard.allow_exit_once() {
        log::warn!("failed to allow explicit quit: {error}");
        return;
    }
    app.exit(0);
}

/// Listen for SIGTERM / SIGINT (Unix) or Ctrl+C (Windows). On signal:
/// behave the same way Cmd+Q / dock Quit / window close do — surface a
/// quit-required event so the in-app challenge dialog appears, and let
/// the rest of the strong-guard flow decide whether the app exits. We
/// intentionally do NOT disable the supervisor or call app.exit here:
/// that would let any terminal user kill strong guard via `kill -TERM`
/// (or macOS dock right-click Quit, which sends SIGTERM).
///
/// In a dev session the OS escalates SIGTERM to SIGKILL after a short
/// timeout, the binary dies, and the helper exits its loop because the
/// binary lives under `target/` (see is_development_binary). In a
/// packaged release the user has to type the challenge phrase, exactly
/// like every other quit path.
fn spawn_termination_signal_listener(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            wait_for_termination_signal().await;
            log::info!(
                "termination signal received; emitting quit-required (supervisor stays active)"
            );
            let preferences = match app
                .state::<config::manager::ConfigState>()
                .get_preferences()
            {
                Ok(p) => Some(p),
                Err(error) => {
                    log::warn!("failed to load preferences on termination: {error}");
                    None
                }
            };
            let guard = app.state::<guard::watchdog::GuardState>();
            let strong_guard_active = preferences
                .as_ref()
                .map(|p| p.strong_guard_enabled)
                .unwrap_or(true)
                && guard.is_active().unwrap_or(false);

            if strong_guard_active {
                let _ = guard::watchdog::show_main_window(&app);
                let _ = guard::watchdog::emit_quit_required(&app, "signal", false);
                continue;
            }

            // Strong guard is off (developer toggled it, or release-mode user
            // explicitly disabled). Exit cleanly so the helper can stop too.
            let _ = guard::watchdog::disable_supervisor(&app);
            if let Err(error) = guard.allow_exit_once() {
                log::warn!("failed to allow termination exit: {error}");
            }
            app.exit(0);
            break;
        }
    });
}

#[cfg(unix)]
async fn wait_for_termination_signal() {
    use tokio::signal::unix::{signal, SignalKind};
    let mut term = match signal(SignalKind::terminate()) {
        Ok(stream) => stream,
        Err(error) => {
            log::warn!("failed to install SIGTERM handler: {error}");
            return;
        }
    };
    let mut int = match signal(SignalKind::interrupt()) {
        Ok(stream) => stream,
        Err(error) => {
            log::warn!("failed to install SIGINT handler: {error}");
            return;
        }
    };
    tokio::select! {
        _ = term.recv() => {}
        _ = int.recv() => {}
    }
}

#[cfg(windows)]
async fn wait_for_termination_signal() {
    if let Err(error) = tokio::signal::ctrl_c().await {
        log::warn!("failed to wait for Ctrl+C: {error}");
    }
}

/// Install a custom application menu so the system Cmd+Q (and the
/// "Quit AntiProcrastinator" item in the app menubar on macOS) is
/// routed through our quit flow instead of bypassing it. Without this
/// the default Tauri menu hands Cmd+Q straight to the OS, which kills
/// the process before strong guard can intervene.
fn install_app_menu(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri::menu::{AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder};

    let quit_item = MenuItemBuilder::with_id(APP_MENU_QUIT_ID, "Quit AntiProcrastinator…")
        .accelerator("CmdOrCtrl+Q")
        .build(app)
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    let menu = {
        let about_metadata = AboutMetadataBuilder::new()
            .name(Some("AntiProcrastinator"))
            .build();
        let app_submenu = SubmenuBuilder::new(app, "AntiProcrastinator")
            .about(Some(about_metadata))
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .item(&quit_item)
            .build()
            .map_err(|e| e.to_string())?;
        let edit_submenu = SubmenuBuilder::new(app, "Edit")
            .undo()
            .redo()
            .separator()
            .cut()
            .copy()
            .paste()
            .select_all()
            .build()
            .map_err(|e| e.to_string())?;
        let window_submenu = SubmenuBuilder::new(app, "Window")
            .minimize()
            .build()
            .map_err(|e| e.to_string())?;
        MenuBuilder::new(app)
            .items(&[&app_submenu, &edit_submenu, &window_submenu])
            .build()
            .map_err(|e| e.to_string())?
    };

    #[cfg(not(target_os = "macos"))]
    let menu = {
        let _ = AboutMetadataBuilder::new();
        let file_submenu = SubmenuBuilder::new(app, "File")
            .item(&quit_item)
            .build()
            .map_err(|e| e.to_string())?;
        MenuBuilder::new(app)
            .items(&[&file_submenu])
            .build()
            .map_err(|e| e.to_string())?
    };

    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}
