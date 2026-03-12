use rusqlite::{params, Connection};

use super::models::{DailySummary, FocusStatPoint, ProcessKillStat, TaskCompletionStat};

pub fn get_daily_summary(connection: &Connection, date: String) -> Result<DailySummary, String> {
    let focus_minutes = query_i64(
        connection,
        r#"
        SELECT COALESCE(SUM((end_time - start_time) / 60000), 0)
        FROM time_blocks
        WHERE block_type = 'work'
          AND status = 'completed'
          AND date(start_time / 1000, 'unixepoch') = ?1
        "#,
        &[&date],
    )?;

    let completed_blocks = query_i64(
        connection,
        "SELECT COUNT(*) FROM time_blocks WHERE status = 'completed' AND date(start_time / 1000, 'unixepoch') = ?1",
        &[&date],
    )?;
    let skipped_blocks = query_i64(
        connection,
        "SELECT COUNT(*) FROM time_blocks WHERE status = 'skipped' AND date(start_time / 1000, 'unixepoch') = ?1",
        &[&date],
    )?;
    let tasks_completed = query_i64(
        connection,
        r#"
        SELECT COUNT(DISTINCT task_id)
        FROM time_blocks
        WHERE status = 'completed'
          AND task_id IS NOT NULL
          AND date(start_time / 1000, 'unixepoch') = ?1
        "#,
        &[&date],
    )?;
    let processes_killed = query_i64(
        connection,
        "SELECT COUNT(*) FROM blocked_processes_log WHERE date(occurred_at / 1000, 'unixepoch') = ?1",
        &[&date],
    )?;

    Ok(DailySummary {
        date,
        focus_minutes,
        completed_blocks,
        skipped_blocks,
        tasks_completed,
        processes_killed,
    })
}

pub fn get_focus_stats(
    connection: &Connection,
    from: i64,
    to: i64,
) -> Result<Vec<FocusStatPoint>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT date(start_time / 1000, 'unixepoch') AS block_date,
                   COALESCE(SUM((end_time - start_time) / 60000), 0) AS focus_minutes,
                   COUNT(*) AS completed_work_blocks
            FROM time_blocks
            WHERE block_type = 'work'
              AND status = 'completed'
              AND start_time >= ?1
              AND start_time < ?2
            GROUP BY block_date
            ORDER BY block_date ASC
            "#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map(params![from, to], |row| {
            Ok(FocusStatPoint {
                date: row.get(0)?,
                focus_minutes: row.get(1)?,
                completed_work_blocks: row.get(2)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(rows)
}

pub fn get_task_completion_stats(
    connection: &Connection,
    from: i64,
    to: i64,
) -> Result<Vec<TaskCompletionStat>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT t.id,
                   t.name,
                   COALESCE(SUM(CASE WHEN tb.status = 'completed' THEN 1 ELSE 0 END), 0) AS completion_count,
                   COALESCE(SUM(CASE WHEN tb.status = 'skipped' THEN 1 ELSE 0 END), 0) AS skipped_count,
                   COALESCE(SUM(CASE WHEN tb.status = 'completed' AND tb.block_type = 'work' THEN (tb.end_time - tb.start_time) / 60000 ELSE 0 END), 0) AS total_focus_minutes
            FROM tasks t
            JOIN time_blocks tb ON tb.task_id = t.id
            WHERE tb.start_time >= ?1
              AND tb.start_time < ?2
            GROUP BY t.id, t.name
            ORDER BY completion_count DESC, total_focus_minutes DESC, t.name ASC
            "#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map(params![from, to], |row| {
            Ok(TaskCompletionStat {
                task_id: row.get(0)?,
                task_name: row.get(1)?,
                completion_count: row.get(2)?,
                skipped_count: row.get(3)?,
                total_focus_minutes: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(rows)
}

pub fn get_process_kill_stats(
    connection: &Connection,
    from: i64,
    to: i64,
) -> Result<Vec<ProcessKillStat>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT process_name,
                   COUNT(*) AS kill_count,
                   MAX(occurred_at) AS last_occurred_at
            FROM blocked_processes_log
            WHERE occurred_at >= ?1
              AND occurred_at < ?2
            GROUP BY process_name
            ORDER BY kill_count DESC, process_name ASC
            "#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map(params![from, to], |row| {
            Ok(ProcessKillStat {
                process_name: row.get(0)?,
                kill_count: row.get(1)?,
                last_occurred_at: row.get(2)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(rows)
}

fn query_i64(
    connection: &Connection,
    sql: &str,
    params: &[&dyn rusqlite::ToSql],
) -> Result<i64, String> {
    connection
        .query_row(sql, params, |row| row.get(0))
        .map_err(|error| error.to_string())
}
