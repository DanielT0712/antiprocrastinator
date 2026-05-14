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

    if current_version < 5 {
        for (table, column, sql) in [
            (
                "tasks",
                "max_chunk_minutes",
                "ALTER TABLE tasks ADD COLUMN max_chunk_minutes INTEGER",
            ),
            (
                "tasks",
                "work_ratio",
                "ALTER TABLE tasks ADD COLUMN work_ratio INTEGER",
            ),
            (
                "tasks",
                "rest_ratio",
                "ALTER TABLE tasks ADD COLUMN rest_ratio INTEGER",
            ),
            (
                "tasks",
                "protect_generated_blocks",
                "ALTER TABLE tasks ADD COLUMN protect_generated_blocks INTEGER NOT NULL DEFAULT 0",
            ),
            (
                "time_blocks",
                "is_protected",
                "ALTER TABLE time_blocks ADD COLUMN is_protected INTEGER NOT NULL DEFAULT 0",
            ),
        ] {
            let pragma_query =
                format!("SELECT COUNT(*) FROM pragma_table_info('{table}') WHERE name = ?1");
            let has_column: i32 =
                connection.query_row(&pragma_query, [column], |row| row.get(0))?;

            if has_column == 0 {
                connection.execute(sql, [])?;
            }
        }
    }

    if current_version < 6 {
        for (column, sql) in [
            (
                "min_chunk_minutes",
                "ALTER TABLE tasks ADD COLUMN min_chunk_minutes INTEGER",
            ),
            (
                "minimum_rest_minutes",
                "ALTER TABLE tasks ADD COLUMN minimum_rest_minutes INTEGER",
            ),
        ] {
            let pragma_query = "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = ?1";
            let has_column: i32 = connection.query_row(pragma_query, [column], |row| row.get(0))?;

            if has_column == 0 {
                connection.execute(sql, [])?;
            }
        }
    }

    if current_version < 7 {
        for (table, column, sql) in [
            (
                "tasks",
                "enforcement_profile",
                "ALTER TABLE tasks ADD COLUMN enforcement_profile TEXT",
            ),
            (
                "time_blocks",
                "enforcement_profile",
                "ALTER TABLE time_blocks ADD COLUMN enforcement_profile TEXT",
            ),
            (
                "known_apps",
                "classification_action",
                "ALTER TABLE known_apps ADD COLUMN classification_action TEXT NOT NULL DEFAULT 'unclassified'",
            ),
        ] {
            let pragma_query =
                format!("SELECT COUNT(*) FROM pragma_table_info('{table}') WHERE name = ?1");
            let has_column: i32 = connection.query_row(&pragma_query, [column], |row| row.get(0))?;

            if has_column == 0 {
                connection.execute(sql, [])?;
            }
        }

        connection.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS app_categories (
                name TEXT PRIMARY KEY,
                builtin INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS app_category_memberships (
                app_key TEXT NOT NULL,
                category_name TEXT NOT NULL,
                PRIMARY KEY (app_key, category_name),
                FOREIGN KEY (app_key) REFERENCES known_apps(app_key) ON DELETE CASCADE,
                FOREIGN KEY (category_name) REFERENCES app_categories(name) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS known_browser_targets (
                target_key TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                keyword TEXT NOT NULL,
                category_name TEXT,
                confidence REAL NOT NULL DEFAULT 0.0,
                classification_action TEXT NOT NULL DEFAULT 'unclassified',
                builtin INTEGER NOT NULL DEFAULT 0,
                first_seen_at INTEGER,
                last_seen_at INTEGER,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (category_name) REFERENCES app_categories(name) ON DELETE SET NULL
            );
            CREATE TABLE IF NOT EXISTS enforcement_profiles (
                name TEXT PRIMARY KEY,
                parent_name TEXT,
                builtin INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (parent_name) REFERENCES enforcement_profiles(name) ON DELETE SET NULL
            );
            CREATE TABLE IF NOT EXISTS enforcement_profile_overrides (
                profile_name TEXT NOT NULL,
                subject_type TEXT NOT NULL,
                subject_key TEXT NOT NULL,
                decision TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (profile_name, subject_type, subject_key),
                FOREIGN KEY (profile_name) REFERENCES enforcement_profiles(name) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS enforcement_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_kind TEXT NOT NULL,
                entity_key TEXT NOT NULL,
                action TEXT NOT NULL,
                payload_json TEXT,
                occurred_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS schedule_mutation_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                occurred_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_known_apps_classification_action ON known_apps(classification_action);
            CREATE INDEX IF NOT EXISTS idx_app_category_memberships_category_name ON app_category_memberships(category_name);
            CREATE INDEX IF NOT EXISTS idx_known_browser_targets_classification_action ON known_browser_targets(classification_action);
            CREATE INDEX IF NOT EXISTS idx_enforcement_history_occurred_at ON enforcement_history(occurred_at);
            CREATE INDEX IF NOT EXISTS idx_schedule_mutation_history_occurred_at ON schedule_mutation_history(occurred_at);
            "#,
        )?;
    }

    if current_version < 9 {
        for (column, ddl) in [
            (
                "kind",
                "ALTER TABLE tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'flexible'",
            ),
            (
                "fixed_window_start_minute",
                "ALTER TABLE tasks ADD COLUMN fixed_window_start_minute INTEGER",
            ),
            (
                "fixed_window_end_minute",
                "ALTER TABLE tasks ADD COLUMN fixed_window_end_minute INTEGER",
            ),
            (
                "recurrence_kind",
                "ALTER TABLE tasks ADD COLUMN recurrence_kind TEXT NOT NULL DEFAULT 'none'",
            ),
            (
                "recurrence_days_mask",
                "ALTER TABLE tasks ADD COLUMN recurrence_days_mask INTEGER NOT NULL DEFAULT 0",
            ),
            (
                "recurrence_anchor_date",
                "ALTER TABLE tasks ADD COLUMN recurrence_anchor_date INTEGER",
            ),
        ] {
            let exists: i32 = connection.query_row(
                "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = ?1",
                [column],
                |row| row.get(0),
            )?;
            if exists == 0 {
                connection.execute(ddl, [])?;
            }
        }
    }

    // Idempotent: ensures columns exist even if user_version was advanced
    // by an earlier build that didn't add them. Cheap pragma lookup.
    for column in ["recurrence_dates", "recurrence_overrides"] {
        let exists: i32 = connection.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = ?1",
            [column],
            |row| row.get(0),
        )?;
        if exists == 0 {
            let ddl = format!("ALTER TABLE tasks ADD COLUMN {column} TEXT");
            connection.execute(&ddl, [])?;
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
