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

            log::info!("database initialized at {}", database.path().display());

            app.manage(database);
            app.manage(config);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
