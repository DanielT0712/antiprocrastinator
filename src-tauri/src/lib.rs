use tauri::{Manager, RunEvent, WindowEvent};

mod analytics;
mod config;
mod db;
pub mod guard;
mod processes;
mod schedule;
mod tasks;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .on_menu_event(|app, event| {
            if event.id() == guard::watchdog::TRAY_SHOW_ID {
                let _ = guard::watchdog::show_main_window(app);
                return;
            }

            if event.id() == guard::watchdog::TRAY_REQUEST_QUIT_ID {
                handle_quit_request(app, "tray_menu");
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
            schedule::commands::skip_current_block,
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

            guard::watchdog::setup_system_tray(&app.handle()).map_err(std::io::Error::other)?;
            guard::watchdog::start_supervisor_runtime(&app.handle())
                .map_err(std::io::Error::other)?;

            schedule::engine::start_timer_loop(app.handle().clone());
            processes::monitor::start_monitor_loop(app.handle().clone());

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

    api.prevent_close();

    let minimized_to_tray = if preferences.minimize_to_tray {
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

    api.prevent_exit();
    let minimized_to_tray = if preferences.minimize_to_tray {
        guard::watchdog::hide_main_window(app).is_ok()
    } else {
        false
    };
    let _ = guard::watchdog::emit_quit_required(app, "app_exit", minimized_to_tray);
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

    if strong_guard_active {
        let _ = guard::watchdog::show_main_window(app);
        let _ = guard::watchdog::emit_quit_required(app, source, false);
        return;
    }

    let _ = guard::watchdog::disable_supervisor(app);
    if let Err(error) = guard.allow_exit_once() {
        log::warn!("failed to allow explicit quit: {error}");
        return;
    }
    app.exit(0);
}
