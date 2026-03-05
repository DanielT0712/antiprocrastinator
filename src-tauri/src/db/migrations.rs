use rusqlite::Connection;

use super::schema::{CURRENT_SCHEMA_VERSION, INITIAL_SCHEMA};

pub fn run_migrations(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.execute_batch("PRAGMA foreign_keys = ON;")?;

    let current_version: i32 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;

    if current_version < 1 {
        connection.execute_batch(INITIAL_SCHEMA)?;
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

        assert_eq!(version, CURRENT_SCHEMA_VERSION);
        assert_eq!(task_group_count, 1);
    }
}
