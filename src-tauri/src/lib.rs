use tauri::Manager;

mod analytics;
mod config;
mod db;
mod guard;
mod processes;
mod schedule;
mod tasks;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            schedule::commands::get_current_block,
            schedule::commands::get_next_block,
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
            tasks::commands::get_task_stats,
            config::manager::get_preferences,
            config::manager::update_preferences,
            guard::commands::request_quit,
            guard::commands::confirm_quit,
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
            schedule::engine::start_timer_loop(app.handle().clone());
            processes::monitor::start_monitor_loop(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
