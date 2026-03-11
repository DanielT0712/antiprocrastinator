use std::{
    cmp::{max, min},
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use chrono::{Datelike, Days, NaiveDate, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};
use tauri::{AppHandle, Emitter, Manager};

use crate::db::DatabaseState;

use super::models::{
    BlockSource, BlockStatus, BlockType, DayTemplate, FixedTemplateBlock, NewTimeBlock, TimeBlock,
    TimeBlockUpdate, TimerTickPayload, Weekday, WeeklyTemplate,
};

pub struct ScheduleState {
    runtime: Mutex<ScheduleRuntime>,
}

#[derive(Debug, Default)]
struct ScheduleRuntime {
    paused: Option<PausedBlock>,
    last_emitted_block_id: Option<i64>,
}

#[derive(Debug, Clone)]
struct PausedBlock {
    block_id: i64,
    remaining_secs: i64,
    paused_at: i64,
    original_end_time: i64,
}

#[derive(Debug, Clone)]
struct TemplateInterval {
    title: String,
    block_type: BlockType,
    start_time: i64,
    end_time: i64,
    intensity: u8,
    source: BlockSource,
}

impl ScheduleState {
    pub fn new() -> Self {
        Self {
            runtime: Mutex::new(ScheduleRuntime::default()),
        }
    }
}

pub fn start_timer_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            if let Err(error) = tick_schedule(&app) {
                log::error!("schedule timer tick failed: {error}");
            }

            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    });
}

pub fn get_current_block(
    connection: &Connection,
    schedule: &ScheduleState,
) -> Result<Option<TimeBlock>, String> {
    let paused_block_id = schedule
        .runtime
        .lock()
        .map_err(|error| error.to_string())?
        .paused
        .as_ref()
        .map(|paused| paused.block_id);

    if let Some(block_id) = paused_block_id {
        return get_block_by_id(connection, block_id).map(|block| {
            block.and_then(|block| (block.status == BlockStatus::Paused).then_some(block))
        });
    }

    refresh_schedule_status(connection)
}

pub fn get_next_block(
    connection: &Connection,
    schedule: &ScheduleState,
) -> Result<Option<TimeBlock>, String> {
    let current = get_current_block(connection, schedule)?;
    let threshold = current
        .map(|block| block.start_time)
        .unwrap_or_else(timestamp_ms);

    connection
        .query_row(
            r#"
            SELECT id, title, block_type, start_time, end_time, task_id,
                   status, intensity, source, created_at, updated_at
            FROM time_blocks
            WHERE start_time > ?1 AND status IN ('scheduled', 'active', 'paused')
            ORDER BY start_time ASC
            LIMIT 1
            "#,
            params![threshold],
            map_time_block,
        )
        .optional()
        .map_err(|error| error.to_string())
}

pub fn get_schedule_range(
    connection: &Connection,
    from: i64,
    to: i64,
) -> Result<Vec<TimeBlock>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, title, block_type, start_time, end_time, task_id,
                   status, intensity, source, created_at, updated_at
            FROM time_blocks
            WHERE start_time < ?2 AND end_time > ?1
            ORDER BY start_time ASC, id ASC
            "#,
        )
        .map_err(|error| error.to_string())?;

    let blocks = statement
        .query_map(params![from, to], map_time_block)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(blocks)
}

pub fn add_time_block(connection: &Connection, block: NewTimeBlock) -> Result<TimeBlock, String> {
    validate_time_block_input(
        &block.title,
        block.start_time,
        block.end_time,
        block.intensity,
    )?;

    let now = timestamp_ms();
    let status = if block.start_time <= now && now < block.end_time {
        BlockStatus::Active
    } else {
        BlockStatus::Scheduled
    };
    let source = block.source.unwrap_or(BlockSource::Manual);

    connection
        .execute(
            r#"
            INSERT INTO time_blocks (
                title, block_type, start_time, end_time, task_id,
                status, intensity, source, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            "#,
            params![
                block.title.trim(),
                block_type_to_str(block.block_type),
                block.start_time,
                block.end_time,
                block.task_id,
                block_status_to_str(status),
                i64::from(block.intensity),
                block_source_to_str(source),
                now,
                now
            ],
        )
        .map_err(|error| error.to_string())?;

    get_block_by_id(connection, connection.last_insert_rowid())?
        .ok_or_else(|| "newly created block could not be loaded".to_string())
}

pub fn update_time_block(
    connection: &Connection,
    id: i64,
    updates: TimeBlockUpdate,
) -> Result<TimeBlock, String> {
    let existing = get_block_by_id(connection, id)?
        .ok_or_else(|| format!("time block {id} does not exist"))?;

    let title = updates.title.unwrap_or(existing.title);
    let block_type = updates.block_type.unwrap_or(existing.block_type);
    let start_time = updates.start_time.unwrap_or(existing.start_time);
    let end_time = updates.end_time.unwrap_or(existing.end_time);
    let task_id = updates.task_id.unwrap_or(existing.task_id);
    let status = updates.status.unwrap_or(existing.status);
    let intensity = updates.intensity.unwrap_or(existing.intensity);
    let source = updates.source.unwrap_or(existing.source);

    validate_time_block_input(&title, start_time, end_time, intensity)?;

    connection
        .execute(
            r#"
            UPDATE time_blocks
            SET title = ?1,
                block_type = ?2,
                start_time = ?3,
                end_time = ?4,
                task_id = ?5,
                status = ?6,
                intensity = ?7,
                source = ?8,
                updated_at = ?9
            WHERE id = ?10
            "#,
            params![
                title.trim(),
                block_type_to_str(block_type),
                start_time,
                end_time,
                task_id,
                block_status_to_str(status),
                i64::from(intensity),
                block_source_to_str(source),
                timestamp_ms(),
                id
            ],
        )
        .map_err(|error| error.to_string())?;

    get_block_by_id(connection, id)?.ok_or_else(|| format!("time block {id} does not exist"))
}

pub fn delete_time_block(connection: &Connection, id: i64) -> Result<(), String> {
    let deleted = connection
        .execute("DELETE FROM time_blocks WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;

    if deleted == 0 {
        return Err(format!("time block {id} does not exist"));
    }

    Ok(())
}

pub fn get_weekly_template(connection: &Connection) -> Result<Option<WeeklyTemplate>, String> {
    connection
        .query_row(
            "SELECT template_json FROM weekly_templates WHERE id = 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .map(|json| serde_json::from_str(&json).map_err(|error| error.to_string()))
        .transpose()
}

pub fn save_weekly_template(
    connection: &Connection,
    template: WeeklyTemplate,
) -> Result<WeeklyTemplate, String> {
    validate_template(&template)?;

    connection
        .execute(
            r#"
            INSERT INTO weekly_templates (id, template_json, updated_at)
            VALUES (1, ?1, ?2)
            ON CONFLICT(id) DO UPDATE SET
                template_json = excluded.template_json,
                updated_at = excluded.updated_at
            "#,
            params![
                serde_json::to_string_pretty(&template).map_err(|error| error.to_string())?,
                timestamp_ms()
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(template)
}

pub fn apply_weekly_template(
    connection: &Connection,
    template: WeeklyTemplate,
    from: i64,
    to: i64,
) -> Result<Vec<TimeBlock>, String> {
    if from >= to {
        return Err("from must be earlier than to".to_string());
    }

    validate_template(&template)?;
    save_weekly_template(connection, template.clone())?;

    let occupied_intervals = load_preserved_intervals(connection, from, to)?;

    connection
        .execute(
            "DELETE FROM time_blocks WHERE start_time < ?2 AND end_time > ?1 AND status = 'scheduled' AND source = 'template'",
            params![from, to],
        )
        .map_err(|error| error.to_string())?;

    let generated = generate_template_blocks(&template, &occupied_intervals, from, to)?;
    let mut created = Vec::with_capacity(generated.len());

    for interval in generated {
        let created_block = add_time_block(
            connection,
            NewTimeBlock {
                title: interval.title,
                block_type: interval.block_type,
                start_time: interval.start_time,
                end_time: interval.end_time,
                task_id: None,
                intensity: interval.intensity,
                source: Some(interval.source),
            },
        )?;
        created.push(created_block);
    }

    Ok(created)
}

pub fn complete_current_block(
    connection: &Connection,
    schedule: &ScheduleState,
) -> Result<Option<TimeBlock>, String> {
    finish_current_block(connection, schedule, BlockStatus::Completed)
}

pub fn skip_current_block(
    connection: &Connection,
    schedule: &ScheduleState,
) -> Result<Option<TimeBlock>, String> {
    finish_current_block(connection, schedule, BlockStatus::Skipped)
}

pub fn extend_current_block(
    connection: &Connection,
    schedule: &ScheduleState,
    minutes: i64,
) -> Result<Option<TimeBlock>, String> {
    if minutes <= 0 {
        return Err("minutes must be greater than 0".to_string());
    }

    let now = timestamp_ms();
    let block = current_or_paused_block(connection, schedule)?
        .ok_or_else(|| "no active block to extend".to_string())?;
    let old_end = block.end_time;
    let delta = minutes * 60 * 1_000;

    connection
        .execute(
            "UPDATE time_blocks SET end_time = end_time + ?1, updated_at = ?2 WHERE id = ?3",
            params![delta, now, block.id],
        )
        .map_err(|error| error.to_string())?;

    shift_future_blocks(connection, old_end, delta)?;

    if let Some(paused) = &mut schedule
        .runtime
        .lock()
        .map_err(|error| error.to_string())?
        .paused
    {
        if paused.block_id == block.id {
            paused.remaining_secs += minutes * 60;
            paused.original_end_time += delta;
        }
    }

    get_block_by_id(connection, block.id)
}

pub fn pause_current_block(
    connection: &Connection,
    schedule: &ScheduleState,
) -> Result<Option<TimeBlock>, String> {
    let now = timestamp_ms();
    let block = refresh_schedule_status(connection)?
        .ok_or_else(|| "no active block to pause".to_string())?;

    if block.status != BlockStatus::Active {
        return Err("only an active block can be paused".to_string());
    }

    let remaining_secs = seconds_remaining(block.end_time, now);
    connection
        .execute(
            "UPDATE time_blocks SET status = 'paused', updated_at = ?1 WHERE id = ?2",
            params![now, block.id],
        )
        .map_err(|error| error.to_string())?;

    let mut runtime = schedule.runtime.lock().map_err(|error| error.to_string())?;
    runtime.paused = Some(PausedBlock {
        block_id: block.id,
        remaining_secs,
        paused_at: now,
        original_end_time: block.end_time,
    });

    get_block_by_id(connection, block.id)
}

pub fn resume_current_block(
    connection: &Connection,
    schedule: &ScheduleState,
) -> Result<Option<TimeBlock>, String> {
    let now = timestamp_ms();
    let paused = {
        let mut runtime = schedule.runtime.lock().map_err(|error| error.to_string())?;
        runtime.paused.take()
    }
    .ok_or_else(|| "no paused block to resume".to_string())?;

    let delta = now.saturating_sub(paused.paused_at);
    connection
        .execute(
            "UPDATE time_blocks SET status = 'active', end_time = end_time + ?1, updated_at = ?2 WHERE id = ?3",
            params![delta, now, paused.block_id],
        )
        .map_err(|error| error.to_string())?;

    shift_future_blocks(connection, paused.original_end_time, delta)?;
    get_block_by_id(connection, paused.block_id)
}

fn finish_current_block(
    connection: &Connection,
    schedule: &ScheduleState,
    final_status: BlockStatus,
) -> Result<Option<TimeBlock>, String> {
    let now = timestamp_ms();
    let block = current_or_paused_block(connection, schedule)?
        .ok_or_else(|| "no current block to update".to_string())?;
    let old_end = block.end_time;
    let new_end = min(now, old_end);
    let shift = new_end - old_end;

    connection
        .execute(
            "UPDATE time_blocks SET status = ?1, end_time = ?2, updated_at = ?3 WHERE id = ?4",
            params![block_status_to_str(final_status), new_end, now, block.id],
        )
        .map_err(|error| error.to_string())?;

    if shift != 0 {
        shift_future_blocks(connection, old_end, shift)?;
    }

    let mut runtime = schedule.runtime.lock().map_err(|error| error.to_string())?;
    if runtime
        .paused
        .as_ref()
        .map(|paused| paused.block_id == block.id)
        .unwrap_or(false)
    {
        runtime.paused = None;
    }
    runtime.last_emitted_block_id = None;
    drop(runtime);

    refresh_schedule_status(connection)
}

fn current_or_paused_block(
    connection: &Connection,
    schedule: &ScheduleState,
) -> Result<Option<TimeBlock>, String> {
    if let Some(block) = get_current_block(connection, schedule)? {
        return Ok(Some(block));
    }

    refresh_schedule_status(connection)
}

fn tick_schedule(app: &AppHandle) -> Result<(), String> {
    let database = app.state::<DatabaseState>();
    let schedule = app.state::<ScheduleState>();
    let mut runtime = schedule.runtime.lock().map_err(|error| error.to_string())?;

    if let Some(paused) = runtime.paused.clone() {
        let connection = database.connection()?;
        if let Some(block) = get_block_by_id(&connection, paused.block_id)? {
            if runtime.last_emitted_block_id != Some(block.id) {
                app.emit("block-changed", &block)
                    .map_err(|error| error.to_string())?;
                runtime.last_emitted_block_id = Some(block.id);
            }

            app.emit(
                "timer-tick",
                TimerTickPayload {
                    remaining_secs: paused.remaining_secs,
                    total_secs: block.duration_secs(),
                },
            )
            .map_err(|error| error.to_string())?;
            return Ok(());
        }

        runtime.paused = None;
    }

    drop(runtime);

    let current = {
        let connection = database.connection()?;
        refresh_schedule_status(&connection)?
    };

    if let Some(block) = current {
        let mut runtime = schedule.runtime.lock().map_err(|error| error.to_string())?;

        if runtime.last_emitted_block_id != Some(block.id) {
            app.emit("block-changed", &block)
                .map_err(|error| error.to_string())?;
            runtime.last_emitted_block_id = Some(block.id);
        }

        app.emit(
            "timer-tick",
            TimerTickPayload {
                remaining_secs: seconds_remaining(block.end_time, timestamp_ms()),
                total_secs: block.duration_secs(),
            },
        )
        .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn refresh_schedule_status(connection: &Connection) -> Result<Option<TimeBlock>, String> {
    let now = timestamp_ms();

    connection
        .execute(
            "UPDATE time_blocks SET status = 'completed', updated_at = ?1 WHERE status = 'active' AND end_time <= ?1",
            params![now],
        )
        .map_err(|error| error.to_string())?;

    let current = connection
        .query_row(
            r#"
            SELECT id, title, block_type, start_time, end_time, task_id,
                   status, intensity, source, created_at, updated_at
            FROM time_blocks
            WHERE start_time <= ?1
              AND end_time > ?1
              AND status IN ('scheduled', 'active')
            ORDER BY start_time ASC, id ASC
            LIMIT 1
            "#,
            params![now],
            map_time_block,
        )
        .optional()
        .map_err(|error| error.to_string())?;

    if let Some(block) = current {
        if block.status != BlockStatus::Active {
            connection
                .execute(
                    "UPDATE time_blocks SET status = 'active', updated_at = ?1 WHERE id = ?2",
                    params![now, block.id],
                )
                .map_err(|error| error.to_string())?;

            return get_block_by_id(connection, block.id);
        }

        return Ok(Some(block));
    }

    connection
        .execute(
            "UPDATE time_blocks SET status = 'scheduled', updated_at = ?1 WHERE status = 'active'",
            params![now],
        )
        .map_err(|error| error.to_string())?;

    Ok(None)
}

fn get_block_by_id(connection: &Connection, id: i64) -> Result<Option<TimeBlock>, String> {
    connection
        .query_row(
            r#"
            SELECT id, title, block_type, start_time, end_time, task_id,
                   status, intensity, source, created_at, updated_at
            FROM time_blocks
            WHERE id = ?1
            "#,
            params![id],
            map_time_block,
        )
        .optional()
        .map_err(|error| error.to_string())
}

fn shift_future_blocks(connection: &Connection, threshold: i64, delta: i64) -> Result<(), String> {
    if delta == 0 {
        return Ok(());
    }

    connection
        .execute(
            r#"
            UPDATE time_blocks
            SET start_time = start_time + ?1,
                end_time = end_time + ?1,
                updated_at = ?2
            WHERE start_time >= ?3
              AND status = 'scheduled'
            "#,
            params![delta, timestamp_ms(), threshold],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn load_preserved_intervals(
    connection: &Connection,
    from: i64,
    to: i64,
) -> Result<Vec<TemplateInterval>, String> {
    let existing = get_schedule_range(connection, from, to)?;
    Ok(existing
        .into_iter()
        .filter(|block| {
            !(block.source == BlockSource::Template && block.status == BlockStatus::Scheduled)
        })
        .map(|block| TemplateInterval {
            title: block.title,
            block_type: block.block_type,
            start_time: block.start_time,
            end_time: block.end_time,
            intensity: block.intensity,
            source: block.source,
        })
        .collect())
}

fn generate_template_blocks(
    template: &WeeklyTemplate,
    occupied_intervals: &[TemplateInterval],
    from: i64,
    to: i64,
) -> Result<Vec<TemplateInterval>, String> {
    let mut reserved = occupied_intervals.to_vec();
    let mut generated = Vec::new();
    let start_date = date_from_timestamp(from)?;
    let end_date = date_from_timestamp(to - 1)?;
    let day_count = end_date.signed_duration_since(start_date).num_days().max(0) as u64;

    for offset in 0..=day_count {
        let date = start_date
            .checked_add_days(Days::new(offset))
            .ok_or_else(|| "date range overflow while generating template".to_string())?;
        let day_template = find_day_template(template, weekday_from_chrono(date.weekday()));

        if let Some(day_template) = day_template {
            let fixed_intervals =
                build_fixed_intervals_for_day(date, day_template, &template.fixed_blocks)?;
            reserved.extend(fixed_intervals.clone());
            generated.extend(fixed_intervals);
        }
    }

    let mut merged = merge_intervals(reserved, from, to);
    let mut cursor = from;

    for interval in merged.drain(..) {
        if cursor < interval.start_time {
            generated.extend(generate_gap_blocks(template, cursor, interval.start_time)?);
        }
        cursor = max(cursor, interval.end_time);
    }

    if cursor < to {
        generated.extend(generate_gap_blocks(template, cursor, to)?);
    }

    Ok(generated)
}

fn generate_gap_blocks(
    template: &WeeklyTemplate,
    gap_start: i64,
    gap_end: i64,
) -> Result<Vec<TemplateInterval>, String> {
    let mut generated = Vec::new();
    let mut cursor = gap_start;
    let mut next_type = BlockType::Work;

    while cursor < gap_end {
        let date = date_from_timestamp(cursor)?;
        let weekday = weekday_from_chrono(date.weekday());
        let day_template = match find_day_template(template, weekday) {
            Some(day_template) if day_template.enabled => day_template,
            _ => {
                cursor = end_of_day(date)?;
                next_type = BlockType::Work;
                continue;
            }
        };

        let segment_end = min(gap_end, end_of_day(date)?);
        let minutes = match next_type {
            BlockType::Work => day_template
                .work_minutes
                .unwrap_or(template.default_work_minutes),
            BlockType::Break => day_template
                .break_minutes
                .unwrap_or(template.default_break_minutes),
            _ => unreachable!("gap generation only alternates work and break"),
        };
        let duration_ms = i64::from(minutes) * 60 * 1_000;
        let end_time = min(cursor + duration_ms, segment_end);

        generated.push(TemplateInterval {
            title: next_type.default_title().to_string(),
            block_type: next_type,
            start_time: cursor,
            end_time,
            intensity: if next_type == BlockType::Work { 4 } else { 2 },
            source: BlockSource::Template,
        });

        cursor = end_time;
        next_type = if next_type == BlockType::Work {
            BlockType::Break
        } else {
            BlockType::Work
        };

        if cursor >= segment_end {
            next_type = BlockType::Work;
        }
    }

    Ok(generated)
}

fn build_fixed_intervals_for_day(
    date: NaiveDate,
    day_template: &DayTemplate,
    fixed_blocks: &[FixedTemplateBlock],
) -> Result<Vec<TemplateInterval>, String> {
    let mut intervals = Vec::new();

    if day_template.enabled {
        if let (Some(start_minute), Some(end_minute)) = (
            day_template.sleep_start_minute,
            day_template.sleep_end_minute,
        ) {
            intervals.extend(build_interval(
                "Sleep".to_string(),
                BlockType::Sleep,
                date,
                start_minute,
                duration_between(start_minute, end_minute),
                1,
            )?);
        }
    }

    let weekday = weekday_from_chrono(date.weekday());
    for block in fixed_blocks {
        if block.days_of_week.contains(&weekday) {
            intervals.extend(build_interval(
                block.title.clone(),
                block.block_type,
                date,
                block.start_minute,
                block.duration_minutes,
                block.intensity,
            )?);
        }
    }

    Ok(intervals)
}

fn build_interval(
    title: String,
    block_type: BlockType,
    date: NaiveDate,
    start_minute: u16,
    duration_minutes: u16,
    intensity: u8,
) -> Result<Vec<TemplateInterval>, String> {
    if duration_minutes == 0 {
        return Ok(vec![]);
    }

    let start_time = timestamp_for_minute(date, start_minute)?;
    let end_time = start_time + i64::from(duration_minutes) * 60 * 1_000;

    Ok(vec![TemplateInterval {
        title,
        block_type,
        start_time,
        end_time,
        intensity,
        source: BlockSource::Template,
    }])
}

fn merge_intervals(
    mut intervals: Vec<TemplateInterval>,
    from: i64,
    to: i64,
) -> Vec<TemplateInterval> {
    intervals.retain(|interval| interval.start_time < to && interval.end_time > from);
    intervals.iter_mut().for_each(|interval| {
        interval.start_time = max(interval.start_time, from);
        interval.end_time = min(interval.end_time, to);
    });
    intervals.sort_by_key(|interval| (interval.start_time, interval.end_time));

    let mut merged: Vec<TemplateInterval> = Vec::new();
    for interval in intervals {
        if let Some(last) = merged.last_mut() {
            if interval.start_time <= last.end_time {
                last.end_time = max(last.end_time, interval.end_time);
                continue;
            }
        }
        merged.push(interval);
    }

    merged
}

fn validate_time_block_input(
    title: &str,
    start_time: i64,
    end_time: i64,
    intensity: u8,
) -> Result<(), String> {
    if title.trim().is_empty() {
        return Err("title cannot be empty".to_string());
    }

    if end_time <= start_time {
        return Err("endTime must be later than startTime".to_string());
    }

    if !(1..=5).contains(&intensity) {
        return Err("intensity must be between 1 and 5".to_string());
    }

    Ok(())
}

fn validate_template(template: &WeeklyTemplate) -> Result<(), String> {
    if template.default_work_minutes == 0 || template.default_break_minutes == 0 {
        return Err("default work and break durations must be greater than 0".to_string());
    }

    for day in &template.days {
        if let Some(minutes) = day.work_minutes {
            if minutes == 0 {
                return Err("day work duration must be greater than 0".to_string());
            }
        }

        if let Some(minutes) = day.break_minutes {
            if minutes == 0 {
                return Err("day break duration must be greater than 0".to_string());
            }
        }
    }

    for block in &template.fixed_blocks {
        if block.title.trim().is_empty() {
            return Err("fixed block title cannot be empty".to_string());
        }
        if block.duration_minutes == 0 {
            return Err("fixed block duration must be greater than 0".to_string());
        }
        if block.days_of_week.is_empty() {
            return Err("fixed blocks must include at least one weekday".to_string());
        }
    }

    Ok(())
}

fn find_day_template(template: &WeeklyTemplate, weekday: Weekday) -> Option<&DayTemplate> {
    template.days.iter().find(|day| day.day == weekday)
}

fn timestamp_for_minute(date: NaiveDate, minute: u16) -> Result<i64, String> {
    let hour = minute / 60;
    let minute_of_hour = minute % 60;

    Utc.with_ymd_and_hms(
        date.year(),
        date.month(),
        date.day(),
        u32::from(hour),
        u32::from(minute_of_hour),
        0,
    )
    .single()
    .map(|datetime| datetime.timestamp_millis())
    .ok_or_else(|| "invalid date while generating schedule".to_string())
}

fn end_of_day(date: NaiveDate) -> Result<i64, String> {
    let next_day = date
        .checked_add_days(Days::new(1))
        .ok_or_else(|| "date overflow".to_string())?;
    timestamp_for_minute(next_day, 0)
}

fn date_from_timestamp(timestamp: i64) -> Result<NaiveDate, String> {
    chrono::DateTime::from_timestamp_millis(timestamp)
        .map(|datetime| datetime.date_naive())
        .ok_or_else(|| "invalid timestamp".to_string())
}

fn weekday_from_chrono(weekday: chrono::Weekday) -> Weekday {
    match weekday {
        chrono::Weekday::Mon => Weekday::Monday,
        chrono::Weekday::Tue => Weekday::Tuesday,
        chrono::Weekday::Wed => Weekday::Wednesday,
        chrono::Weekday::Thu => Weekday::Thursday,
        chrono::Weekday::Fri => Weekday::Friday,
        chrono::Weekday::Sat => Weekday::Saturday,
        chrono::Weekday::Sun => Weekday::Sunday,
    }
}

fn duration_between(start_minute: u16, end_minute: u16) -> u16 {
    if end_minute >= start_minute {
        end_minute - start_minute
    } else {
        (24 * 60 - start_minute) + end_minute
    }
}

fn seconds_remaining(end_time: i64, now: i64) -> i64 {
    ((end_time - now).max(0) + 999) / 1_000
}

fn timestamp_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_millis() as i64
}

fn map_time_block(row: &Row<'_>) -> rusqlite::Result<TimeBlock> {
    Ok(TimeBlock {
        id: row.get(0)?,
        title: row.get(1)?,
        block_type: block_type_from_str(&row.get::<_, String>(2)?).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                2,
                rusqlite::types::Type::Text,
                Box::new(std::io::Error::other(error)),
            )
        })?,
        start_time: row.get(3)?,
        end_time: row.get(4)?,
        task_id: row.get(5)?,
        status: block_status_from_str(&row.get::<_, String>(6)?).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                6,
                rusqlite::types::Type::Text,
                Box::new(std::io::Error::other(error)),
            )
        })?,
        intensity: row.get::<_, i64>(7)? as u8,
        source: block_source_from_str(&row.get::<_, String>(8)?).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                8,
                rusqlite::types::Type::Text,
                Box::new(std::io::Error::other(error)),
            )
        })?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn block_type_to_str(block_type: BlockType) -> &'static str {
    match block_type {
        BlockType::Work => "work",
        BlockType::Break => "break",
        BlockType::Sleep => "sleep",
        BlockType::Meal => "meal",
        BlockType::Custom => "custom",
    }
}

fn block_type_from_str(value: &str) -> Result<BlockType, String> {
    match value {
        "work" => Ok(BlockType::Work),
        "break" => Ok(BlockType::Break),
        "sleep" => Ok(BlockType::Sleep),
        "meal" => Ok(BlockType::Meal),
        "custom" => Ok(BlockType::Custom),
        _ => Err(format!("unknown block type: {value}")),
    }
}

fn block_status_to_str(status: BlockStatus) -> &'static str {
    match status {
        BlockStatus::Scheduled => "scheduled",
        BlockStatus::Active => "active",
        BlockStatus::Completed => "completed",
        BlockStatus::Skipped => "skipped",
        BlockStatus::Paused => "paused",
    }
}

fn block_status_from_str(value: &str) -> Result<BlockStatus, String> {
    match value {
        "scheduled" => Ok(BlockStatus::Scheduled),
        "active" => Ok(BlockStatus::Active),
        "completed" => Ok(BlockStatus::Completed),
        "skipped" => Ok(BlockStatus::Skipped),
        "paused" => Ok(BlockStatus::Paused),
        _ => Err(format!("unknown block status: {value}")),
    }
}

fn block_source_to_str(source: BlockSource) -> &'static str {
    match source {
        BlockSource::Manual => "manual",
        BlockSource::Template => "template",
    }
}

fn block_source_from_str(value: &str) -> Result<BlockSource, String> {
    match value {
        "manual" => Ok(BlockSource::Manual),
        "template" => Ok(BlockSource::Template),
        _ => Err(format!("unknown block source: {value}")),
    }
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};
    use rusqlite::Connection;

    use super::{
        add_time_block, apply_weekly_template, complete_current_block, get_schedule_range,
        pause_current_block, resume_current_block, save_weekly_template, ScheduleState,
    };
    use crate::{
        db::migrations::run_migrations,
        schedule::models::{
            BlockType, FixedTemplateBlock, NewTimeBlock, TimeBlock, Weekday, WeeklyTemplate,
        },
    };

    fn setup() -> (Connection, ScheduleState) {
        let connection = Connection::open_in_memory().expect("in-memory database should open");
        run_migrations(&connection).expect("migrations should succeed");
        (connection, ScheduleState::new())
    }

    fn now_ms() -> i64 {
        Utc::now().timestamp_millis()
    }

    fn load_blocks(connection: &Connection) -> Vec<TimeBlock> {
        get_schedule_range(connection, 0, now_ms() + 14 * 24 * 60 * 60 * 1_000)
            .expect("schedule range should load")
    }

    #[test]
    fn completes_current_block_and_shifts_next_block_earlier() {
        let (connection, schedule) = setup();
        let now = now_ms();

        let current = add_time_block(
            &connection,
            NewTimeBlock {
                title: "Current".to_string(),
                block_type: BlockType::Work,
                start_time: now - 10 * 60 * 1_000,
                end_time: now + 20 * 60 * 1_000,
                task_id: None,
                intensity: 4,
                source: None,
            },
        )
        .expect("current block should create");

        let next = add_time_block(
            &connection,
            NewTimeBlock {
                title: "Next".to_string(),
                block_type: BlockType::Break,
                start_time: current.end_time,
                end_time: current.end_time + 30 * 60 * 1_000,
                task_id: None,
                intensity: 2,
                source: None,
            },
        )
        .expect("next block should create");

        let returned = complete_current_block(&connection, &schedule)
            .expect("completion should work")
            .expect("a next block should become current");
        let updated_blocks = load_blocks(&connection);

        assert_eq!(returned.id, next.id);
        assert!(updated_blocks[1].start_time < next.start_time);
    }

    #[test]
    fn pause_and_resume_extend_current_block() {
        let (connection, schedule) = setup();
        let now = now_ms();

        let original = add_time_block(
            &connection,
            NewTimeBlock {
                title: "Current".to_string(),
                block_type: BlockType::Work,
                start_time: now - 5 * 60 * 1_000,
                end_time: now + 5 * 60 * 1_000,
                task_id: None,
                intensity: 4,
                source: None,
            },
        )
        .expect("current block should create");

        pause_current_block(&connection, &schedule).expect("pause should work");
        std::thread::sleep(std::time::Duration::from_millis(5));
        let resumed = resume_current_block(&connection, &schedule)
            .expect("resume should work")
            .expect("resumed block should load");

        assert!(resumed.end_time >= original.end_time);
    }

    #[test]
    fn applies_template_around_fixed_blocks() {
        let (connection, _) = setup();
        let template = WeeklyTemplate {
            fixed_blocks: vec![FixedTemplateBlock {
                title: "Lunch".to_string(),
                block_type: BlockType::Meal,
                days_of_week: vec![Weekday::Thursday],
                start_minute: 12 * 60,
                duration_minutes: 60,
                intensity: 1,
            }],
            ..WeeklyTemplate::default()
        };
        save_weekly_template(&connection, template.clone()).expect("template should save");

        let from = Utc
            .with_ymd_and_hms(2026, 3, 12, 7, 0, 0)
            .single()
            .expect("datetime should exist")
            .timestamp_millis();
        let to = Utc
            .with_ymd_and_hms(2026, 3, 12, 15, 0, 0)
            .single()
            .expect("datetime should exist")
            .timestamp_millis();

        let blocks =
            apply_weekly_template(&connection, template, from, to).expect("template should apply");

        assert!(blocks.iter().any(|block| block.title == "Lunch"));
        assert!(blocks.iter().any(|block| {
            block.block_type == BlockType::Work && block.end_time <= from + 5 * 60 * 60 * 1_000
        }));
    }
}
