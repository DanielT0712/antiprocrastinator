use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

pub mod migrations;
pub mod schema;

pub struct DatabaseState {
    connection: Mutex<Connection>,
    path: PathBuf,
}

impl DatabaseState {
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        let path = database_path(app)?;

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }

        let connection = Connection::open(&path).map_err(|error| error.to_string())?;
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .map_err(|error| error.to_string())?;

        migrations::run_migrations(&connection).map_err(|error| error.to_string())?;

        Ok(Self {
            connection: Mutex::new(connection),
            path,
        })
    }

    pub fn connection(&self) -> Result<MutexGuard<'_, Connection>, String> {
        self.connection.lock().map_err(|error| error.to_string())
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    path.push("antiprocrastinator.sqlite3");
    Ok(path)
}
