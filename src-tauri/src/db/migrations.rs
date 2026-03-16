use rusqlite::Connection;

use super::schema::{CURRENT_SCHEMA_VERSION, INITIAL_SCHEMA};

pub fn run_migrations(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.execute_batch("PRAGMA foreign_keys = ON;")?;

    let current_version: i32 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;

    if current_version < 1 {
        connection.execute_batch(INITIAL_SCHEMA)?;
    }

    if current_version < 2 {
        let has_source_column: i32 = connection.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('time_blocks') WHERE name = 'source'",
            [],
            |row| row.get(0),
        )?;

        if has_source_column == 0 {
            connection.execute(
                "ALTER TABLE time_blocks ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'",
                [],
            )?;
        }
    }

    if current_version < 3 {
        connection.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS known_apps (
                app_key TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                executable_name TEXT,
                executable_path TEXT,
                app_path TEXT,
                platform TEXT NOT NULL,
                source TEXT NOT NULL,
                category_guess TEXT,
                category_override TEXT,
                confidence REAL NOT NULL DEFAULT 0.0,
                classification_status TEXT NOT NULL DEFAULT 'unclassified',
                first_seen_at INTEGER NOT NULL,
                last_seen_running_at INTEGER,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_known_apps_status ON known_apps(classification_status);
            CREATE INDEX IF NOT EXISTS idx_known_apps_updated_at ON known_apps(updated_at);
            "#,
        )?;
    }

    if current_version < 4 {
        let has_category_override: i32 = connection.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('known_apps') WHERE name = 'category_override'",
            [],
            |row| row.get(0),
        )?;

        if has_category_override == 0 {
            connection.execute(
                "ALTER TABLE known_apps ADD COLUMN category_override TEXT",
                [],
            )?;
        }
    }

    if current_version != CURRENT_SCHEMA_VERSION {
        connection.pragma_update(None, "user_version", CURRENT_SCHEMA_VERSION)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::run_migrations;
    use crate::db::schema::CURRENT_SCHEMA_VERSION;

    #[test]
    fn initializes_schema_on_fresh_database() {
        let connection = Connection::open_in_memory().expect("in-memory database should open");

        run_migrations(&connection).expect("migrations should run");

        let version: i32 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("user_version should be readable");
        let task_group_count: i32 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'task_groups'",
                [],
                |row| row.get(0),
            )
            .expect("sqlite_master query should work");
        let known_apps_count: i32 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'known_apps'",
                [],
                |row| row.get(0),
            )
            .expect("sqlite_master query should work");

        assert_eq!(version, CURRENT_SCHEMA_VERSION);
        assert_eq!(task_group_count, 1);
        assert_eq!(known_apps_count, 1);
    }
}
