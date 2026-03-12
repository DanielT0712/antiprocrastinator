use rusqlite::{params, Connection};

use super::models::AnalyticsEvent;

#[allow(dead_code)]
pub fn record_event(
    connection: &Connection,
    event: AnalyticsEvent,
) -> Result<AnalyticsEvent, String> {
    connection
        .execute(
            r#"
            INSERT INTO analytics_events (
                event_type, task_id, block_id, process_name, payload_json, occurred_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            "#,
            params![
                event.event_type,
                event.task_id,
                event.block_id,
                event.process_name,
                event.payload_json,
                event.occurred_at
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(AnalyticsEvent {
        id: connection.last_insert_rowid(),
        ..event
    })
}
