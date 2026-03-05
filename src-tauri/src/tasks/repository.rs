use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, Row};

use super::models::{NewTask, Task, TaskFilter, TaskGroup, TaskStats, TaskUpdate};

pub fn get_tasks(connection: &Connection, filter: Option<TaskFilter>) -> Result<Vec<Task>, String> {
    let filter = filter.unwrap_or_default();
    let query = normalized_query(filter.query);

    let mut statement = match (filter.group_id, query.as_ref()) {
        (Some(_), Some(_)) => connection
            .prepare(
                r#"
                SELECT id, name, group_id, priority, estimated_minutes, deadline,
                       average_priority, average_actual_minutes, completion_count,
                       created_at, updated_at
                FROM tasks
                WHERE group_id = ?1 AND LOWER(name) LIKE LOWER(?2)
                ORDER BY updated_at DESC, name ASC
                "#,
            )
            .map_err(|error| error.to_string())?,
        (Some(_), None) => connection
            .prepare(
                r#"
                SELECT id, name, group_id, priority, estimated_minutes, deadline,
                       average_priority, average_actual_minutes, completion_count,
                       created_at, updated_at
                FROM tasks
                WHERE group_id = ?1
                ORDER BY updated_at DESC, name ASC
                "#,
            )
            .map_err(|error| error.to_string())?,
        (None, Some(_)) => connection
            .prepare(
                r#"
                SELECT id, name, group_id, priority, estimated_minutes, deadline,
                       average_priority, average_actual_minutes, completion_count,
                       created_at, updated_at
                FROM tasks
                WHERE LOWER(name) LIKE LOWER(?1)
                ORDER BY updated_at DESC, name ASC
                "#,
            )
            .map_err(|error| error.to_string())?,
        (None, None) => connection
            .prepare(
                r#"
                SELECT id, name, group_id, priority, estimated_minutes, deadline,
                       average_priority, average_actual_minutes, completion_count,
                       created_at, updated_at
                FROM tasks
                ORDER BY updated_at DESC, name ASC
                "#,
            )
            .map_err(|error| error.to_string())?,
    };

    let mapped_rows = match (filter.group_id, query.as_ref()) {
        (Some(group_id), Some(query)) => statement.query_map(params![group_id, query], map_task),
        (Some(group_id), None) => statement.query_map(params![group_id], map_task),
        (None, Some(query)) => statement.query_map(params![query], map_task),
        (None, None) => statement.query_map([], map_task),
    }
    .map_err(|error| error.to_string())?;

    mapped_rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

pub fn search_tasks(connection: &Connection, query: &str) -> Result<Vec<Task>, String> {
    let query = format!("%{}%", query.trim());
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, name, group_id, priority, estimated_minutes, deadline,
                   average_priority, average_actual_minutes, completion_count,
                   created_at, updated_at
            FROM tasks
            WHERE LOWER(name) LIKE LOWER(?1)
            ORDER BY completion_count DESC, updated_at DESC, name ASC
            LIMIT 10
            "#,
        )
        .map_err(|error| error.to_string())?;

    let tasks = statement
        .query_map(params![query], map_task)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(tasks)
}

pub fn create_task(connection: &Connection, new_task: NewTask) -> Result<Task, String> {
    let name = validate_name(&new_task.name)?;
    let priority = validate_priority(new_task.priority.unwrap_or(3))?;
    validate_minutes(new_task.estimated_minutes)?;

    let now = timestamp_ms();
    connection
        .execute(
            r#"
            INSERT INTO tasks (
                name, group_id, priority, estimated_minutes, deadline,
                average_priority, average_actual_minutes, completion_count,
                created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            "#,
            params![
                name,
                new_task.group_id,
                priority,
                new_task.estimated_minutes,
                new_task.deadline,
                priority as f64,
                Option::<f64>::None,
                0_i64,
                now,
                now
            ],
        )
        .map_err(|error| error.to_string())?;

    get_task_by_id(connection, connection.last_insert_rowid())
}

pub fn update_task(connection: &Connection, id: i64, updates: TaskUpdate) -> Result<Task, String> {
    let existing = get_task_by_id(connection, id)?;
    let name = match updates.name {
        Some(value) => validate_name(&value)?,
        None => existing.name,
    };
    let group_id = updates.group_id.unwrap_or(existing.group_id);
    let priority = validate_priority(updates.priority.unwrap_or(existing.priority))?;
    let estimated_minutes = updates
        .estimated_minutes
        .unwrap_or(existing.estimated_minutes);
    let deadline = updates.deadline.unwrap_or(existing.deadline);
    let average_priority = validate_average_priority(
        updates
            .average_priority
            .unwrap_or(existing.average_priority),
    )?;
    let average_actual_minutes = validate_average_minutes(
        updates
            .average_actual_minutes
            .unwrap_or(existing.average_actual_minutes),
    )?;
    let completion_count = validate_completion_count(
        updates
            .completion_count
            .unwrap_or(existing.completion_count),
    )?;

    validate_minutes(estimated_minutes)?;

    connection
        .execute(
            r#"
            UPDATE tasks
            SET name = ?1,
                group_id = ?2,
                priority = ?3,
                estimated_minutes = ?4,
                deadline = ?5,
                average_priority = ?6,
                average_actual_minutes = ?7,
                completion_count = ?8,
                updated_at = ?9
            WHERE id = ?10
            "#,
            params![
                name,
                group_id,
                priority,
                estimated_minutes,
                deadline,
                average_priority,
                average_actual_minutes,
                completion_count,
                timestamp_ms(),
                id
            ],
        )
        .map_err(|error| error.to_string())?;

    get_task_by_id(connection, id)
}

pub fn delete_task(connection: &Connection, id: i64) -> Result<(), String> {
    let affected = connection
        .execute("DELETE FROM tasks WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;

    if affected == 0 {
        return Err(format!("task {id} does not exist"));
    }

    Ok(())
}

pub fn get_task_groups(connection: &Connection) -> Result<Vec<TaskGroup>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, name, color, created_at
            FROM task_groups
            ORDER BY name ASC
            "#,
        )
        .map_err(|error| error.to_string())?;

    let groups = statement
        .query_map([], map_task_group)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(groups)
}

pub fn create_task_group(
    connection: &Connection,
    name: &str,
    color: Option<String>,
) -> Result<TaskGroup, String> {
    let name = validate_name(name)?;
    let created_at = timestamp_ms();

    connection
        .execute(
            "INSERT INTO task_groups (name, color, created_at) VALUES (?1, ?2, ?3)",
            params![name, color, created_at],
        )
        .map_err(|error| error.to_string())?;

    get_task_group_by_id(connection, connection.last_insert_rowid())
}

pub fn get_task_stats(connection: &Connection, task_id: i64) -> Result<TaskStats, String> {
    let task = get_task_by_id(connection, task_id)?;
    Ok(TaskStats {
        task_id: task.id,
        average_priority: task.average_priority,
        average_actual_minutes: task.average_actual_minutes,
        completion_count: task.completion_count,
    })
}

fn get_task_by_id(connection: &Connection, id: i64) -> Result<Task, String> {
    connection
        .query_row(
            r#"
            SELECT id, name, group_id, priority, estimated_minutes, deadline,
                   average_priority, average_actual_minutes, completion_count,
                   created_at, updated_at
            FROM tasks
            WHERE id = ?1
            "#,
            params![id],
            map_task,
        )
        .map_err(|error| error.to_string())
}

fn get_task_group_by_id(connection: &Connection, id: i64) -> Result<TaskGroup, String> {
    connection
        .query_row(
            "SELECT id, name, color, created_at FROM task_groups WHERE id = ?1",
            params![id],
            map_task_group,
        )
        .map_err(|error| error.to_string())
}

fn map_task(row: &Row<'_>) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get(0)?,
        name: row.get(1)?,
        group_id: row.get(2)?,
        priority: row.get(3)?,
        estimated_minutes: row.get(4)?,
        deadline: row.get(5)?,
        average_priority: row.get(6)?,
        average_actual_minutes: row.get(7)?,
        completion_count: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn map_task_group(row: &Row<'_>) -> rusqlite::Result<TaskGroup> {
    Ok(TaskGroup {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
        created_at: row.get(3)?,
    })
}

fn validate_name(value: &str) -> Result<String, String> {
    let trimmed = value.trim();

    if trimmed.is_empty() {
        return Err("name cannot be empty".to_string());
    }

    Ok(trimmed.to_string())
}

fn validate_priority(value: i64) -> Result<i64, String> {
    if !(1..=5).contains(&value) {
        return Err("priority must be between 1 and 5".to_string());
    }

    Ok(value)
}

fn validate_average_priority(value: f64) -> Result<f64, String> {
    if !(1.0..=5.0).contains(&value) {
        return Err("averagePriority must be between 1.0 and 5.0".to_string());
    }

    Ok(value)
}

fn validate_minutes(value: Option<i64>) -> Result<(), String> {
    if let Some(minutes) = value {
        if minutes <= 0 {
            return Err("estimatedMinutes must be greater than 0".to_string());
        }
    }

    Ok(())
}

fn validate_average_minutes(value: Option<f64>) -> Result<Option<f64>, String> {
    if let Some(minutes) = value {
        if minutes <= 0.0 {
            return Err("averageActualMinutes must be greater than 0".to_string());
        }
    }

    Ok(value)
}

fn validate_completion_count(value: i64) -> Result<i64, String> {
    if value < 0 {
        return Err("completionCount cannot be negative".to_string());
    }

    Ok(value)
}

fn normalized_query(query: Option<String>) -> Option<String> {
    query
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(|value| format!("%{value}%"))
}

fn timestamp_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::{
        create_task, create_task_group, delete_task, get_task_groups, get_task_stats, get_tasks,
        search_tasks, update_task,
    };
    use crate::{
        db::migrations::run_migrations,
        tasks::models::{NewTask, TaskFilter, TaskUpdate},
    };

    fn setup_connection() -> Connection {
        let connection = Connection::open_in_memory().expect("in-memory database should open");
        run_migrations(&connection).expect("migrations should run");
        connection
    }

    #[test]
    fn creates_and_queries_tasks() {
        let connection = setup_connection();
        let group = create_task_group(&connection, "Work", Some("#6366f1".to_string()))
            .expect("group should be created");

        let task = create_task(
            &connection,
            NewTask {
                name: "Write docs".to_string(),
                group_id: Some(group.id),
                priority: Some(4),
                estimated_minutes: Some(45),
                deadline: None,
            },
        )
        .expect("task should be created");

        let tasks = get_tasks(
            &connection,
            Some(TaskFilter {
                group_id: Some(group.id),
                query: Some("write".to_string()),
            }),
        )
        .expect("task query should work");

        assert_eq!(task.name, "Write docs");
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].priority, 4);
        assert_eq!(
            get_task_groups(&connection)
                .expect("groups should load")
                .len(),
            1
        );
    }

    #[test]
    fn updates_searches_and_deletes_tasks() {
        let connection = setup_connection();
        let task = create_task(
            &connection,
            NewTask {
                name: "Inbox zero".to_string(),
                group_id: None,
                priority: Some(3),
                estimated_minutes: None,
                deadline: None,
            },
        )
        .expect("task should be created");

        let updated = update_task(
            &connection,
            task.id,
            TaskUpdate {
                priority: Some(5),
                completion_count: Some(7),
                average_actual_minutes: Some(Some(18.5)),
                ..TaskUpdate::default()
            },
        )
        .expect("task should update");

        let matches = search_tasks(&connection, "Inbox").expect("search should work");
        let stats = get_task_stats(&connection, task.id).expect("stats should load");

        assert_eq!(updated.priority, 5);
        assert_eq!(matches.len(), 1);
        assert_eq!(stats.completion_count, 7);

        delete_task(&connection, task.id).expect("task should delete");
        assert!(get_tasks(&connection, None)
            .expect("tasks should load")
            .is_empty());
    }
}
