use std::{
    cmp::{max, min},
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use chrono::{Datelike, Days, Local, NaiveDate, TimeZone, Timelike};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

use crate::{
    analytics::{models::AnalyticsEvent, tracker},
    config::models::{TaskChunkClusteringMode, TaskGroupClusteringMode, UserPreferences},
    db::DatabaseState,
    tasks::models::{RecurrenceKind, TaskKind},
};

use super::models::{
    BlockDecisionPrompt, BlockSource, BlockStatus, BlockType, DayTemplate, EmergencyBlockRequest,
    FixedTemplateBlock, NewTimeBlock, ScheduleActionResult, ScheduleMutation,
    ScheduleMutationHistoryEntry, ScheduleMutationResult, ScheduleRebuildResult, ScheduleWarning,
    TimeBlock, TimeBlockUpdate, TimerTickPayload, Weekday, WeeklyTemplate,
};

pub struct ScheduleState {
    runtime: Mutex<ScheduleRuntime>,
}

#[derive(Debug, Default)]
struct ScheduleRuntime {
    paused: Option<PausedBlock>,
    last_emitted_block_id: Option<i64>,
    prompted_block_id: Option<i64>,
    continuing_block_id: Option<i64>,
}

#[derive(Debug, Clone)]
struct PausedBlock {
    block_id: i64,
    remaining_secs: i64,
    paused_at: i64,
    original_end_time: i64,
    available_pause_ms: i64,
    horizon_end: i64,
}

#[derive(Debug, Clone)]
struct RestAdjustmentPlan {
    from_time: i64,
    horizon_end: i64,
    shift_ms: i64,
    adjustments: Vec<RestBlockAdjustment>,
}

#[derive(Debug, Clone)]
struct RestBlockAdjustment {
    block_id: i64,
    delta_ms: i64,
}

#[derive(Debug, Clone)]
struct TemplateInterval {
    title: String,
    block_type: BlockType,
    start_time: i64,
    end_time: i64,
    task_id: Option<i64>,
    intensity: u8,
    source: BlockSource,
    is_protected: bool,
    enforcement_profile: Option<String>,
}

#[derive(Debug, Clone)]
struct PlannerTask {
    task_id: i64,
    title: String,
    group_id: Option<i64>,
    enforcement_profile: Option<String>,
    kind: TaskKind,
    priority: i64,
    deadline: Option<i64>,
    estimated_minutes: i64,
    max_chunk_minutes: Option<i64>,
    min_chunk_minutes: Option<i64>,
    minimum_rest_minutes: Option<i64>,
    work_ratio: Option<i64>,
    rest_ratio: Option<i64>,
    protect_generated_blocks: bool,
    fixed_window_start_minute: Option<i64>,
    fixed_window_end_minute: Option<i64>,
    recurrence_kind: RecurrenceKind,
    recurrence_days_mask: i64,
    recurrence_anchor_date: Option<i64>,
    recurrence_dates: Option<Vec<i64>>,
    recurrence_overrides: Option<String>,
    required_share: f64,
    section_allocations: Vec<i64>,
}

#[derive(Debug, Clone)]
struct ScheduleSection {
    end_time: i64,
    windows: Vec<TimeWindow>,
    scoring_work_capacity_minutes: i64,
}

#[derive(Debug, Clone, Copy)]
struct TimeWindow {
    start_time: i64,
    end_time: i64,
}

impl TimeWindow {
    fn duration_minutes(self) -> i64 {
        (self.end_time - self.start_time) / 60_000
    }
}

#[derive(Debug, Clone)]
struct ChunkCandidate {
    task_index: usize,
    task_id: i64,
    title: String,
    priority: i64,
    duration_minutes: i64,
}

impl ScheduleState {
    pub fn new() -> Self {
        Self {
            runtime: Mutex::new(ScheduleRuntime::default()),
        }
    }
}

fn record_schedule_event(
    connection: &Connection,
    event_type: &str,
    block: Option<&TimeBlock>,
    payload: serde_json::Value,
) {
    let _ = tracker::record_event(
        connection,
        AnalyticsEvent {
            id: 0,
            event_type: event_type.to_string(),
            task_id: block.and_then(|block| block.task_id),
            block_id: block.map(|block| block.id),
            process_name: None,
            payload_json: Some(payload.to_string()),
            occurred_at: timestamp_ms(),
        },
    );
}

fn record_schedule_mutation_history(
    connection: &Connection,
    action: &str,
    result: &ScheduleMutationResult,
) -> Result<(), String> {
    connection
        .execute(
            r#"
            INSERT INTO schedule_mutation_history (action, payload_json, occurred_at)
            VALUES (?1, ?2, ?3)
            "#,
            params![
                action,
                serde_json::to_string(result).map_err(|error| error.to_string())?,
                timestamp_ms()
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn start_timer_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Block-upcoming notifier state. Tracks the next block id we've
        // surfaced and which threshold buckets already fired so we don't
        // spam OS notifications every tick.
        let mut watched_block_id: Option<i64> = None;
        let mut notified_thresholds: std::collections::HashSet<i64> =
            std::collections::HashSet::new();
        let thresholds: [i64; 6] = [60, 30, 10, 5, 3, 1];
        let lead_time_secs: i64 = 60;
        let mut overlay_armed = false;
        let mut burst_fired_for_block: Option<i64> = None;

        loop {
            if let Err(error) = tick_schedule(&app) {
                log::error!("schedule timer tick failed: {error}");
            }

            // Block-upcoming watcher: lightweight, runs every second.
            if let Err(error) = (|| -> Result<(), String> {
                let database = app.state::<DatabaseState>();
                let schedule = app.state::<ScheduleState>();
                let config = app.state::<crate::config::manager::ConfigState>();
                let guard = app.state::<crate::guard::watchdog::GuardState>();
                let connection = database.connection()?;
                let preferences = config.get_preferences()?;
                let countdown_secs = preferences.process_countdown_seconds.max(1) as i64;
                let next = get_next_block(&connection, &schedule)?;
                let now = timestamp_ms();
                let Some(block) = next else {
                    if overlay_armed {
                        let _ = crate::guard::watchdog::hide_warning_overlay(&app);
                        overlay_armed = false;
                    }
                    watched_block_id = None;
                    notified_thresholds.clear();
                    burst_fired_for_block = None;
                    return Ok(());
                };

                let secs_until = (block.start_time - now).max(0) / 1_000;

                if watched_block_id != Some(block.id) {
                    watched_block_id = Some(block.id);
                    notified_thresholds.clear();
                    burst_fired_for_block = None;
                }

                let _ = app.emit(
                    "block-upcoming",
                    serde_json::json!({
                        "blockId": block.id,
                        "title": block.title,
                        "blockType": block.block_type,
                        "startTime": block.start_time,
                        "endTime": block.end_time,
                        "secondsUntilStart": secs_until,
                    }),
                );

                let mode = crate::guard::watchdog::current_warning_display(&app);
                if secs_until > 0 && secs_until <= lead_time_secs {
                    if mode == crate::guard::watchdog::WarningDisplay::Fullscreen && !overlay_armed
                    {
                        let _ = crate::guard::watchdog::show_warning_overlay(&app);
                        overlay_armed = true;
                    }
                    // 5s burst the first time we surface this block.
                    if burst_fired_for_block != Some(block.id) {
                        guard.request_popup_show_until(now + 5_000);
                        burst_fired_for_block = Some(block.id);
                    }
                    // Final-countdown phase: keep popup visible the last
                    // `process_countdown_seconds` until the block starts.
                    if secs_until <= countdown_secs {
                        guard.request_popup_show_until(now + 1_500);
                    }
                    for threshold in thresholds.iter() {
                        if secs_until == *threshold
                            && notified_thresholds.insert(*threshold)
                            && preferences.notifications_enabled
                            && mode == crate::guard::watchdog::WarningDisplay::Banner
                        {
                            use tauri_plugin_notification::NotificationExt;
                            let _ = app
                                .notification()
                                .builder()
                                .title("Block starting soon")
                                .body(format!(
                                    "{} block about to start in {secs_until}s",
                                    block.title
                                ))
                                .show();
                        }
                    }
                } else if overlay_armed {
                    let _ = crate::guard::watchdog::hide_warning_overlay(&app);
                    overlay_armed = false;
                }

                // Tick popup visibility based on accumulated requests.
                let _ = crate::guard::watchdog::reconcile_warning_popup(&app);
                Ok(())
            })() {
                log::warn!("block-upcoming watcher tick failed: {error}");
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

pub fn get_projected_finish(connection: &Connection, task_id: i64) -> Result<Option<i64>, String> {
    connection
        .query_row(
            r#"
            SELECT MAX(end_time)
            FROM time_blocks
            WHERE task_id = ?1
              AND status IN ('scheduled', 'active', 'paused')
            "#,
            params![task_id],
            |row| row.get::<_, Option<i64>>(0),
        )
        .optional()
        .map(|outer| outer.flatten())
        .map_err(|error| error.to_string())
}

pub fn get_pause_buffer_minutes(
    connection: &Connection,
    schedule: &ScheduleState,
    preferences: &UserPreferences,
) -> Result<i64, String> {
    let Some(block) = refresh_schedule_status(connection)? else {
        return Ok(0);
    };
    if block.status == BlockStatus::Paused {
        if let Some(paused) = schedule
            .runtime
            .lock()
            .map_err(|error| error.to_string())?
            .paused
            .as_ref()
        {
            return Ok((paused.available_pause_ms / 60_000).max(0));
        }
    }
    if block.status != BlockStatus::Active {
        return Ok(0);
    }
    let Some(plan) = build_rest_shrink_plan(
        connection,
        block.end_time,
        preferences,
        i64::MAX / 4,
        ShrinkStrategy::ImmediateThenProportional,
    )?
    else {
        return Ok(0);
    };
    let available_pause_ms: i64 = plan
        .adjustments
        .iter()
        .map(|adjustment| -adjustment.delta_ms)
        .sum();
    Ok((available_pause_ms / 60_000).max(0))
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
                   status, intensity, source, is_protected, enforcement_profile, created_at, updated_at
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

pub fn effective_enforcement_block_type(
    connection: &Connection,
    schedule: &ScheduleState,
) -> Result<Option<BlockType>, String> {
    if let Some(block) = current_or_overdue_work_block(connection, schedule)? {
        if block.block_type == BlockType::Work
            && block.end_time <= timestamp_ms()
            && schedule
                .runtime
                .lock()
                .map_err(|error| error.to_string())?
                .continuing_block_id
                != Some(block.id)
        {
            return Ok(Some(BlockType::Break));
        }
        return Ok(Some(block.block_type));
    }

    get_current_block(connection, schedule).map(|block| block.map(|block| block.block_type))
}

pub fn effective_enforcement_profile(
    connection: &Connection,
    schedule: &ScheduleState,
) -> Result<String, String> {
    if let Some(block) = current_or_overdue_work_block(connection, schedule)? {
        if block.block_type == BlockType::Work
            && block.end_time <= timestamp_ms()
            && schedule
                .runtime
                .lock()
                .map_err(|error| error.to_string())?
                .continuing_block_id
                != Some(block.id)
        {
            return Ok("rest".to_string());
        }

        return Ok(match block.block_type {
            BlockType::Break | BlockType::Sleep | BlockType::Meal => "rest".to_string(),
            _ => block
                .enforcement_profile
                .clone()
                .unwrap_or_else(|| "work".to_string()),
        });
    }

    Ok(get_current_block(connection, schedule)?
        .and_then(|block| {
            if matches!(
                block.block_type,
                BlockType::Break | BlockType::Sleep | BlockType::Meal
            ) {
                Some("rest".to_string())
            } else {
                block.enforcement_profile
            }
        })
        .unwrap_or_else(|| "rest".to_string()))
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
                   status, intensity, source, is_protected, enforcement_profile, created_at, updated_at
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

pub fn get_schedule_mutation_history(
    connection: &Connection,
    from: i64,
    to: i64,
) -> Result<Vec<ScheduleMutationHistoryEntry>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, action, payload_json, occurred_at
            FROM schedule_mutation_history
            WHERE occurred_at >= ?1 AND occurred_at < ?2
            ORDER BY occurred_at DESC, id DESC
            "#,
        )
        .map_err(|error| error.to_string())?;

    let entries = statement
        .query_map(params![from, to], |row| {
            Ok(ScheduleMutationHistoryEntry {
                id: row.get(0)?,
                action: row.get(1)?,
                payload_json: row.get(2)?,
                occurred_at: row.get(3)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(entries)
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
                status, intensity, source, is_protected, enforcement_profile, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
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
                block.is_protected.unwrap_or(false),
                block.enforcement_profile,
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
    let is_protected = updates.is_protected.unwrap_or(existing.is_protected);
    let enforcement_profile = updates
        .enforcement_profile
        .unwrap_or(existing.enforcement_profile.clone());

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
                is_protected = ?9,
                enforcement_profile = ?10,
                updated_at = ?11
            WHERE id = ?12
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
                is_protected,
                enforcement_profile,
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

pub fn add_time_block_with_mutation(
    connection: &Connection,
    block: NewTimeBlock,
) -> Result<ScheduleMutationResult, String> {
    let before = load_schedule_snapshot(connection, block.start_time, None)?;
    let created = add_time_block(connection, block)?;
    build_schedule_mutation_result(
        connection,
        Some("add_time_block"),
        created.start_time,
        None,
        before,
        vec![],
        None,
        Some(created),
    )
}

pub fn update_time_block_with_mutation(
    connection: &Connection,
    id: i64,
    updates: TimeBlockUpdate,
) -> Result<ScheduleMutationResult, String> {
    let existing = get_block_by_id(connection, id)?
        .ok_or_else(|| format!("time block {id} does not exist"))?;
    let before = load_schedule_snapshot(connection, existing.start_time, None)?;
    let updated = update_time_block(connection, id, updates)?;
    build_schedule_mutation_result(
        connection,
        Some("update_time_block"),
        existing.start_time.min(updated.start_time),
        None,
        before,
        vec![],
        None,
        Some(updated),
    )
}

pub fn delete_time_block_with_mutation(
    connection: &Connection,
    id: i64,
) -> Result<ScheduleMutationResult, String> {
    let existing = get_block_by_id(connection, id)?
        .ok_or_else(|| format!("time block {id} does not exist"))?;
    let before = load_schedule_snapshot(connection, existing.start_time, None)?;
    delete_time_block(connection, id)?;
    build_schedule_mutation_result(
        connection,
        Some("delete_time_block"),
        existing.start_time,
        None,
        before,
        vec![],
        None,
        refresh_schedule_status(connection)?,
    )
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
                task_id: interval.task_id,
                intensity: interval.intensity,
                source: Some(interval.source),
                is_protected: Some(interval.is_protected),
                enforcement_profile: interval.enforcement_profile,
            },
        )?;
        created.push(created_block);
    }

    Ok(created)
}

pub fn apply_weekly_template_with_mutation(
    connection: &Connection,
    template: WeeklyTemplate,
    from: i64,
    to: i64,
) -> Result<ScheduleMutationResult, String> {
    let before = load_schedule_snapshot(connection, from, Some(to))?;
    let _ = apply_weekly_template(connection, template, from, to)?;
    build_schedule_mutation_result(
        connection,
        Some("apply_weekly_template"),
        from,
        Some(to),
        before,
        vec![],
        Some(to),
        refresh_schedule_status(connection)?,
    )
}

pub fn rebuild_schedule(
    connection: &Connection,
    from: i64,
    preferences: &UserPreferences,
) -> Result<ScheduleRebuildResult, String> {
    rebuild_schedule_internal(connection, from, preferences, Some("rebuild_schedule"))
}

pub fn repair_generated_schedule(
    connection: &Connection,
    preferences: &UserPreferences,
) -> Result<ScheduleRebuildResult, String> {
    rebuild_schedule_internal(connection, timestamp_ms(), preferences, None)
}

fn rebuild_schedule_internal(
    connection: &Connection,
    from: i64,
    preferences: &UserPreferences,
    history_action: Option<&str>,
) -> Result<ScheduleRebuildResult, String> {
    let before = load_schedule_snapshot(connection, from, None)?;
    let template = get_weekly_template(connection)?.unwrap_or_default();
    repair_fixed_task_windows_from_blocks(connection)?;
    let tasks = load_plannable_tasks(connection, from)?;
    let flexible_tasks = tasks
        .iter()
        .filter(|task| task.kind == TaskKind::Flexible)
        .cloned()
        .collect::<Vec<_>>();

    if tasks.is_empty() {
        clear_generated_future_blocks(connection, from)?;
        let mut fixed_blocks = generate_fixed_template_blocks(
            connection,
            &template,
            from,
            end_of_day(date_from_timestamp(from)?)?,
        )?;
        normalize_generated_blocks(&mut fixed_blocks);
        persist_generated_blocks(connection, &fixed_blocks)?;
        let pseudo_deadline = end_of_day(date_from_timestamp(from)?)?;
        return build_schedule_mutation_result(
            connection,
            history_action,
            from,
            Some(pseudo_deadline),
            before,
            vec![],
            Some(pseudo_deadline),
            refresh_schedule_status(connection)?,
        );
    }
    if flexible_tasks.is_empty() {
        let horizon = end_of_day(date_from_timestamp(from)?)?;
        clear_generated_future_blocks(connection, from)?;
        let mut fixed_blocks =
            generate_fixed_template_blocks(connection, &template, from, horizon)?;
        fixed_blocks.extend(generate_fixed_task_intervals(&tasks, from, horizon)?);
        normalize_generated_blocks(&mut fixed_blocks);
        persist_generated_blocks(connection, &fixed_blocks)?;
        return build_schedule_mutation_result(
            connection,
            history_action,
            from,
            Some(horizon),
            before,
            vec![],
            Some(horizon),
            refresh_schedule_status(connection)?,
        );
    }

    let pseudo_deadline =
        compute_pseudo_deadline(connection, &template, preferences, from, &flexible_tasks)?;
    let existing_immutables = load_preserved_intervals(connection, from, pseudo_deadline)?;
    let active_work_intervals = load_active_work_intervals(connection, from, pseudo_deadline)?;
    let generated_fixed_intervals =
        generate_fixed_template_blocks(connection, &template, from, pseudo_deadline)?;
    let fixed_task_intervals = generate_fixed_task_intervals(&tasks, from, pseudo_deadline)?;
    let mut rest_source_intervals = Vec::new();
    for interval in active_work_intervals {
        rest_source_intervals.push(interval);
    }
    let boundary_rest_intervals = generate_rest_after_preserved_work(
        &rest_source_intervals,
        &[
            generated_fixed_intervals.clone(),
            fixed_task_intervals.clone(),
        ]
        .concat(),
        &tasks,
        preferences,
        pseudo_deadline,
    );
    let immutable_intervals = merge_intervals(
        [
            existing_immutables,
            generated_fixed_intervals.clone(),
            fixed_task_intervals.clone(),
            boundary_rest_intervals.clone(),
        ]
        .concat(),
        from,
        pseudo_deadline,
    );
    let windows = invert_intervals_to_windows(&immutable_intervals, from, pseudo_deadline);

    let section_endpoints = build_section_endpoints(from, pseudo_deadline, &flexible_tasks);
    let sections =
        build_sections_from_windows(&windows, &section_endpoints, from, preferences, &template);
    let mut warnings =
        detect_theoretical_overflow(&sections, &flexible_tasks, &section_endpoints, from);
    let mut planner_tasks = allocate_tasks_to_sections(
        &sections,
        section_endpoints.len() - 1,
        flexible_tasks,
        &section_endpoints,
        from,
        &mut warnings,
    );

    let mut generated_blocks = generated_fixed_intervals;
    generated_blocks.extend(fixed_task_intervals);
    generated_blocks.extend(boundary_rest_intervals);
    let packed_result =
        materialize_sections(&sections, &mut planner_tasks, preferences, &mut warnings)?;
    generated_blocks.extend(packed_result);
    normalize_generated_blocks(&mut generated_blocks);

    clear_generated_future_blocks(connection, from)?;
    persist_generated_blocks(connection, &generated_blocks)?;

    build_schedule_mutation_result(
        connection,
        history_action,
        from,
        Some(pseudo_deadline),
        before,
        warnings,
        Some(pseudo_deadline),
        refresh_schedule_status(connection)?,
    )
}

pub fn complete_current_block(
    connection: &Connection,
    schedule: &ScheduleState,
    preferences: &UserPreferences,
) -> Result<ScheduleActionResult, String> {
    let task_id = current_or_paused_block(connection, schedule)?.and_then(|block| block.task_id);
    let result =
        finish_current_block_with_rest(connection, schedule, preferences, BlockStatus::Completed)?;
    if let Some(id) = task_id {
        maybe_respawn_recurring_task(connection, id);
    }
    Ok(result)
}

/// If the task has recurrence != none AND every planned chunk has now been
/// completed, insert a sibling task row with the next occurrence's deadline
/// so the planner picks it up the next time it rebuilds. Tasks split into
/// multiple chunks only respawn once the final chunk is finished.
fn maybe_respawn_recurring_task(connection: &Connection, task_id: i64) {
    use crate::tasks::models::{
        recurrence_kind_from_str, recurrence_kind_to_str, task_kind_from_str, task_kind_to_str,
        RecurrenceKind,
    };

    let row: Option<(
        String,
        Option<i64>,
        i64,
        Option<i64>,
        Option<i64>,
        Option<i64>,
        Option<i64>,
        Option<i64>,
        Option<i64>,
        Option<i64>,
        bool,
        Option<String>,
        String,
        Option<i64>,
        Option<i64>,
        String,
        i64,
        Option<i64>,
    )> = connection
        .query_row(
            r#"
            SELECT name, group_id, priority, estimated_minutes, deadline,
                   max_chunk_minutes, min_chunk_minutes, minimum_rest_minutes,
                   work_ratio, rest_ratio, protect_generated_blocks, enforcement_profile,
                   kind, fixed_window_start_minute, fixed_window_end_minute,
                   recurrence_kind, recurrence_days_mask, recurrence_anchor_date
            FROM tasks
            WHERE id = ?1
            "#,
            params![task_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                    row.get(9)?,
                    row.get(10)?,
                    row.get(11)?,
                    row.get(12)?,
                    row.get(13)?,
                    row.get(14)?,
                    row.get(15)?,
                    row.get(16)?,
                    row.get(17)?,
                ))
            },
        )
        .ok();
    let Some(row) = row else {
        return;
    };
    let (
        name,
        group_id,
        priority,
        estimated_minutes,
        deadline,
        max_chunk,
        min_chunk,
        min_rest,
        work_ratio,
        rest_ratio,
        protect,
        enforcement_profile,
        kind_str,
        fixed_start,
        fixed_end,
        recurrence_str,
        recurrence_days_mask,
        recurrence_anchor,
    ) = row;
    let recurrence = recurrence_kind_from_str(&recurrence_str);
    if matches!(recurrence, RecurrenceKind::None) {
        return;
    }

    // Multi-chunk: only respawn once every chunk of this task is done. We
    // consider the task complete when:
    //   - it has no estimate (single-shot task), OR
    //   - completed-block minutes >= estimated_minutes, OR
    //   - no remaining scheduled / active / paused blocks reference it.
    let consumed_ms: i64 = connection
        .query_row(
            r#"
            SELECT COALESCE(SUM(end_time - start_time), 0)
            FROM time_blocks
            WHERE task_id = ?1 AND status = 'completed'
            "#,
            params![task_id],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0);
    let pending_chunks: i64 = connection
        .query_row(
            r#"
            SELECT COUNT(*)
            FROM time_blocks
            WHERE task_id = ?1
              AND status IN ('scheduled', 'active', 'paused')
            "#,
            params![task_id],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0);
    let consumed_min = consumed_ms / 60_000;
    let estimate = estimated_minutes.unwrap_or(0);
    let estimate_satisfied = estimate <= 0 || consumed_min >= estimate;
    if !estimate_satisfied && pending_chunks > 0 {
        return;
    }

    let now = timestamp_ms();
    let next_deadline = next_recurrence_at(recurrence, recurrence_days_mask, now)
        .or(deadline.map(|d| d + 86_400_000));
    let _ = connection.execute(
        r#"
        INSERT INTO tasks (
            name, group_id, priority, estimated_minutes, deadline,
            max_chunk_minutes, min_chunk_minutes, minimum_rest_minutes,
            work_ratio, rest_ratio, protect_generated_blocks, enforcement_profile,
            average_priority, average_actual_minutes, completion_count,
            kind, fixed_window_start_minute, fixed_window_end_minute,
            recurrence_kind, recurrence_days_mask, recurrence_anchor_date,
            created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)
        "#,
        params![
            name,
            group_id,
            priority,
            estimated_minutes,
            next_deadline,
            max_chunk,
            min_chunk,
            min_rest,
            work_ratio,
            rest_ratio,
            protect,
            enforcement_profile,
            priority as f64,
            Option::<f64>::None,
            0_i64,
            task_kind_to_str(task_kind_from_str(&kind_str)),
            fixed_start,
            fixed_end,
            recurrence_kind_to_str(recurrence),
            recurrence_days_mask,
            recurrence_anchor,
            now,
            now,
        ],
    );
}

fn next_recurrence_at(
    kind: crate::tasks::models::RecurrenceKind,
    days_mask: i64,
    now_ms: i64,
) -> Option<i64> {
    use crate::tasks::models::RecurrenceKind;
    use chrono::{Duration, Local, TimeZone};
    let now_local = Local.timestamp_millis_opt(now_ms).single()?;
    let day = now_local.date_naive();
    let weekday = day.weekday().num_days_from_monday() as i64; // 0 = Mon
    let advance_days = match kind {
        RecurrenceKind::Daily => 1,
        RecurrenceKind::Weekdays => {
            // Skip Sat (5) / Sun (6).
            let mut step = 1;
            let mut cursor = (weekday + step) % 7;
            while cursor >= 5 {
                step += 1;
                cursor = (weekday + step) % 7;
            }
            step
        }
        RecurrenceKind::Weekly => {
            if days_mask == 0 {
                7
            } else {
                let mut step = 1_i64;
                loop {
                    let cursor = (weekday + step) % 7;
                    if days_mask & (1 << cursor) != 0 {
                        break step;
                    }
                    step += 1;
                    if step > 14 {
                        break 7;
                    }
                }
            }
        }
        RecurrenceKind::Once | RecurrenceKind::None => return None,
    };
    let next = day + Duration::days(advance_days);
    Local
        .from_local_datetime(&next.and_hms_opt(18, 0, 0)?)
        .single()
        .map(|dt| dt.timestamp_millis())
}

pub fn skip_current_block(
    connection: &Connection,
    schedule: &ScheduleState,
) -> Result<ScheduleActionResult, String> {
    let block = current_or_overdue_work_block(connection, schedule)?
        .ok_or_else(|| "no current block to update".to_string())?;
    let before = load_schedule_snapshot(connection, block.start_time, None)?;
    let current_block = finish_current_block(connection, schedule, BlockStatus::Skipped)?;
    build_schedule_mutation_result(
        connection,
        Some("skip_current_block"),
        block.start_time,
        None,
        before,
        vec![],
        None,
        current_block,
    )
}

pub fn extend_current_block(
    connection: &Connection,
    schedule: &ScheduleState,
    preferences: &UserPreferences,
    minutes: i64,
) -> Result<ScheduleActionResult, String> {
    if minutes <= 0 {
        return Err("minutes must be greater than 0".to_string());
    }

    let now = timestamp_ms();
    let block = current_or_overdue_work_block(connection, schedule)?
        .ok_or_else(|| "no active block to extend".to_string())?;
    let before = load_schedule_snapshot(connection, block.start_time, None)?;
    let old_end = block.end_time;
    let delta = minutes * 60 * 1_000 + now.saturating_sub(block.end_time);
    let mut warnings = Vec::new();
    let plan = build_rest_shrink_plan(
        connection,
        old_end,
        preferences,
        delta,
        ShrinkStrategy::Sequential,
    )?;

    connection
        .execute(
            "UPDATE time_blocks SET end_time = end_time + ?1, updated_at = ?2 WHERE id = ?3",
            params![delta, now, block.id],
        )
        .map_err(|error| error.to_string())?;

    if let Some(plan) = plan.filter(|plan| plan.shift_ms >= delta) {
        apply_rest_adjustment_plan(connection, &plan)?;
    } else {
        warnings.push(ScheduleWarning {
            kind: "rescheduled_after_extend".to_string(),
            message: "Not enough rest remained before the next fixed boundary, so the future schedule was rebuilt around the longer current block.".to_string(),
        });
        rebuild_schedule_internal(connection, old_end, preferences, None)?;
    }

    record_schedule_event(
        connection,
        "schedule.extend",
        Some(&block),
        json!({
            "requestedMinutes": minutes,
            "elapsedOvertimeMinutes": now.saturating_sub(old_end) / 60_000,
            "totalExtendedMinutes": delta / 60_000,
            "warningKinds": warnings.iter().map(|warning| warning.kind.clone()).collect::<Vec<_>>()
        }),
    );

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

    build_schedule_mutation_result(
        connection,
        Some("extend_current_block"),
        block.start_time,
        None,
        before,
        warnings,
        None,
        get_block_by_id(connection, block.id)?,
    )
}

pub fn pause_current_block(
    connection: &Connection,
    schedule: &ScheduleState,
    preferences: &UserPreferences,
) -> Result<ScheduleActionResult, String> {
    let now = timestamp_ms();
    let block = refresh_schedule_status(connection)?
        .ok_or_else(|| "no active block to pause".to_string())?;
    let before = load_schedule_snapshot(connection, block.start_time, None)?;

    if block.status != BlockStatus::Active {
        return Err("only an active block can be paused".to_string());
    }

    let Some(plan) = build_rest_shrink_plan(
        connection,
        block.end_time,
        preferences,
        i64::MAX / 4,
        ShrinkStrategy::ImmediateThenProportional,
    )?
    else {
        return build_schedule_mutation_result(
            connection,
            Some("pause_current_block"),
            block.start_time,
            None,
            before,
            vec![ScheduleWarning {
                kind: "pause_denied".to_string(),
                message: "There is no rest buffer left before the next fixed boundary, so this block has to continue.".to_string(),
            }],
            None,
            Some(block),
        );
    };

    let available_pause_ms = plan
        .adjustments
        .iter()
        .map(|adjustment| -adjustment.delta_ms)
        .sum();
    if available_pause_ms <= 0 {
        return build_schedule_mutation_result(
            connection,
            Some("pause_current_block"),
            block.start_time,
            None,
            before,
            vec![ScheduleWarning {
                kind: "pause_denied".to_string(),
                message: "There is no rest buffer left before the next fixed boundary, so this block has to continue.".to_string(),
            }],
            None,
            Some(block),
        );
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
        available_pause_ms,
        horizon_end: plan.horizon_end,
    });
    record_schedule_event(
        connection,
        "schedule.pause",
        Some(&block),
        json!({
            "availablePauseMinutes": available_pause_ms / 60_000
        }),
    );

    build_schedule_mutation_result(
        connection,
        Some("pause_current_block"),
        block.start_time,
        None,
        before,
        vec![],
        None,
        get_block_by_id(connection, block.id)?,
    )
}

pub fn resume_current_block(
    connection: &Connection,
    schedule: &ScheduleState,
    preferences: &UserPreferences,
) -> Result<ScheduleActionResult, String> {
    let now = timestamp_ms();
    let paused = {
        let mut runtime = schedule.runtime.lock().map_err(|error| error.to_string())?;
        runtime.paused.take()
    }
    .ok_or_else(|| "no paused block to resume".to_string())?;
    let block_id = paused.block_id;
    let before = load_schedule_snapshot(connection, timestamp_ms(), None)?;
    let delta = now
        .saturating_sub(paused.paused_at)
        .min(paused.available_pause_ms);
    let warnings = apply_pause_resume(connection, paused, preferences, delta, false)?;
    if let Some(block) = get_block_by_id(connection, block_id)? {
        record_schedule_event(
            connection,
            "schedule.resume",
            Some(&block),
            json!({
                "consumedPauseMinutes": delta / 60_000,
                "warningKinds": warnings.iter().map(|warning| warning.kind.clone()).collect::<Vec<_>>()
            }),
        );
    }

    build_schedule_mutation_result(
        connection,
        Some("resume_current_block"),
        now,
        None,
        before,
        warnings,
        None,
        get_block_by_id(connection, block_id)?,
    )
}

pub fn continue_current_block(
    connection: &Connection,
    schedule: &ScheduleState,
    preferences: &UserPreferences,
) -> Result<ScheduleActionResult, String> {
    let now = timestamp_ms();
    let block = current_or_overdue_work_block(connection, schedule)?
        .ok_or_else(|| "no current work block to continue".to_string())?;
    let before = load_schedule_snapshot(connection, block.start_time, None)?;

    if block.block_type != BlockType::Work {
        return Err("only work blocks can be continued".to_string());
    }

    {
        let mut runtime = schedule.runtime.lock().map_err(|error| error.to_string())?;
        runtime.continuing_block_id = Some(block.id);
        runtime.prompted_block_id = None;
        runtime.last_emitted_block_id = None;
    }

    let warnings = sync_overdue_work_block(connection, schedule, preferences, now, block.id, true)?;
    if let Some(updated) = get_block_by_id(connection, block.id)? {
        record_schedule_event(
            connection,
            "schedule.continue",
            Some(&updated),
            json!({
                "warningKinds": warnings.iter().map(|warning| warning.kind.clone()).collect::<Vec<_>>()
            }),
        );
    }

    build_schedule_mutation_result(
        connection,
        Some("continue_current_block"),
        block.start_time,
        None,
        before,
        warnings,
        None,
        get_block_by_id(connection, block.id)?,
    )
}

pub fn start_emergency_block(
    connection: &Connection,
    schedule: &ScheduleState,
    preferences: &UserPreferences,
    request: EmergencyBlockRequest,
) -> Result<ScheduleActionResult, String> {
    if request.duration_minutes <= 0 {
        return Err("durationMinutes must be greater than 0".to_string());
    }

    let now = timestamp_ms();
    let capped_minutes = request
        .duration_minutes
        .min(i64::from(preferences.emergency_block_max_minutes.max(1)));
    let end_time = now + capped_minutes * 60 * 1_000;
    let title = request
        .title
        .as_deref()
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .unwrap_or("Emergency")
        .to_string();
    let mut warnings = Vec::new();
    let before = load_schedule_snapshot(connection, now, None)?;

    if let Some(current) = current_or_paused_block(connection, schedule)? {
        connection
            .execute(
                "UPDATE time_blocks SET end_time = ?1, status = ?2, updated_at = ?3 WHERE id = ?4",
                params![
                    now,
                    block_status_to_str(BlockStatus::Skipped),
                    now,
                    current.id
                ],
            )
            .map_err(|error| error.to_string())?;

        let mut runtime = schedule.runtime.lock().map_err(|error| error.to_string())?;
        if runtime
            .paused
            .as_ref()
            .map(|paused| paused.block_id == current.id)
            .unwrap_or(false)
        {
            runtime.paused = None;
        }
        if runtime.continuing_block_id == Some(current.id) {
            runtime.continuing_block_id = None;
        }
        if runtime.prompted_block_id == Some(current.id) {
            runtime.prompted_block_id = None;
        }
        runtime.last_emitted_block_id = None;
    }

    let emergency = add_time_block(
        connection,
        NewTimeBlock {
            title,
            block_type: BlockType::Custom,
            start_time: now,
            end_time,
            task_id: None,
            intensity: 5,
            source: Some(BlockSource::Emergency),
            is_protected: Some(true),
            enforcement_profile: Some("emergency".to_string()),
        },
    )?;

    if capped_minutes < request.duration_minutes {
        warnings.push(ScheduleWarning {
            kind: "emergency_capped".to_string(),
            message: format!(
                "Emergency blocks are capped at {} minutes, so the request was shortened.",
                preferences.emergency_block_max_minutes.max(1)
            ),
        });
    }

    rebuild_schedule_internal(connection, now, preferences, None)?;
    let reason_text = request
        .reason
        .as_deref()
        .map(str::trim)
        .filter(|reason| !reason.is_empty())
        .map(str::to_string);
    record_schedule_event(
        connection,
        "schedule.emergency_block_started",
        Some(&emergency),
        json!({
            "requestedMinutes": request.duration_minutes,
            "appliedMinutes": capped_minutes,
            "reason": reason_text,
            "warningKinds": warnings.iter().map(|warning| warning.kind.clone()).collect::<Vec<_>>()
        }),
    );

    build_schedule_mutation_result(
        connection,
        Some("start_emergency_block"),
        now,
        None,
        before,
        warnings,
        None,
        get_block_by_id(connection, emergency.id)?,
    )
}

fn finish_current_block(
    connection: &Connection,
    schedule: &ScheduleState,
    final_status: BlockStatus,
) -> Result<Option<TimeBlock>, String> {
    let now = timestamp_ms();
    let block = current_or_overdue_work_block(connection, schedule)?
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
    if runtime.continuing_block_id == Some(block.id) {
        runtime.continuing_block_id = None;
    }
    if runtime.prompted_block_id == Some(block.id) {
        runtime.prompted_block_id = None;
    }
    runtime.last_emitted_block_id = None;
    drop(runtime);

    refresh_schedule_status(connection)
}

fn finish_current_block_with_rest(
    connection: &Connection,
    schedule: &ScheduleState,
    preferences: &UserPreferences,
    final_status: BlockStatus,
) -> Result<ScheduleActionResult, String> {
    let now = timestamp_ms();
    let block = current_or_paused_block(connection, schedule)?
        .ok_or_else(|| "no current block to update".to_string())?;
    let before = load_schedule_snapshot(connection, block.start_time, None)?;
    let old_end = block.end_time;
    let new_end = min(now, old_end);
    let reclaimed_ms = old_end.saturating_sub(new_end);
    let mut warnings = Vec::new();

    connection
        .execute(
            "UPDATE time_blocks SET status = ?1, end_time = ?2, updated_at = ?3 WHERE id = ?4",
            params![block_status_to_str(final_status), new_end, now, block.id],
        )
        .map_err(|error| error.to_string())?;

    if reclaimed_ms > 0 {
        if let Some(plan) = build_rest_growth_plan(connection, new_end, preferences, reclaimed_ms)?
        {
            apply_rest_adjustment_plan(connection, &plan)?;
        } else {
            warnings.push(ScheduleWarning {
                kind: "rescheduled_after_early_completion".to_string(),
                message: "Early completion produced more free time than nearby rest could absorb, so the future schedule was rebuilt.".to_string(),
            });
            rebuild_schedule_internal(connection, new_end, preferences, None)?;
        }
    }

    record_schedule_event(
        connection,
        match final_status {
            BlockStatus::Completed if reclaimed_ms > 0 => "schedule.complete_early",
            BlockStatus::Completed => "schedule.complete",
            BlockStatus::Skipped => "schedule.skip",
            _ => "schedule.block_finalized",
        },
        Some(&block),
        json!({
            "finalStatus": block_status_to_str(final_status),
            "reclaimedMinutes": reclaimed_ms / 60_000,
            "warningKinds": warnings.iter().map(|warning| warning.kind.clone()).collect::<Vec<_>>()
        }),
    );

    let mut runtime = schedule.runtime.lock().map_err(|error| error.to_string())?;
    if runtime
        .paused
        .as_ref()
        .map(|paused| paused.block_id == block.id)
        .unwrap_or(false)
    {
        runtime.paused = None;
    }
    if runtime.continuing_block_id == Some(block.id) {
        runtime.continuing_block_id = None;
    }
    if runtime.prompted_block_id == Some(block.id) {
        runtime.prompted_block_id = None;
    }
    runtime.last_emitted_block_id = None;
    drop(runtime);

    build_schedule_mutation_result(
        connection,
        Some(match final_status {
            BlockStatus::Completed => "complete_current_block",
            BlockStatus::Skipped => "skip_current_block",
            _ => "finalize_current_block",
        }),
        block.start_time,
        None,
        before,
        warnings,
        None,
        refresh_schedule_status(connection)?,
    )
}

#[derive(Debug, Clone, Copy)]
enum ShrinkStrategy {
    Sequential,
    ImmediateThenProportional,
}

fn apply_pause_resume(
    connection: &Connection,
    paused: PausedBlock,
    preferences: &UserPreferences,
    delta: i64,
    forced_resume: bool,
) -> Result<Vec<ScheduleWarning>, String> {
    let now = timestamp_ms();
    let mut warnings = Vec::new();

    if delta > 0 {
        let plan = build_rest_shrink_plan_until(
            connection,
            paused.original_end_time,
            paused.horizon_end,
            preferences,
            delta,
            ShrinkStrategy::ImmediateThenProportional,
        )?
        .ok_or_else(|| "pause buffer disappeared before resume".to_string())?;
        apply_rest_adjustment_plan(connection, &plan)?;
        connection
            .execute(
                "UPDATE time_blocks SET status = 'active', end_time = end_time + ?1, updated_at = ?2 WHERE id = ?3",
                params![delta, now, paused.block_id],
            )
            .map_err(|error| error.to_string())?;
    } else {
        connection
            .execute(
                "UPDATE time_blocks SET status = 'active', updated_at = ?1 WHERE id = ?2",
                params![now, paused.block_id],
            )
            .map_err(|error| error.to_string())?;
    }

    if forced_resume {
        warnings.push(ScheduleWarning {
            kind: "pause_buffer_exhausted".to_string(),
            message: "The pause used all available rest before the next fixed boundary, so the current block was forced to continue.".to_string(),
        });
    }

    Ok(warnings)
}

fn build_rest_shrink_plan(
    connection: &Connection,
    from_time: i64,
    preferences: &UserPreferences,
    requested_ms: i64,
    strategy: ShrinkStrategy,
) -> Result<Option<RestAdjustmentPlan>, String> {
    let horizon_end = find_local_horizon_end(connection, from_time)?;
    build_rest_shrink_plan_until(
        connection,
        from_time,
        horizon_end,
        preferences,
        requested_ms,
        strategy,
    )
}

fn build_rest_shrink_plan_until(
    connection: &Connection,
    from_time: i64,
    horizon_end: i64,
    preferences: &UserPreferences,
    requested_ms: i64,
    strategy: ShrinkStrategy,
) -> Result<Option<RestAdjustmentPlan>, String> {
    let blocks = load_adjustable_horizon_blocks(connection, from_time, horizon_end)?;
    let min_rest_ms = i64::from(preferences.minimum_rest_minutes.max(1)) * 60 * 1_000;
    let mut break_capacity: Vec<(i64, i64)> = blocks
        .iter()
        .filter(|block| block.block_type == BlockType::Break)
        .filter_map(|block| {
            let duration = block.end_time - block.start_time;
            let capacity = duration.saturating_sub(min_rest_ms);
            (capacity > 0).then_some((block.id, capacity))
        })
        .collect();

    if break_capacity.is_empty() {
        return Ok(None);
    }

    let total_available = break_capacity
        .iter()
        .map(|(_, capacity)| *capacity)
        .sum::<i64>();
    let target = requested_ms.min(total_available);
    if target <= 0 {
        return Ok(None);
    }

    let mut reductions = Vec::new();
    match strategy {
        ShrinkStrategy::Sequential => {
            let mut remaining = target;
            for (block_id, capacity) in break_capacity {
                if remaining <= 0 {
                    break;
                }
                let applied = remaining.min(capacity);
                if applied > 0 {
                    reductions.push(RestBlockAdjustment {
                        block_id,
                        delta_ms: -applied,
                    });
                    remaining -= applied;
                }
            }
        }
        ShrinkStrategy::ImmediateThenProportional => {
            let mut remaining = target;
            if let Some((block_id, capacity)) = break_capacity.first().copied() {
                let applied = remaining.min(capacity);
                if applied > 0 {
                    reductions.push(RestBlockAdjustment {
                        block_id,
                        delta_ms: -applied,
                    });
                    remaining -= applied;
                }
                break_capacity[0].1 -= applied;
            }

            if remaining > 0 {
                let proportional: Vec<(i64, i64)> = break_capacity
                    .iter()
                    .copied()
                    .skip(1)
                    .filter(|(_, capacity)| *capacity > 0)
                    .collect();
                let total_remaining = proportional
                    .iter()
                    .map(|(_, capacity)| *capacity)
                    .sum::<i64>();
                if total_remaining > 0 {
                    let mut applied_total = 0_i64;
                    for (block_id, capacity) in &proportional {
                        let share = ((remaining as f64)
                            * (*capacity as f64 / total_remaining as f64))
                            .floor() as i64;
                        let applied = share.min(*capacity);
                        if applied > 0 {
                            reductions.push(RestBlockAdjustment {
                                block_id: *block_id,
                                delta_ms: -applied,
                            });
                            applied_total += applied;
                        }
                    }

                    let mut leftover = remaining - applied_total;
                    if leftover > 0 {
                        for (block_id, capacity) in proportional {
                            if leftover <= 0 {
                                break;
                            }
                            let already_applied = reductions
                                .iter()
                                .filter(|adjustment| adjustment.block_id == block_id)
                                .map(|adjustment| -adjustment.delta_ms)
                                .sum::<i64>();
                            let available = capacity.saturating_sub(already_applied);
                            if available <= 0 {
                                continue;
                            }
                            let applied = leftover.min(available);
                            reductions.push(RestBlockAdjustment {
                                block_id,
                                delta_ms: -applied,
                            });
                            leftover -= applied;
                        }
                    }
                }
            }
        }
    }

    Ok(Some(RestAdjustmentPlan {
        from_time,
        horizon_end,
        shift_ms: target,
        adjustments: merge_rest_adjustments(reductions),
    }))
}

fn build_rest_growth_plan(
    connection: &Connection,
    from_time: i64,
    preferences: &UserPreferences,
    requested_ms: i64,
) -> Result<Option<RestAdjustmentPlan>, String> {
    let horizon_end = find_local_horizon_end(connection, from_time)?;
    let blocks = load_adjustable_horizon_blocks(connection, from_time, horizon_end)?;
    let max_multiplier = preferences.maximum_rest_multiplier.max(1.0);
    let mut remaining = requested_ms;
    let mut adjustments = Vec::new();

    for block in blocks
        .iter()
        .filter(|block| block.block_type == BlockType::Break)
    {
        if remaining <= 0 {
            break;
        }
        let current_duration = block.end_time - block.start_time;
        let max_duration = ((current_duration as f64) * f64::from(max_multiplier)).ceil() as i64;
        let capacity = max_duration.saturating_sub(current_duration);
        if capacity <= 0 {
            continue;
        }
        let applied = remaining.min(capacity);
        adjustments.push(RestBlockAdjustment {
            block_id: block.id,
            delta_ms: applied,
        });
        remaining -= applied;
    }

    if remaining > 0 {
        return Ok(None);
    }

    Ok(Some(RestAdjustmentPlan {
        from_time,
        horizon_end,
        shift_ms: -requested_ms,
        adjustments,
    }))
}

fn apply_rest_adjustment_plan(
    connection: &Connection,
    plan: &RestAdjustmentPlan,
) -> Result<(), String> {
    let blocks = load_adjustable_horizon_blocks(connection, plan.from_time, plan.horizon_end)?;
    let adjustment_map = plan
        .adjustments
        .iter()
        .map(|adjustment| (adjustment.block_id, adjustment.delta_ms))
        .collect::<std::collections::HashMap<_, _>>();
    let now = timestamp_ms();
    let mut offset = plan.shift_ms;

    for block in blocks {
        let delta_ms = adjustment_map.get(&block.id).copied().unwrap_or(0);
        let start_time = block.start_time + offset;
        let end_time = block.end_time + offset + delta_ms;
        connection
            .execute(
                "UPDATE time_blocks SET start_time = ?1, end_time = ?2, updated_at = ?3 WHERE id = ?4",
                params![start_time, end_time, now, block.id],
            )
            .map_err(|error| error.to_string())?;
        offset += delta_ms;
    }

    Ok(())
}

fn merge_rest_adjustments(adjustments: Vec<RestBlockAdjustment>) -> Vec<RestBlockAdjustment> {
    let mut merged: Vec<RestBlockAdjustment> = Vec::new();
    for adjustment in adjustments {
        if let Some(existing) = merged
            .iter_mut()
            .find(|existing| existing.block_id == adjustment.block_id)
        {
            existing.delta_ms += adjustment.delta_ms;
        } else {
            merged.push(adjustment);
        }
    }
    merged
}

fn load_adjustable_horizon_blocks(
    connection: &Connection,
    from_time: i64,
    horizon_end: i64,
) -> Result<Vec<TimeBlock>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, title, block_type, start_time, end_time, task_id,
                   status, intensity, source, is_protected, enforcement_profile, created_at, updated_at
            FROM time_blocks
            WHERE start_time >= ?1
              AND start_time < ?2
              AND status = 'scheduled'
            ORDER BY start_time ASC, id ASC
            "#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map(params![from_time, horizon_end], map_time_block)
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn find_local_horizon_end(connection: &Connection, from_time: i64) -> Result<i64, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, title, block_type, start_time, end_time, task_id,
                   status, intensity, source, is_protected, enforcement_profile, created_at, updated_at
            FROM time_blocks
            WHERE start_time >= ?1
              AND status IN ('scheduled', 'active', 'paused')
            ORDER BY start_time ASC, id ASC
            "#,
        )
        .map_err(|error| error.to_string())?;
    let blocks = statement
        .query_map(params![from_time], map_time_block)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    for block in &blocks {
        if is_immutable_boundary(block) {
            return Ok(block.start_time);
        }
    }

    Ok(blocks
        .iter()
        .map(|block| block.end_time)
        .max()
        .unwrap_or(from_time))
}

fn is_immutable_boundary(block: &TimeBlock) -> bool {
    block.is_protected
        || matches!(block.source, BlockSource::Manual | BlockSource::Emergency)
        || matches!(block.block_type, BlockType::Sleep | BlockType::Meal)
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

fn current_or_overdue_work_block(
    connection: &Connection,
    schedule: &ScheduleState,
) -> Result<Option<TimeBlock>, String> {
    if let Some(block) = current_or_paused_block(connection, schedule)? {
        if block.block_type == BlockType::Work {
            return Ok(Some(block));
        }
    }

    connection
        .query_row(
            r#"
            SELECT id, title, block_type, start_time, end_time, task_id,
                   status, intensity, source, is_protected, enforcement_profile, created_at, updated_at
            FROM time_blocks
            WHERE status = 'active'
              AND block_type = 'work'
            ORDER BY end_time DESC, id DESC
            LIMIT 1
            "#,
            [],
            map_time_block,
        )
        .optional()
        .map_err(|error| error.to_string())
}

fn sync_overdue_work_block(
    connection: &Connection,
    schedule: &ScheduleState,
    preferences: &UserPreferences,
    now: i64,
    block_id: i64,
    explicit_continue: bool,
) -> Result<Vec<ScheduleWarning>, String> {
    let Some(block) = get_block_by_id(connection, block_id)? else {
        return Ok(vec![]);
    };

    if block.status != BlockStatus::Active
        || block.block_type != BlockType::Work
        || block.end_time > now
    {
        return Ok(vec![]);
    }

    let next_work_start = find_next_work_start(connection, block.id, block.start_time)?;
    let continuing = explicit_continue
        || schedule
            .runtime
            .lock()
            .map_err(|error| error.to_string())?
            .continuing_block_id
            == Some(block.id);

    if !continuing && next_work_start.map(|start| now >= start).unwrap_or(false) {
        connection
            .execute(
                "UPDATE time_blocks SET status = 'completed', updated_at = ?1 WHERE id = ?2",
                params![now, block.id],
            )
            .map_err(|error| error.to_string())?;
        record_schedule_event(
            connection,
            "schedule.auto_handoff_to_next_work_block",
            Some(&block),
            json!({
                "nextWorkStart": next_work_start
            }),
        );
        let mut runtime = schedule.runtime.lock().map_err(|error| error.to_string())?;
        if runtime.prompted_block_id == Some(block.id) {
            runtime.prompted_block_id = None;
        }
        if runtime.continuing_block_id == Some(block.id) {
            runtime.continuing_block_id = None;
        }
        runtime.last_emitted_block_id = None;
        return Ok(vec![]);
    }

    if !continuing {
        let mut runtime = schedule.runtime.lock().map_err(|error| error.to_string())?;
        runtime.last_emitted_block_id = None;
        return Ok(vec![]);
    }

    let target_end = now;
    let delta = target_end.saturating_sub(block.end_time);
    if delta <= 0 {
        return Ok(vec![]);
    }

    if let Some(plan) = build_rest_shrink_plan(
        connection,
        block.end_time,
        preferences,
        delta,
        ShrinkStrategy::Sequential,
    )?
    .filter(|plan| plan.shift_ms >= delta)
    {
        connection
            .execute(
                "UPDATE time_blocks SET end_time = end_time + ?1, updated_at = ?2 WHERE id = ?3",
                params![delta, now, block.id],
            )
            .map_err(|error| error.to_string())?;
        apply_rest_adjustment_plan(connection, &plan)?;
        return Ok(vec![]);
    }

    if continuing {
        connection
            .execute(
                "UPDATE time_blocks SET end_time = ?1, updated_at = ?2 WHERE id = ?3",
                params![target_end, now, block.id],
            )
            .map_err(|error| error.to_string())?;
        rebuild_schedule_internal(connection, target_end, preferences, None)?;
        record_schedule_event(
            connection,
            "schedule.continue_rescheduled",
            Some(&block),
            json!({
                "targetEnd": target_end
            }),
        );
        return Ok(vec![ScheduleWarning {
            kind: "rescheduled_after_continue".to_string(),
            message: "Continuing this block used up local rest before the next immutable boundary, so the future schedule was rebuilt around the longer work block.".to_string(),
        }]);
    }

    {
        let mut runtime = schedule.runtime.lock().map_err(|error| error.to_string())?;
        if runtime.prompted_block_id == Some(block.id) {
            runtime.prompted_block_id = None;
        }
        runtime.last_emitted_block_id = None;
    }

    Ok(vec![ScheduleWarning {
        kind: "overtime_buffer_exhausted".to_string(),
        message: "This block can no longer borrow rest without breaking minimum rest, so the schedule will move on unless you explicitly continue it.".to_string(),
    }])
}

fn current_overdue_prompt(
    connection: &Connection,
    schedule: &ScheduleState,
) -> Result<Option<BlockDecisionPrompt>, String> {
    let Some(block) = connection
        .query_row(
            r#"
            SELECT id, title, block_type, start_time, end_time, task_id,
                   status, intensity, source, is_protected, enforcement_profile, created_at, updated_at
            FROM time_blocks
            WHERE status = 'active'
              AND block_type = 'work'
              AND end_time <= ?1
            ORDER BY end_time DESC, id DESC
            LIMIT 1
            "#,
            params![timestamp_ms()],
            map_time_block,
        )
        .optional()
        .map_err(|error| error.to_string())?
    else {
        return Ok(None);
    };

    let runtime = schedule.runtime.lock().map_err(|error| error.to_string())?;
    if runtime.continuing_block_id == Some(block.id) {
        return Ok(None);
    }

    let next_work_start = find_next_work_start(connection, block.id, block.start_time)?;

    Ok(Some(BlockDecisionPrompt {
        block,
        next_work_start,
        continuing: false,
    }))
}

fn find_next_work_start(
    connection: &Connection,
    block_id: i64,
    block_start_time: i64,
) -> Result<Option<i64>, String> {
    connection
        .query_row(
            r#"
            SELECT start_time
            FROM time_blocks
            WHERE id != ?1
              AND block_type = 'work'
              AND status IN ('scheduled', 'active')
              AND start_time > ?2
            ORDER BY start_time ASC, id ASC
            LIMIT 1
            "#,
            params![block_id, block_start_time],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())
}

fn tick_schedule(app: &AppHandle) -> Result<(), String> {
    let database = app.state::<DatabaseState>();
    let config = app.state::<crate::config::manager::ConfigState>();
    let schedule = app.state::<ScheduleState>();
    let mut runtime = schedule.runtime.lock().map_err(|error| error.to_string())?;

    if let Some(paused) = runtime.paused.clone() {
        if timestamp_ms().saturating_sub(paused.paused_at) >= paused.available_pause_ms {
            runtime.paused = None;
            drop(runtime);

            let connection = database.connection()?;
            let preferences = config.get_preferences()?;
            let warnings = apply_pause_resume(
                &connection,
                paused.clone(),
                &preferences,
                paused.available_pause_ms,
                true,
            )?;
            if !warnings.is_empty() {
                app.emit("schedule-warning", &warnings)
                    .map_err(|error| error.to_string())?;
            }
            if let Some(block) = get_block_by_id(&connection, paused.block_id)? {
                app.emit("block-changed", &block)
                    .map_err(|error| error.to_string())?;
            }
            return Ok(());
        }

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

    let preferences = config.get_preferences()?;
    let connection = database.connection()?;
    let overdue_work = current_or_overdue_work_block(&connection, &schedule)?;
    let warnings = if let Some(block) = &overdue_work {
        let (already_prompted, continuing) = {
            let runtime = schedule.runtime.lock().map_err(|error| error.to_string())?;
            (
                runtime.prompted_block_id == Some(block.id),
                runtime.continuing_block_id == Some(block.id),
            )
        };
        if continuing {
            sync_overdue_work_block(
                &connection,
                &schedule,
                &preferences,
                timestamp_ms(),
                block.id,
                false,
            )?
        } else if already_prompted {
            let now = timestamp_ms();
            connection
                .execute(
                    "UPDATE time_blocks SET status = 'completed', updated_at = ?1 WHERE id = ?2",
                    params![now, block.id],
                )
                .map_err(|error| error.to_string())?;
            record_schedule_event(
                &connection,
                "schedule.auto_completed_unanswered_block",
                Some(block),
                json!({ "plannedEnd": block.end_time }),
            );
            let mut runtime = schedule.runtime.lock().map_err(|error| error.to_string())?;
            runtime.prompted_block_id = None;
            runtime.last_emitted_block_id = None;
            vec![]
        } else {
            if let Some(prompt) = current_overdue_prompt(&connection, &schedule)? {
                let mut runtime = schedule.runtime.lock().map_err(|error| error.to_string())?;
                app.emit("block-finished-prompt", &prompt)
                    .map_err(|error| error.to_string())?;
                record_schedule_event(
                    &connection,
                    "schedule.block_finished_prompted",
                    Some(&prompt.block),
                    json!({
                        "nextWorkStart": prompt.next_work_start
                    }),
                );
                runtime.prompted_block_id = Some(prompt.block.id);
            }
            vec![]
        }
    } else {
        vec![]
    };
    if !warnings.is_empty() {
        app.emit("schedule-warning", &warnings)
            .map_err(|error| error.to_string())?;
    }

    if overdue_work.is_none() {
        let mut runtime = schedule.runtime.lock().map_err(|error| error.to_string())?;
        runtime.prompted_block_id = None;
    }

    let current = refresh_schedule_status(&connection)?;

    if let Some(block) = current {
        let mut runtime = schedule.runtime.lock().map_err(|error| error.to_string())?;

        if runtime.last_emitted_block_id != Some(block.id) {
            app.emit("block-changed", &block)
                .map_err(|error| error.to_string())?;
            runtime.last_emitted_block_id = Some(block.id);
        }

        if runtime.prompted_block_id == Some(block.id)
            && runtime.continuing_block_id == Some(block.id)
        {
            runtime.prompted_block_id = None;
        }

        app.emit(
            "timer-tick",
            TimerTickPayload {
                remaining_secs: seconds_remaining(block.end_time, timestamp_ms()),
                total_secs: block.duration_secs(),
            },
        )
        .map_err(|error| error.to_string())?;
    } else {
        let mut runtime = schedule.runtime.lock().map_err(|error| error.to_string())?;
        runtime.prompted_block_id = None;
    }

    Ok(())
}

fn refresh_schedule_status(connection: &Connection) -> Result<Option<TimeBlock>, String> {
    let now = timestamp_ms();

    connection
        .execute(
            "UPDATE time_blocks SET status = 'completed', updated_at = ?1 WHERE status = 'active' AND end_time <= ?1 AND block_type != 'work'",
            params![now],
        )
        .map_err(|error| error.to_string())?;
    let active_work = connection
        .query_row(
            r#"
            SELECT id, title, block_type, start_time, end_time, task_id,
                   status, intensity, source, is_protected, enforcement_profile, created_at, updated_at
            FROM time_blocks
            WHERE status = 'active'
              AND block_type = 'work'
            ORDER BY start_time ASC, id ASC
            LIMIT 1
            "#,
            [],
            map_time_block,
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if let Some(block) = active_work {
        connection
            .execute(
                r#"
                UPDATE time_blocks
                SET status = 'scheduled', updated_at = ?1
                WHERE status = 'active'
                  AND id != ?2
                "#,
                params![now, block.id],
            )
            .map_err(|error| error.to_string())?;
        return get_block_by_id(connection, block.id);
    }

    let current = connection
        .query_row(
            r#"
            SELECT id, title, block_type, start_time, end_time, task_id,
                   status, intensity, source, is_protected, enforcement_profile, created_at, updated_at
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

    let overdue_work = connection
        .query_row(
            r#"
            SELECT id, title, block_type, start_time, end_time, task_id,
                   status, intensity, source, is_protected, enforcement_profile, created_at, updated_at
            FROM time_blocks
            WHERE status = 'active'
              AND block_type = 'work'
            ORDER BY end_time DESC, id DESC
            LIMIT 1
            "#,
            [],
            map_time_block,
        )
        .optional()
        .map_err(|error| error.to_string())?;

    if overdue_work.is_some() {
        return Ok(overdue_work);
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
                   status, intensity, source, is_protected, enforcement_profile, created_at, updated_at
            FROM time_blocks
            WHERE id = ?1
            "#,
            params![id],
            map_time_block,
        )
        .optional()
        .map_err(|error| error.to_string())
}

fn load_schedule_snapshot(
    connection: &Connection,
    from: i64,
    to: Option<i64>,
) -> Result<Vec<TimeBlock>, String> {
    let mut query = String::from(
        r#"
        SELECT id, title, block_type, start_time, end_time, task_id,
               status, intensity, source, is_protected, enforcement_profile, created_at, updated_at
        FROM time_blocks
        WHERE end_time > ?1
        "#,
    );
    if to.is_some() {
        query.push_str(" AND start_time < ?2");
    }
    query.push_str(" ORDER BY start_time ASC, id ASC");

    let mut statement = connection
        .prepare(&query)
        .map_err(|error| error.to_string())?;
    let rows = match to {
        Some(to) => statement.query_map(params![from, to], map_time_block),
        None => statement.query_map(params![from], map_time_block),
    }
    .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn build_schedule_mutation_result(
    connection: &Connection,
    history_action: Option<&str>,
    from: i64,
    to: Option<i64>,
    before: Vec<TimeBlock>,
    warnings: Vec<ScheduleWarning>,
    pseudo_deadline: Option<i64>,
    current_block: Option<TimeBlock>,
) -> Result<ScheduleMutationResult, String> {
    let blocks = load_schedule_snapshot(connection, from, to)?;
    let mutations = diff_schedule_blocks(&before, &blocks);
    let result = ScheduleMutationResult {
        current_block,
        blocks,
        warnings,
        pseudo_deadline,
        mutations,
    };
    if let Some(action) = history_action {
        record_schedule_mutation_history(connection, action, &result)?;
    }
    Ok(result)
}

fn diff_schedule_blocks(before: &[TimeBlock], after: &[TimeBlock]) -> Vec<ScheduleMutation> {
    let before_map = before
        .iter()
        .cloned()
        .map(|block| (block.id, block))
        .collect::<std::collections::HashMap<_, _>>();
    let after_map = after
        .iter()
        .cloned()
        .map(|block| (block.id, block))
        .collect::<std::collections::HashMap<_, _>>();
    let mut ids = before_map
        .keys()
        .chain(after_map.keys())
        .copied()
        .collect::<Vec<_>>();
    ids.sort_unstable();
    ids.dedup();

    let mut mutations = Vec::new();
    for id in ids {
        match (before_map.get(&id), after_map.get(&id)) {
            (None, Some(after_block)) => mutations.push(ScheduleMutation {
                kind: "block_inserted".to_string(),
                block_id: Some(id),
                task_id: after_block.task_id,
                before: None,
                after: Some(after_block.clone()),
            }),
            (Some(before_block), None) => mutations.push(ScheduleMutation {
                kind: "block_deleted".to_string(),
                block_id: Some(id),
                task_id: before_block.task_id,
                before: Some(before_block.clone()),
                after: None,
            }),
            (Some(before_block), Some(after_block)) => {
                if before_block.start_time != after_block.start_time
                    || before_block.end_time != after_block.end_time
                {
                    mutations.push(ScheduleMutation {
                        kind: "block_timing_changed".to_string(),
                        block_id: Some(id),
                        task_id: after_block.task_id.or(before_block.task_id),
                        before: Some(before_block.clone()),
                        after: Some(after_block.clone()),
                    });
                }
                if before_block.status != after_block.status {
                    mutations.push(ScheduleMutation {
                        kind: "block_status_changed".to_string(),
                        block_id: Some(id),
                        task_id: after_block.task_id.or(before_block.task_id),
                        before: Some(before_block.clone()),
                        after: Some(after_block.clone()),
                    });
                }
                if before_block.title != after_block.title
                    || before_block.block_type != after_block.block_type
                    || before_block.task_id != after_block.task_id
                    || before_block.source != after_block.source
                    || before_block.is_protected != after_block.is_protected
                {
                    mutations.push(ScheduleMutation {
                        kind: "block_metadata_changed".to_string(),
                        block_id: Some(id),
                        task_id: after_block.task_id.or(before_block.task_id),
                        before: Some(before_block.clone()),
                        after: Some(after_block.clone()),
                    });
                }
            }
            (None, None) => {}
        }
    }

    mutations
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
            !matches!(
                (block.source, block.status, block.is_protected),
                (BlockSource::Template, BlockStatus::Scheduled, _)
                    | (BlockSource::Planner, BlockStatus::Scheduled, false)
            )
        })
        .map(|block| TemplateInterval {
            title: block.title,
            block_type: block.block_type,
            start_time: block.start_time,
            end_time: block.end_time,
            task_id: block.task_id,
            intensity: block.intensity,
            source: block.source,
            is_protected: block.is_protected,
            enforcement_profile: block.enforcement_profile,
        })
        .collect())
}

fn load_active_work_intervals(
    connection: &Connection,
    from: i64,
    to: i64,
) -> Result<Vec<TemplateInterval>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, title, block_type, start_time, end_time, task_id,
                   status, intensity, source, is_protected, enforcement_profile, created_at, updated_at
            FROM time_blocks
            WHERE start_time < ?2
              AND end_time > ?1
              AND status IN ('active', 'paused')
              AND block_type IN ('work', 'custom')
            ORDER BY start_time ASC, id ASC
            "#,
        )
        .map_err(|error| error.to_string())?;
    let intervals = statement
        .query_map(params![from, to], map_time_block)
        .map_err(|error| error.to_string())?
        .map(|row| {
            row.map(|block| TemplateInterval {
                title: block.title,
                block_type: block.block_type,
                start_time: block.start_time,
                end_time: block.end_time,
                task_id: block.task_id,
                intensity: block.intensity,
                source: block.source,
                is_protected: block.is_protected,
                enforcement_profile: block.enforcement_profile,
            })
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(intervals)
}

fn generate_rest_after_preserved_work(
    preserved_intervals: &[TemplateInterval],
    fixed_intervals: &[TemplateInterval],
    tasks: &[PlannerTask],
    preferences: &UserPreferences,
    horizon: i64,
) -> Vec<TemplateInterval> {
    let mut occupied = [preserved_intervals.to_vec(), fixed_intervals.to_vec()].concat();
    occupied.sort_by_key(|interval| (interval.start_time, interval.end_time));

    preserved_intervals
        .iter()
        .filter(|interval| matches!(interval.block_type, BlockType::Work | BlockType::Custom))
        .filter(|interval| !interval.is_protected)
        .filter(|interval| {
            interval
                .task_id
                .and_then(|task_id| tasks.iter().find(|task| task.task_id == task_id))
                .is_none_or(|task| task.kind == TaskKind::Flexible)
        })
        .filter_map(|interval| {
            let start = interval.end_time;
            if start >= horizon {
                return None;
            }
            let next_occupied_start = occupied
                .iter()
                .filter(|occupied| {
                    occupied.start_time >= start && occupied.start_time > interval.start_time
                })
                .map(|occupied| occupied.start_time)
                .min()
                .unwrap_or(horizon);
            let rest_minutes = preferred_rest_after_interval(interval, tasks, preferences)
                .max(i64::from(preferences.minimum_rest_minutes.max(1)));
            let end = min(
                start + rest_minutes * 60_000,
                min(next_occupied_start, horizon),
            );
            (end > start).then_some(TemplateInterval {
                title: BlockType::Break.default_title().to_string(),
                block_type: BlockType::Break,
                start_time: start,
                end_time: end,
                task_id: None,
                intensity: 1,
                source: BlockSource::Planner,
                is_protected: false,
                enforcement_profile: Some("rest".to_string()),
            })
        })
        .collect()
}

fn preferred_rest_after_interval(
    interval: &TemplateInterval,
    tasks: &[PlannerTask],
    preferences: &UserPreferences,
) -> i64 {
    let task = interval
        .task_id
        .and_then(|task_id| tasks.iter().find(|task| task.task_id == task_id));
    let work_ratio = task
        .and_then(|task| task.work_ratio)
        .unwrap_or(i64::from(preferences.work_duration_minutes.max(1)))
        .max(1);
    let rest_ratio = task
        .and_then(|task| task.rest_ratio)
        .unwrap_or(i64::from(preferences.break_duration_minutes))
        .max(0);
    preferred_break_minutes(
        (interval.end_time - interval.start_time) / 60_000,
        work_ratio,
        rest_ratio,
    )
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
            task_id: None,
            intensity: if next_type == BlockType::Work { 4 } else { 2 },
            source: BlockSource::Template,
            is_protected: false,
            enforcement_profile: Some(if next_type == BlockType::Break {
                "rest".to_string()
            } else {
                "work".to_string()
            }),
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
        task_id: None,
        intensity,
        source: BlockSource::Template,
        is_protected: matches!(block_type, BlockType::Sleep | BlockType::Meal),
        enforcement_profile: Some(match block_type {
            BlockType::Work => "work".to_string(),
            _ => "rest".to_string(),
        }),
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

fn load_plannable_tasks(connection: &Connection, from: i64) -> Result<Vec<PlannerTask>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, name, group_id, priority, estimated_minutes, deadline,
                   max_chunk_minutes, min_chunk_minutes, minimum_rest_minutes,
                   work_ratio, rest_ratio, protect_generated_blocks, enforcement_profile,
                   kind, fixed_window_start_minute, fixed_window_end_minute,
                   recurrence_kind, recurrence_days_mask, recurrence_anchor_date,
                   recurrence_dates, recurrence_overrides
            FROM tasks
            WHERE (
                (estimated_minutes IS NOT NULL AND estimated_minutes > 0)
                OR kind = 'fixed'
              )
              AND (deadline IS NULL OR deadline >= ?1)
            ORDER BY priority DESC, deadline ASC, updated_at DESC, name ASC
            "#,
        )
        .map_err(|error| error.to_string())?;

    let tasks = statement
        .query_map(params![from], |row| {
            let dates_str: Option<String> = row.get(19)?;
            Ok(PlannerTask {
                task_id: row.get(0)?,
                title: row.get(1)?,
                group_id: row.get(2)?,
                enforcement_profile: row.get(12)?,
                kind: crate::tasks::models::task_kind_from_str(row.get::<_, String>(13)?.as_str()),
                priority: row.get(3)?,
                estimated_minutes: row.get::<_, Option<i64>>(4)?.unwrap_or(0),
                deadline: row.get(5)?,
                max_chunk_minutes: row.get(6)?,
                min_chunk_minutes: row.get(7)?,
                minimum_rest_minutes: row.get(8)?,
                work_ratio: row.get(9)?,
                rest_ratio: row.get(10)?,
                protect_generated_blocks: row.get(11)?,
                fixed_window_start_minute: row.get(14)?,
                fixed_window_end_minute: row.get(15)?,
                recurrence_kind: crate::tasks::models::recurrence_kind_from_str(
                    row.get::<_, String>(16)?.as_str(),
                ),
                recurrence_days_mask: row.get(17)?,
                recurrence_anchor_date: row.get(18)?,
                recurrence_dates: dates_str
                    .as_deref()
                    .and_then(|s| serde_json::from_str::<Vec<i64>>(s).ok()),
                recurrence_overrides: row.get::<_, Option<String>>(20)?,
                required_share: 0.0,
                section_allocations: vec![],
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(tasks)
}

fn repair_fixed_task_windows_from_blocks(connection: &Connection) -> Result<(), String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT id
            FROM tasks
            WHERE kind = 'fixed'
              AND (fixed_window_start_minute IS NULL OR fixed_window_end_minute IS NULL)
            "#,
        )
        .map_err(|error| error.to_string())?;
    let task_ids = statement
        .query_map([], |row| row.get::<_, i64>(0))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    for task_id in task_ids {
        let block = connection
            .query_row(
                r#"
                SELECT start_time, end_time
                FROM time_blocks
                WHERE task_id = ?1
                  AND block_type = 'work'
                  AND status IN ('scheduled', 'active', 'paused', 'completed')
                ORDER BY start_time DESC
                LIMIT 1
                "#,
                params![task_id],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        let Some((start_time, end_time)) = block else {
            continue;
        };
        let start_minute = minute_of_local_day(start_time)?;
        let end_minute = minute_of_local_day(end_time)?;
        connection
            .execute(
                r#"
                UPDATE tasks
                SET fixed_window_start_minute = COALESCE(fixed_window_start_minute, ?1),
                    fixed_window_end_minute = COALESCE(fixed_window_end_minute, ?2),
                    updated_at = ?3
                WHERE id = ?4
                "#,
                params![start_minute, end_minute, timestamp_ms(), task_id],
            )
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn compute_pseudo_deadline(
    connection: &Connection,
    template: &WeeklyTemplate,
    preferences: &UserPreferences,
    from: i64,
    tasks: &[PlannerTask],
) -> Result<i64, String> {
    let total_work_minutes: i64 = tasks.iter().map(|task| task.estimated_minutes).sum();
    let latest_real_deadline = tasks
        .iter()
        .filter_map(|task| task.deadline)
        .max()
        .unwrap_or(from);
    let ratio_work = i64::from(resolve_work_minutes(preferences, template));
    let ratio_break = i64::from(resolve_break_minutes(preferences, template));
    let preferred_total_minutes = ((total_work_minutes as f64)
        * ((ratio_work + ratio_break) as f64 / ratio_work as f64))
        .ceil() as i64;

    let mut horizon = max(
        latest_real_deadline,
        from + preferred_total_minutes.max(1) * 60 * 1_000,
    );

    loop {
        let immutable_intervals = merge_intervals(
            [
                load_preserved_intervals(connection, from, horizon)?,
                generate_fixed_template_blocks(connection, template, from, horizon)?,
            ]
            .concat(),
            from,
            horizon,
        );
        let windows = invert_intervals_to_windows(&immutable_intervals, from, horizon);
        let scoring_capacity: i64 = windows
            .iter()
            .map(|window| {
                ideal_work_capacity_minutes(window.duration_minutes(), preferences, template)
            })
            .sum();

        if scoring_capacity >= total_work_minutes {
            return Ok(horizon);
        }

        horizon += 24 * 60 * 60 * 1_000;
    }
}

fn generate_fixed_template_blocks(
    connection: &Connection,
    template: &WeeklyTemplate,
    from: i64,
    to: i64,
) -> Result<Vec<TemplateInterval>, String> {
    let preserved_manual = load_preserved_intervals(connection, from, to)?;
    let start_date = date_from_timestamp(from)?;
    let end_date = date_from_timestamp(to - 1)?;
    let day_count = end_date.signed_duration_since(start_date).num_days().max(0) as u64;
    let mut fixed = Vec::new();

    for offset in 0..=day_count {
        let date = start_date
            .checked_add_days(Days::new(offset))
            .ok_or_else(|| "date range overflow while generating fixed intervals".to_string())?;
        let day_template = find_day_template(template, weekday_from_chrono(date.weekday()));
        if let Some(day_template) = day_template {
            fixed.extend(build_fixed_intervals_for_day(
                date,
                day_template,
                &template.fixed_blocks,
            )?);
        }
    }

    Ok(fixed
        .into_iter()
        .filter(|interval| interval.start_time < to && interval.end_time > from)
        .filter(|interval| {
            !preserved_manual.iter().any(|manual| {
                manual.source == BlockSource::Manual
                    && intervals_overlap(
                        interval.start_time,
                        interval.end_time,
                        manual.start_time,
                        manual.end_time,
                    )
            })
        })
        .collect())
}

fn generate_fixed_task_intervals(
    tasks: &[PlannerTask],
    from: i64,
    to: i64,
) -> Result<Vec<TemplateInterval>, String> {
    let start_date = date_from_timestamp(from)?
        .checked_sub_days(Days::new(1))
        .ok_or_else(|| "date range overflow while generating fixed task intervals".to_string())?;
    let end_date = date_from_timestamp(to - 1)?;
    let day_count = end_date.signed_duration_since(start_date).num_days().max(0) as u64;
    let mut intervals = Vec::new();

    for task in tasks.iter().filter(|task| task.kind == TaskKind::Fixed) {
        let Some(default_start) = task.fixed_window_start_minute else {
            continue;
        };
        let Some(default_end) = task.fixed_window_end_minute else {
            continue;
        };
        let overrides: Option<serde_json::Value> = task
            .recurrence_overrides
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok());

        for offset in 0..=day_count {
            let date = start_date
                .checked_add_days(Days::new(offset))
                .ok_or_else(|| {
                    "date range overflow while generating fixed task intervals".to_string()
                })?;
            if !fixed_task_occurs_on_date(task, date)? {
                continue;
            }

            let (start_minute, end_minute) = override_window_for_date(
                overrides.as_ref(),
                task,
                date,
                default_start,
                default_end,
            );

            let start_time = timestamp_for_minute(date, start_minute as u16)?;
            let end_date = if end_minute <= start_minute {
                date.checked_add_days(Days::new(1)).ok_or_else(|| {
                    "date range overflow while generating fixed task intervals".to_string()
                })?
            } else {
                date
            };
            let end_time = timestamp_for_minute(end_date, end_minute as u16)?;
            if start_time >= to || end_time <= from {
                continue;
            }

            intervals.push(TemplateInterval {
                title: task.title.clone(),
                block_type: BlockType::Work,
                start_time,
                end_time,
                task_id: Some(task.task_id),
                intensity: intensity_for_priority(task.priority),
                source: BlockSource::Planner,
                is_protected: true,
                enforcement_profile: Some(
                    task.enforcement_profile
                        .clone()
                        .unwrap_or_else(|| "work".to_string()),
                ),
            });

            // Rest-after-task: append a Break interval if the task asked
            // for a minimum rest. Protected so replans don't drop it.
            if let Some(rest_min) = task.minimum_rest_minutes {
                if rest_min > 0 {
                    let rest_end = end_time + rest_min * 60_000;
                    if rest_end > from && end_time < to {
                        intervals.push(TemplateInterval {
                            title: format!("Rest after {}", task.title),
                            block_type: BlockType::Break,
                            start_time: end_time,
                            end_time: rest_end.min(to),
                            task_id: None,
                            intensity: 1,
                            source: BlockSource::Planner,
                            is_protected: true,
                            enforcement_profile: Some("rest".to_string()),
                        });
                    }
                }
            }
        }
    }

    Ok(intervals)
}

fn override_window_for_date(
    overrides: Option<&serde_json::Value>,
    task: &PlannerTask,
    date: NaiveDate,
    default_start: i64,
    default_end: i64,
) -> (i64, i64) {
    let map = match overrides.and_then(|v| v.as_object()) {
        Some(m) => m,
        None => return (default_start, default_end),
    };
    // Schedule (once): key = local-midnight epoch millis of the date.
    // Repeating: key = weekday index (0=Mon ... 6=Sun).
    let candidate_keys: Vec<String> = match task.recurrence_kind {
        RecurrenceKind::Once | RecurrenceKind::None => {
            let day_start_ms = date
                .and_hms_opt(0, 0, 0)
                .and_then(|dt| dt.and_local_timezone(chrono::Local).earliest())
                .map(|dt| dt.timestamp_millis())
                .unwrap_or(0);
            vec![day_start_ms.to_string()]
        }
        _ => {
            let wd = date.weekday().num_days_from_monday() as i64;
            vec![wd.to_string()]
        }
    };
    for key in candidate_keys {
        if let Some(entry) = map.get(&key) {
            let start = entry
                .get("startMin")
                .and_then(|v| v.as_i64())
                .unwrap_or(default_start);
            let end = entry
                .get("endMin")
                .and_then(|v| v.as_i64())
                .unwrap_or(default_end);
            return (start, end);
        }
    }
    (default_start, default_end)
}

fn fixed_task_occurs_on_date(task: &PlannerTask, date: NaiveDate) -> Result<bool, String> {
    let weekday = date.weekday().num_days_from_monday() as i64;
    Ok(match task.recurrence_kind {
        RecurrenceKind::Daily => true,
        RecurrenceKind::Weekdays => weekday < 5,
        RecurrenceKind::Weekly => task.recurrence_days_mask & (1 << weekday) != 0,
        RecurrenceKind::Once | RecurrenceKind::None => {
            if let Some(list) = task.recurrence_dates.as_ref() {
                for stamp in list {
                    if date_from_timestamp(*stamp)? == date {
                        return Ok(true);
                    }
                }
            }
            let anchor = task
                .recurrence_anchor_date
                .or(task.deadline)
                .map(date_from_timestamp)
                .transpose()?;
            anchor == Some(date)
        }
    })
}

fn build_section_endpoints(from: i64, pseudo_deadline: i64, tasks: &[PlannerTask]) -> Vec<i64> {
    let mut endpoints: Vec<i64> = tasks
        .iter()
        .filter_map(|task| task.deadline)
        .map(|deadline| max(deadline, from + 60 * 1_000))
        .collect();
    endpoints.sort_unstable();
    endpoints.dedup();
    if endpoints.last().copied() != Some(pseudo_deadline) {
        endpoints.push(pseudo_deadline);
    }
    endpoints
}

fn build_sections_from_windows(
    windows: &[TimeWindow],
    section_endpoints: &[i64],
    from: i64,
    preferences: &UserPreferences,
    template: &WeeklyTemplate,
) -> Vec<ScheduleSection> {
    let mut sections = Vec::new();
    let mut prev = None;
    for &end in section_endpoints {
        let start = prev.unwrap_or(from);
        let mut section_windows = Vec::new();
        for window in windows {
            let slice_start = max(window.start_time, start);
            let slice_end = min(window.end_time, end);
            if slice_start < slice_end {
                section_windows.push(TimeWindow {
                    start_time: slice_start,
                    end_time: slice_end,
                });
            }
        }
        let scoring_work_capacity_minutes = section_windows
            .iter()
            .map(|window| {
                ideal_work_capacity_minutes(window.duration_minutes(), preferences, template)
            })
            .sum();
        sections.push(ScheduleSection {
            end_time: end,
            windows: section_windows,
            scoring_work_capacity_minutes,
        });
        prev = Some(end);
    }
    sections
}

fn detect_theoretical_overflow(
    sections: &[ScheduleSection],
    tasks: &[PlannerTask],
    section_endpoints: &[i64],
    from: i64,
) -> Vec<ScheduleWarning> {
    let mut warnings = Vec::new();
    let mut earlier_minutes = 0_i64;

    for (idx, endpoint) in section_endpoints.iter().enumerate() {
        let cohort_total: i64 = tasks
            .iter()
            .filter(|task| {
                task.deadline
                    .map(|deadline| max(deadline, from + 60 * 1_000))
                    == Some(*endpoint)
            })
            .map(|task| task.estimated_minutes)
            .sum();
        let cumulative_capacity: i64 = sections
            .iter()
            .take(idx + 1)
            .map(|section| section.scoring_work_capacity_minutes)
            .sum();
        let eligible_capacity = cumulative_capacity - earlier_minutes;

        if cohort_total > eligible_capacity {
            warnings.push(ScheduleWarning {
                kind: "theoretical_overflow".to_string(),
                message: format!(
                    "Tasks due by {} need about {} minutes, but only {} work minutes are eligible before that deadline.",
                    endpoint,
                    cohort_total,
                    eligible_capacity.max(0)
                ),
            });
        }

        earlier_minutes += cohort_total;
    }

    warnings
}

fn allocate_tasks_to_sections(
    sections: &[ScheduleSection],
    pseudo_section_index: usize,
    mut tasks: Vec<PlannerTask>,
    section_endpoints: &[i64],
    from: i64,
    warnings: &mut Vec<ScheduleWarning>,
) -> Vec<PlannerTask> {
    let mut cumulative_capacities = Vec::with_capacity(sections.len());
    let mut running = 0_i64;
    for section in sections {
        running += section.scoring_work_capacity_minutes;
        cumulative_capacities.push(running);
    }

    let mut earlier_deadline_total = 0_i64;
    let mut groups: Vec<(usize, Vec<usize>)> = Vec::new();
    for (task_idx, task) in tasks.iter().enumerate() {
        let section_index = task
            .deadline
            .and_then(|deadline| {
                section_endpoints
                    .iter()
                    .position(|endpoint| *endpoint == max(deadline, from + 60 * 1_000))
            })
            .unwrap_or(pseudo_section_index);
        if let Some((_, indices)) = groups.iter_mut().find(|(idx, _)| *idx == section_index) {
            indices.push(task_idx);
        } else {
            groups.push((section_index, vec![task_idx]));
        }
    }
    groups.sort_by_key(|(idx, _)| *idx);

    let mut remaining_capacity_by_section: Vec<i64> = sections
        .iter()
        .map(|section| section.scoring_work_capacity_minutes)
        .collect();

    for (section_index, task_indices) in groups {
        let eligible_capacity = cumulative_capacities[section_index] - earlier_deadline_total;
        for &task_idx in &task_indices {
            tasks[task_idx].required_share =
                tasks[task_idx].estimated_minutes as f64 / eligible_capacity.max(1) as f64;
            tasks[task_idx].section_allocations = vec![0; sections.len()];
        }

        let mut ordered_indices = task_indices.clone();
        ordered_indices.sort_by(|left, right| {
            tasks[*right]
                .priority
                .cmp(&tasks[*left].priority)
                .then_with(|| {
                    tasks[*right]
                        .required_share
                        .partial_cmp(&tasks[*left].required_share)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .then_with(|| tasks[*left].title.cmp(&tasks[*right].title))
        });

        for task_idx in ordered_indices {
            let mut remaining = tasks[task_idx].estimated_minutes;
            for target_section in 0..=section_index {
                if remaining <= 0 {
                    break;
                }
                let assignable = min(
                    remaining,
                    remaining_capacity_by_section[target_section].max(0),
                );
                tasks[task_idx].section_allocations[target_section] += assignable;
                remaining_capacity_by_section[target_section] -= assignable;
                remaining -= assignable;
            }

            if remaining > 0 {
                warnings.push(ScheduleWarning {
                    kind: "unscheduled_overflow".to_string(),
                    message: format!(
                        "Task '{}' still has {} unallocated minutes before its deadline window.",
                        tasks[task_idx].title, remaining
                    ),
                });
            }
        }

        earlier_deadline_total += task_indices
            .iter()
            .map(|idx| tasks[*idx].estimated_minutes)
            .sum::<i64>();
    }

    tasks
}

fn materialize_sections(
    sections: &[ScheduleSection],
    tasks: &mut [PlannerTask],
    preferences: &UserPreferences,
    warnings: &mut Vec<ScheduleWarning>,
) -> Result<Vec<TemplateInterval>, String> {
    let mut generated = Vec::new();
    let global_min_break_minutes = i64::from(preferences.minimum_rest_minutes.max(1));
    let default_max_chunk_minutes = i64::from(preferences.work_duration_minutes.max(1));
    let default_ratio_work = i64::from(preferences.work_duration_minutes.max(1));
    let default_ratio_break = i64::from(preferences.break_duration_minutes);

    for (section_index, section) in sections.iter().enumerate() {
        let mut remaining_chunks: Vec<(usize, Vec<i64>)> = tasks
            .iter()
            .enumerate()
            .filter_map(|(task_idx, task)| {
                let allocated = task
                    .section_allocations
                    .get(section_index)
                    .copied()
                    .unwrap_or(0);
                (allocated > 0).then_some((
                    task_idx,
                    split_into_preferred_chunks(
                        allocated,
                        task.max_chunk_minutes
                            .unwrap_or(default_max_chunk_minutes)
                            .max(1),
                        task.min_chunk_minutes.unwrap_or(1).max(1),
                    ),
                ))
            })
            .collect();

        if remaining_chunks.is_empty() {
            continue;
        }

        if remaining_chunks.iter().any(|(task_idx, chunks)| {
            let min_chunk_minutes = tasks[*task_idx].min_chunk_minutes.unwrap_or(1).max(1);
            chunks.iter().any(|chunk| *chunk < min_chunk_minutes)
        }) {
            warnings.push(ScheduleWarning {
                kind: "relaxed_min_chunk".to_string(),
                message: format!(
                    "Section ending at {} could not satisfy every task's minimum chunk size while still respecting max chunk limits.",
                    section.end_time
                ),
            });
        }

        let mut preferred_rest_needed = 0_i64;
        for (task_idx, chunks) in &remaining_chunks {
            let ratio_work = tasks[*task_idx]
                .work_ratio
                .unwrap_or(default_ratio_work)
                .max(1);
            let ratio_break = tasks[*task_idx]
                .rest_ratio
                .unwrap_or(default_ratio_break)
                .max(0);
            preferred_rest_needed += chunks
                .iter()
                .map(|chunk| preferred_break_minutes(*chunk, ratio_work, ratio_break))
                .sum::<i64>();
        }

        let ordered_task_indices =
            build_section_task_order(tasks, &remaining_chunks, section_index, preferences);
        let chunk_queue = build_chunk_queue(
            &remaining_chunks,
            &ordered_task_indices,
            preferences.task_chunk_clustering,
        );
        let mut chunk_cursor = 0_usize;
        let mut total_break_built = 0_i64;
        for window in &section.windows {
            let mut cursor = window.start_time;

            while cursor < window.end_time {
                let gap_minutes = (window.end_time - cursor) / 60_000;
                if gap_minutes <= 0 {
                    break;
                }
                let remaining_chunk_count = remaining_chunks
                    .iter()
                    .map(|(_, chunks)| chunks.len())
                    .sum::<usize>();
                let mut next_cursor = chunk_cursor;
                let next = find_next_planned_candidate(
                    tasks,
                    &remaining_chunks,
                    &chunk_queue,
                    &mut next_cursor,
                );
                let candidate = match next {
                    Some(candidate)
                        if candidate_fits_gap(
                            &candidate,
                            gap_minutes,
                            remaining_chunk_count,
                            tasks,
                            global_min_break_minutes,
                        ) =>
                    {
                        chunk_cursor = next_cursor;
                        candidate
                    }
                    _ if preferences.fill_dead_gaps => {
                        match find_fit_candidate(
                            tasks,
                            &remaining_chunks,
                            gap_minutes,
                            remaining_chunk_count,
                            global_min_break_minutes,
                        ) {
                            Some(candidate) => candidate,
                            None => break,
                        }
                    }
                    _ => break,
                };

                let duration_ms = candidate.duration_minutes * 60 * 1_000;
                generated.push(TemplateInterval {
                    title: candidate.title.clone(),
                    block_type: BlockType::Work,
                    start_time: cursor,
                    end_time: cursor + duration_ms,
                    task_id: Some(candidate.task_id),
                    intensity: intensity_for_priority(candidate.priority),
                    source: BlockSource::Planner,
                    is_protected: tasks[candidate.task_index].protect_generated_blocks,
                    enforcement_profile: Some(
                        tasks[candidate.task_index]
                            .enforcement_profile
                            .clone()
                            .unwrap_or_else(|| "work".to_string()),
                    ),
                });
                consume_candidate_chunk(&mut remaining_chunks, candidate.task_index);
                cursor += duration_ms;

                let has_more_chunks = remaining_chunks
                    .iter()
                    .any(|(_, chunks)| !chunks.is_empty());
                let min_break_minutes = tasks[candidate.task_index]
                    .minimum_rest_minutes
                    .unwrap_or(global_min_break_minutes)
                    .max(global_min_break_minutes);
                let preferred_break = preferred_break_minutes(
                    candidate.duration_minutes,
                    tasks[candidate.task_index]
                        .work_ratio
                        .unwrap_or(default_ratio_work)
                        .max(1),
                    tasks[candidate.task_index]
                        .rest_ratio
                        .unwrap_or(default_ratio_break)
                        .max(0),
                );
                let available_break_minutes = ((window.end_time - cursor) / 60_000).max(0);
                let break_minutes = preferred_break
                    .min(available_break_minutes)
                    .max(min_break_minutes);
                if has_more_chunks && cursor + break_minutes * 60 * 1_000 <= window.end_time {
                    generated.push(TemplateInterval {
                        title: BlockType::Break.default_title().to_string(),
                        block_type: BlockType::Break,
                        start_time: cursor,
                        end_time: cursor + break_minutes * 60 * 1_000,
                        task_id: None,
                        intensity: 1,
                        source: BlockSource::Planner,
                        is_protected: false,
                        enforcement_profile: Some("rest".to_string()),
                    });
                    cursor += break_minutes * 60 * 1_000;
                    total_break_built += break_minutes;
                }
            }

            if cursor < window.end_time {
                generated.push(TemplateInterval {
                    title: BlockType::Break.default_title().to_string(),
                    block_type: BlockType::Break,
                    start_time: cursor,
                    end_time: window.end_time,
                    task_id: None,
                    intensity: 1,
                    source: BlockSource::Planner,
                    is_protected: false,
                    enforcement_profile: Some("rest".to_string()),
                });
                total_break_built += (window.end_time - cursor) / 60_000;
            }
        }

        if remaining_chunks
            .iter()
            .any(|(_, chunks)| !chunks.is_empty())
        {
            warnings.push(ScheduleWarning {
                kind: "packing_overflow".to_string(),
                message: format!(
                    "Section ending at {} could not fit all allocated work once chunks, boundaries, and minimum rest were applied.",
                    section.end_time
                ),
            });
        } else if total_break_built < preferred_rest_needed {
            warnings.push(ScheduleWarning {
                kind: "compressed_ratio_rest".to_string(),
                message: format!(
                    "Section ending at {} compressed ratio-based rest from {} minutes to {} minutes.",
                    section.end_time, preferred_rest_needed, total_break_built
                ),
            });
        }
    }

    Ok(generated)
}

fn build_section_task_order(
    tasks: &[PlannerTask],
    remaining_chunks: &[(usize, Vec<i64>)],
    section_index: usize,
    preferences: &UserPreferences,
) -> Vec<usize> {
    let mut base_order: Vec<usize> = remaining_chunks
        .iter()
        .filter(|(_, chunks)| !chunks.is_empty())
        .map(|(task_idx, _)| *task_idx)
        .collect();

    base_order.sort_by(|left, right| {
        tasks[*right]
            .priority
            .cmp(&tasks[*left].priority)
            .then_with(|| {
                tasks[*right]
                    .required_share
                    .partial_cmp(&tasks[*left].required_share)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| tasks[*left].title.cmp(&tasks[*right].title))
    });

    match preferences.task_group_clustering {
        TaskGroupClusteringMode::Priority => base_order,
        TaskGroupClusteringMode::GroupSameGroupTasks => {
            group_same_group_tasks(tasks, remaining_chunks, section_index, &base_order)
        }
        TaskGroupClusteringMode::SeparateSameGroupTasks => separate_same_group_tasks(
            tasks,
            &base_order,
            preferences.clustering_allows_priority_inversions,
        ),
    }
}

fn group_same_group_tasks(
    tasks: &[PlannerTask],
    _remaining_chunks: &[(usize, Vec<i64>)],
    section_index: usize,
    base_order: &[usize],
) -> Vec<usize> {
    #[derive(Clone)]
    struct TaskCluster {
        task_indices: Vec<usize>,
        weighted_priority: f64,
        first_position: usize,
    }

    let mut clusters: Vec<TaskCluster> = Vec::new();
    for (position, &task_idx) in base_order.iter().enumerate() {
        let Some(group_id) = tasks[task_idx].group_id else {
            let allocated_minutes = tasks[task_idx]
                .section_allocations
                .get(section_index)
                .copied()
                .unwrap_or(0)
                .max(1);
            clusters.push(TaskCluster {
                task_indices: vec![task_idx],
                weighted_priority: tasks[task_idx].priority as f64 * allocated_minutes as f64,
                first_position: position,
            });
            continue;
        };

        let allocated_minutes = tasks[task_idx]
            .section_allocations
            .get(section_index)
            .copied()
            .unwrap_or(0)
            .max(1);
        if let Some(cluster) = clusters.iter_mut().find(|cluster| {
            cluster
                .task_indices
                .first()
                .and_then(|first| tasks[*first].group_id)
                == Some(group_id)
        }) {
            cluster.task_indices.push(task_idx);
            cluster.weighted_priority += tasks[task_idx].priority as f64 * allocated_minutes as f64;
        } else {
            clusters.push(TaskCluster {
                task_indices: vec![task_idx],
                weighted_priority: tasks[task_idx].priority as f64 * allocated_minutes as f64,
                first_position: position,
            });
        }
    }

    clusters.sort_by(|left, right| {
        let left_duration = left
            .task_indices
            .iter()
            .map(|task_idx| {
                tasks[*task_idx]
                    .section_allocations
                    .get(section_index)
                    .copied()
                    .unwrap_or(0)
                    .max(1)
            })
            .sum::<i64>() as f64;
        let right_duration = right
            .task_indices
            .iter()
            .map(|task_idx| {
                tasks[*task_idx]
                    .section_allocations
                    .get(section_index)
                    .copied()
                    .unwrap_or(0)
                    .max(1)
            })
            .sum::<i64>() as f64;
        (right.weighted_priority / right_duration)
            .partial_cmp(&(left.weighted_priority / left_duration))
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.first_position.cmp(&right.first_position))
    });

    clusters
        .into_iter()
        .flat_map(|cluster| cluster.task_indices)
        .collect()
}

fn separate_same_group_tasks(
    tasks: &[PlannerTask],
    base_order: &[usize],
    allow_priority_inversions: bool,
) -> Vec<usize> {
    let mut remaining = base_order.to_vec();
    let mut ordered = Vec::with_capacity(base_order.len());

    while !remaining.is_empty() {
        let next = remaining.remove(0);
        let Some(previous) = ordered.last().copied() else {
            ordered.push(next);
            continue;
        };

        if !shares_group(tasks, previous, next) {
            ordered.push(next);
            continue;
        }

        let replacement = remaining.iter().position(|candidate| {
            !shares_group(tasks, previous, *candidate)
                && (allow_priority_inversions || tasks[*candidate].priority == tasks[next].priority)
        });

        if let Some(replacement) = replacement {
            let selected = remaining.remove(replacement);
            ordered.push(selected);
            remaining.insert(0, next);
        } else {
            ordered.push(next);
        }
    }

    ordered
}

fn shares_group(tasks: &[PlannerTask], left: usize, right: usize) -> bool {
    tasks[left].group_id.is_some() && tasks[left].group_id == tasks[right].group_id
}

fn build_chunk_queue(
    remaining_chunks: &[(usize, Vec<i64>)],
    ordered_task_indices: &[usize],
    chunk_mode: TaskChunkClusteringMode,
) -> Vec<usize> {
    match chunk_mode {
        TaskChunkClusteringMode::GroupSameTaskChunks => ordered_task_indices
            .iter()
            .flat_map(|task_idx| {
                let count = remaining_chunks
                    .iter()
                    .find(|(idx, _)| idx == task_idx)
                    .map(|(_, chunks)| chunks.len())
                    .unwrap_or(0);
                std::iter::repeat_n(*task_idx, count)
            })
            .collect(),
        TaskChunkClusteringMode::SeparateSameTaskChunks => {
            let chunk_counts = ordered_task_indices
                .iter()
                .map(|task_idx| {
                    remaining_chunks
                        .iter()
                        .find(|(idx, _)| idx == task_idx)
                        .map(|(_, chunks)| chunks.len())
                        .unwrap_or(0)
                })
                .collect::<Vec<_>>();
            let max_rounds = chunk_counts.iter().copied().max().unwrap_or(0);
            let mut queue = Vec::new();
            for round in 0..max_rounds {
                for (position, task_idx) in ordered_task_indices.iter().enumerate() {
                    if chunk_counts[position] > round {
                        queue.push(*task_idx);
                    }
                }
            }
            queue
        }
    }
}

fn find_next_planned_candidate(
    tasks: &[PlannerTask],
    remaining_chunks: &[(usize, Vec<i64>)],
    chunk_queue: &[usize],
    chunk_cursor: &mut usize,
) -> Option<ChunkCandidate> {
    while *chunk_cursor < chunk_queue.len() {
        let task_idx = chunk_queue[*chunk_cursor];
        *chunk_cursor += 1;
        if let Some(duration_minutes) = next_chunk_duration(remaining_chunks, task_idx) {
            return Some(ChunkCandidate {
                task_index: task_idx,
                task_id: tasks[task_idx].task_id,
                title: tasks[task_idx].title.clone(),
                priority: tasks[task_idx].priority,
                duration_minutes,
            });
        }
    }

    None
}

fn next_chunk_duration(remaining_chunks: &[(usize, Vec<i64>)], task_index: usize) -> Option<i64> {
    remaining_chunks
        .iter()
        .find(|(idx, chunks)| *idx == task_index && !chunks.is_empty())
        .and_then(|(_, chunks)| chunks.first().copied())
}

fn find_fit_candidate(
    tasks: &[PlannerTask],
    remaining_chunks: &[(usize, Vec<i64>)],
    gap_minutes: i64,
    remaining_chunk_count: usize,
    global_min_break_minutes: i64,
) -> Option<ChunkCandidate> {
    let mut candidates = Vec::new();
    for (task_idx, chunks) in remaining_chunks {
        if let Some(&duration_minutes) = chunks.first() {
            let candidate = ChunkCandidate {
                task_index: *task_idx,
                task_id: tasks[*task_idx].task_id,
                title: tasks[*task_idx].title.clone(),
                priority: tasks[*task_idx].priority,
                duration_minutes,
            };
            if candidate_fits_gap(
                &candidate,
                gap_minutes,
                remaining_chunk_count,
                tasks,
                global_min_break_minutes,
            ) {
                candidates.push(candidate);
            }
        }
    }

    candidates.sort_by(|left, right| {
        right
            .priority
            .cmp(&left.priority)
            .then_with(|| right.duration_minutes.cmp(&left.duration_minutes))
            .then_with(|| left.title.cmp(&right.title))
    });

    candidates.into_iter().next()
}

fn candidate_fits_gap(
    candidate: &ChunkCandidate,
    gap_minutes: i64,
    remaining_chunk_count: usize,
    tasks: &[PlannerTask],
    global_min_break_minutes: i64,
) -> bool {
    let required_rest = if remaining_chunk_count > 1 {
        tasks[candidate.task_index]
            .minimum_rest_minutes
            .unwrap_or(global_min_break_minutes)
            .max(global_min_break_minutes)
    } else {
        0
    };
    candidate.duration_minutes + required_rest <= gap_minutes
}

fn consume_candidate_chunk(remaining_chunks: &mut [(usize, Vec<i64>)], task_index: usize) {
    if let Some((_, chunks)) = remaining_chunks
        .iter_mut()
        .find(|(idx, chunks)| *idx == task_index && !chunks.is_empty())
    {
        chunks.remove(0);
    }
}

fn clear_generated_future_blocks(connection: &Connection, from: i64) -> Result<(), String> {
    let clear_from = timestamp_for_minute(date_from_timestamp(from)?, 0)?;
    connection
        .execute(
            r#"
            DELETE FROM time_blocks
            WHERE end_time > ?1
              AND status IN ('scheduled', 'active', 'paused')
              AND source IN ('template', 'planner')
            "#,
            params![clear_from],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn normalize_generated_blocks(blocks: &mut Vec<TemplateInterval>) {
    blocks.sort_by_key(|block| (block.start_time, block.end_time));
    let mut normalized: Vec<TemplateInterval> = Vec::with_capacity(blocks.len());
    for block in blocks.drain(..) {
        if let Some(previous) = normalized.last_mut() {
            if should_merge_generated_intervals(previous, &block) {
                previous.end_time = previous.end_time.max(block.end_time);
                continue;
            }
        }
        normalized.push(block);
    }
    *blocks = normalized;
}

fn should_merge_generated_intervals(left: &TemplateInterval, right: &TemplateInterval) -> bool {
    left.block_type == BlockType::Break
        && right.block_type == BlockType::Break
        && left.end_time >= right.start_time
        && left.source == right.source
        && left.task_id.is_none()
        && right.task_id.is_none()
        && left.enforcement_profile == right.enforcement_profile
}

fn persist_generated_blocks(
    connection: &Connection,
    blocks: &[TemplateInterval],
) -> Result<(), String> {
    for block in blocks {
        add_time_block(
            connection,
            NewTimeBlock {
                title: block.title.clone(),
                block_type: block.block_type,
                start_time: block.start_time,
                end_time: block.end_time,
                task_id: block.task_id,
                intensity: block.intensity,
                source: Some(block.source),
                is_protected: Some(block.is_protected),
                enforcement_profile: block.enforcement_profile.clone(),
            },
        )?;
    }
    Ok(())
}

fn invert_intervals_to_windows(
    intervals: &[TemplateInterval],
    from: i64,
    to: i64,
) -> Vec<TimeWindow> {
    let mut windows = Vec::new();
    let mut cursor = from;

    for interval in intervals {
        if cursor < interval.start_time {
            windows.push(TimeWindow {
                start_time: cursor,
                end_time: interval.start_time,
            });
        }
        cursor = max(cursor, interval.end_time);
    }

    if cursor < to {
        windows.push(TimeWindow {
            start_time: cursor,
            end_time: to,
        });
    }

    windows
}

fn split_into_preferred_chunks(
    total_minutes: i64,
    max_chunk_minutes: i64,
    min_chunk_minutes: i64,
) -> Vec<i64> {
    if total_minutes <= 0 {
        return vec![];
    }
    let chunk_count = ((total_minutes as f64) / max_chunk_minutes as f64).ceil() as i64;
    let base = total_minutes / chunk_count;
    let remainder = total_minutes % chunk_count;
    let chunks = (0..chunk_count)
        .map(|idx| base + if idx < remainder { 1 } else { 0 })
        .collect::<Vec<_>>();

    if chunks.iter().all(|chunk| *chunk >= min_chunk_minutes) {
        chunks
    } else {
        chunks
    }
}

fn preferred_break_minutes(chunk_minutes: i64, ratio_work: i64, ratio_break: i64) -> i64 {
    if ratio_break == 0 {
        return 0;
    }
    ((chunk_minutes as f64) * (ratio_break as f64 / ratio_work as f64)).ceil() as i64
}

fn resolve_work_minutes(preferences: &UserPreferences, template: &WeeklyTemplate) -> u32 {
    if preferences.work_duration_minutes == 0 {
        u32::from(template.default_work_minutes.max(1))
    } else {
        preferences.work_duration_minutes
    }
}

fn resolve_break_minutes(preferences: &UserPreferences, template: &WeeklyTemplate) -> u32 {
    if preferences.break_duration_minutes == 0 {
        u32::from(template.default_break_minutes)
    } else {
        preferences.break_duration_minutes
    }
}

fn ideal_work_capacity_minutes(
    window_minutes: i64,
    preferences: &UserPreferences,
    template: &WeeklyTemplate,
) -> i64 {
    let work = i64::from(resolve_work_minutes(preferences, template));
    let break_minutes = i64::from(resolve_break_minutes(preferences, template));
    if break_minutes == 0 {
        window_minutes
    } else {
        ((window_minutes as f64) * (work as f64 / (work + break_minutes) as f64)).floor() as i64
    }
}

fn intensity_for_priority(priority: i64) -> u8 {
    priority.clamp(1, 5) as u8
}

fn intervals_overlap(start_a: i64, end_a: i64, start_b: i64, end_b: i64) -> bool {
    start_a < end_b && start_b < end_a
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

    Local
        .with_ymd_and_hms(
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

fn minute_of_local_day(timestamp: i64) -> Result<i64, String> {
    let datetime = Local
        .timestamp_millis_opt(timestamp)
        .single()
        .ok_or_else(|| "invalid timestamp".to_string())?;
    Ok(i64::from(datetime.hour()) * 60 + i64::from(datetime.minute()))
}

fn end_of_day(date: NaiveDate) -> Result<i64, String> {
    let next_day = date
        .checked_add_days(Days::new(1))
        .ok_or_else(|| "date overflow".to_string())?;
    timestamp_for_minute(next_day, 0)
}

fn date_from_timestamp(timestamp: i64) -> Result<NaiveDate, String> {
    chrono::DateTime::from_timestamp_millis(timestamp)
        .map(|datetime| datetime.with_timezone(&Local).date_naive())
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

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_millis() as i64
}

fn timestamp_ms() -> i64 {
    now_ms()
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
        is_protected: row.get(9)?,
        enforcement_profile: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
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
        BlockSource::Planner => "planner",
        BlockSource::Emergency => "emergency",
    }
}

fn block_source_from_str(value: &str) -> Result<BlockSource, String> {
    match value {
        "manual" => Ok(BlockSource::Manual),
        "template" => Ok(BlockSource::Template),
        "planner" => Ok(BlockSource::Planner),
        "emergency" => Ok(BlockSource::Emergency),
        _ => Err(format!("unknown block source: {value}")),
    }
}

#[cfg(test)]
mod tests {
    use chrono::{NaiveDate, TimeZone, Utc};
    use rusqlite::{params, Connection};

    use super::{
        add_time_block, apply_weekly_template, complete_current_block, continue_current_block,
        effective_enforcement_block_type, extend_current_block, get_block_by_id, get_current_block,
        get_schedule_range, pause_current_block, rebuild_schedule, resume_current_block,
        save_weekly_template, start_emergency_block, sync_overdue_work_block, timestamp_for_minute,
        ScheduleState,
    };
    use crate::{
        config::models::UserPreferences,
        db::migrations::run_migrations,
        schedule::models::{
            BlockSource, BlockStatus, BlockType, EmergencyBlockRequest, FixedTemplateBlock,
            NewTimeBlock, TimeBlock, Weekday, WeeklyTemplate,
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

    fn preferences() -> UserPreferences {
        UserPreferences::default()
    }

    #[test]
    fn rebuild_inserts_rest_between_adjacent_work_chunks() {
        let (connection, _) = setup();
        let preferences = UserPreferences {
            work_duration_minutes: 60,
            break_duration_minutes: 20,
            minimum_rest_minutes: 10,
            ..UserPreferences::default()
        };
        let date = NaiveDate::from_ymd_opt(2026, 5, 13).expect("date should exist");
        let from = timestamp_for_minute(date, 16 * 60).expect("from should be valid");
        let deadline = timestamp_for_minute(date, 19 * 60).expect("deadline should be valid");
        connection
            .execute(
                r#"
                INSERT INTO tasks (
                    name, priority, estimated_minutes, deadline, max_chunk_minutes,
                    minimum_rest_minutes, created_at, updated_at
                )
                VALUES ('Lit Essay', 3, 120, ?1, 60, 10, ?2, ?2)
                "#,
                params![deadline, from],
            )
            .expect("task should insert");

        rebuild_schedule(&connection, from, &preferences).expect("schedule should rebuild");

        let blocks =
            get_schedule_range(&connection, from, deadline).expect("schedule range should load");
        let work_blocks = blocks
            .iter()
            .filter(|block| block.block_type == BlockType::Work)
            .collect::<Vec<_>>();
        assert_eq!(work_blocks.len(), 2);

        let between = blocks
            .iter()
            .find(|block| {
                block.block_type == BlockType::Break
                    && block.start_time >= work_blocks[0].end_time
                    && block.end_time <= work_blocks[1].start_time
            })
            .expect("break should exist between first two work chunks");
        assert!(between.duration_secs() / 60 >= 10);
    }

    #[test]
    fn completes_current_block_by_donating_time_to_rest() {
        let (connection, schedule) = setup();
        let now = now_ms();
        let preferences = preferences();

        let current = add_time_block(
            &connection,
            NewTimeBlock {
                title: "Current".to_string(),
                block_type: BlockType::Work,
                start_time: now - 10 * 60 * 1_000,
                end_time: now + 10 * 60 * 1_000,
                task_id: None,
                intensity: 4,
                source: None,
                is_protected: None,
                enforcement_profile: None,
            },
        )
        .expect("current block should create");

        let next = add_time_block(
            &connection,
            NewTimeBlock {
                title: "Break".to_string(),
                block_type: BlockType::Break,
                start_time: current.end_time,
                end_time: current.end_time + 30 * 60 * 1_000,
                task_id: None,
                intensity: 2,
                source: Some(BlockSource::Planner),
                is_protected: None,
                enforcement_profile: None,
            },
        )
        .expect("next block should create");

        let after_break = add_time_block(
            &connection,
            NewTimeBlock {
                title: "Follow-up".to_string(),
                block_type: BlockType::Work,
                start_time: next.end_time,
                end_time: next.end_time + 30 * 60 * 1_000,
                task_id: None,
                intensity: 4,
                source: Some(BlockSource::Planner),
                is_protected: None,
                enforcement_profile: None,
            },
        )
        .expect("follow-up block should create");

        let result = complete_current_block(&connection, &schedule, &preferences)
            .expect("completion should work");
        let updated_blocks = load_blocks(&connection);
        let updated_break = updated_blocks
            .iter()
            .find(|block| block.id == next.id)
            .expect("break should still exist");
        let updated_follow_up = updated_blocks
            .iter()
            .find(|block| block.id == after_break.id)
            .expect("follow-up should still exist");

        assert!(result.warnings.is_empty());
        assert!(updated_break.start_time < next.start_time);
        assert_eq!(updated_break.end_time, next.end_time);
        assert_eq!(updated_follow_up.start_time, after_break.start_time);
    }

    #[test]
    fn extending_current_block_consumes_following_rest_before_replanning() {
        let (connection, schedule) = setup();
        let now = now_ms();
        let preferences = preferences();

        let current = add_time_block(
            &connection,
            NewTimeBlock {
                title: "Current".to_string(),
                block_type: BlockType::Work,
                start_time: now - 5 * 60 * 1_000,
                end_time: now + 5 * 60 * 1_000,
                task_id: None,
                intensity: 4,
                source: Some(BlockSource::Planner),
                is_protected: None,
                enforcement_profile: None,
            },
        )
        .expect("current block should create");

        let break_block = add_time_block(
            &connection,
            NewTimeBlock {
                title: "Break".to_string(),
                block_type: BlockType::Break,
                start_time: current.end_time,
                end_time: current.end_time + 30 * 60 * 1_000,
                task_id: None,
                intensity: 1,
                source: Some(BlockSource::Planner),
                is_protected: None,
                enforcement_profile: None,
            },
        )
        .expect("break block should create");

        let next_work = add_time_block(
            &connection,
            NewTimeBlock {
                title: "Next".to_string(),
                block_type: BlockType::Work,
                start_time: break_block.end_time,
                end_time: break_block.end_time + 30 * 60 * 1_000,
                task_id: None,
                intensity: 4,
                source: Some(BlockSource::Planner),
                is_protected: None,
                enforcement_profile: None,
            },
        )
        .expect("next work should create");

        let result = extend_current_block(&connection, &schedule, &preferences, 10)
            .expect("extension should work");
        let updated_blocks = load_blocks(&connection);
        let updated_break = updated_blocks
            .iter()
            .find(|block| block.id == break_block.id)
            .expect("break should still exist");
        let updated_next = updated_blocks
            .iter()
            .find(|block| block.id == next_work.id)
            .expect("next work should still exist");

        assert!(result.warnings.is_empty());
        assert_eq!(updated_break.end_time, break_block.end_time);
        assert!(updated_break.duration_secs() / 60 < 30);
        assert!(updated_break.duration_secs() / 60 >= i64::from(preferences.minimum_rest_minutes));
        assert_eq!(updated_next.start_time, next_work.start_time);
    }

    #[test]
    fn pause_and_resume_extend_current_block() {
        let (connection, schedule) = setup();
        let now = now_ms();
        let preferences = preferences();

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
                is_protected: None,
                enforcement_profile: None,
            },
        )
        .expect("current block should create");

        let next_break = add_time_block(
            &connection,
            NewTimeBlock {
                title: "Break".to_string(),
                block_type: BlockType::Break,
                start_time: original.end_time,
                end_time: original.end_time + 30 * 60 * 1_000,
                task_id: None,
                intensity: 1,
                source: Some(BlockSource::Planner),
                is_protected: None,
                enforcement_profile: None,
            },
        )
        .expect("break should create");

        pause_current_block(&connection, &schedule, &preferences).expect("pause should work");
        std::thread::sleep(std::time::Duration::from_millis(5));
        let resumed = resume_current_block(&connection, &schedule, &preferences)
            .expect("resume should work")
            .current_block
            .expect("resumed block should load");
        let updated_break = load_blocks(&connection)
            .into_iter()
            .find(|block| block.id == next_break.id)
            .expect("break should still exist");

        assert!(resumed.end_time >= original.end_time);
        assert!(updated_break.duration_secs() / 60 <= 30);
    }

    #[test]
    fn overdue_work_block_can_be_explicitly_continued() {
        let (connection, schedule) = setup();
        let now = now_ms();
        let preferences = preferences();

        let work = add_time_block(
            &connection,
            NewTimeBlock {
                title: "Current".to_string(),
                block_type: BlockType::Work,
                start_time: now - 20 * 60 * 1_000,
                end_time: now + 5 * 60 * 1_000,
                task_id: None,
                intensity: 4,
                source: Some(BlockSource::Planner),
                is_protected: None,
                enforcement_profile: None,
            },
        )
        .expect("work block should create");
        connection
            .execute(
                "UPDATE time_blocks SET end_time = ?1, status = 'active' WHERE id = ?2",
                params![now - 60 * 1_000, work.id],
            )
            .expect("work block should become overdue active");

        add_time_block(
            &connection,
            NewTimeBlock {
                title: "Break".to_string(),
                block_type: BlockType::Break,
                start_time: work.end_time,
                end_time: work.end_time + 30 * 60 * 1_000,
                task_id: None,
                intensity: 1,
                source: Some(BlockSource::Planner),
                is_protected: None,
                enforcement_profile: None,
            },
        )
        .expect("break block should create");

        let continued = continue_current_block(&connection, &schedule, &preferences)
            .expect("continue should work")
            .current_block
            .expect("continued block should load");

        assert!(continued.end_time >= now);
    }

    #[test]
    fn overdue_work_block_yields_to_next_work_block_without_user_input() {
        let (connection, schedule) = setup();
        let now = now_ms();
        let preferences = preferences();

        let current = add_time_block(
            &connection,
            NewTimeBlock {
                title: "Current".to_string(),
                block_type: BlockType::Work,
                start_time: now - 30 * 60 * 1_000,
                end_time: now + 5 * 60 * 1_000,
                task_id: None,
                intensity: 4,
                source: Some(BlockSource::Planner),
                is_protected: None,
                enforcement_profile: None,
            },
        )
        .expect("current block should create");
        connection
            .execute(
                "UPDATE time_blocks SET end_time = ?1, status = 'active' WHERE id = ?2",
                params![now - 20 * 60 * 1_000, current.id],
            )
            .expect("current block should become overdue active");

        add_time_block(
            &connection,
            NewTimeBlock {
                title: "Break".to_string(),
                block_type: BlockType::Break,
                start_time: current.end_time,
                end_time: current.end_time + 15 * 60 * 1_000,
                task_id: None,
                intensity: 1,
                source: Some(BlockSource::Planner),
                is_protected: None,
                enforcement_profile: None,
            },
        )
        .expect("break should create");

        let next_work = add_time_block(
            &connection,
            NewTimeBlock {
                title: "Next".to_string(),
                block_type: BlockType::Work,
                start_time: now - 5 * 60 * 1_000,
                end_time: now + 20 * 60 * 1_000,
                task_id: None,
                intensity: 4,
                source: Some(BlockSource::Planner),
                is_protected: None,
                enforcement_profile: None,
            },
        )
        .expect("next work should create");

        let warnings =
            sync_overdue_work_block(&connection, &schedule, &preferences, now, current.id, false)
                .expect("sync should work");
        let active = get_current_block(&connection, &schedule)
            .expect("current block should load")
            .expect("there should be a current block");
        let finished = get_block_by_id(&connection, current.id)
            .expect("finished block should load")
            .expect("finished block should exist");

        assert!(warnings.is_empty());
        assert_eq!(active.id, next_work.id);
        assert_eq!(finished.status, BlockStatus::Completed);
    }

    #[test]
    fn passive_overdue_work_uses_break_enforcement_until_continued() {
        let (connection, schedule) = setup();
        let now = now_ms();
        let preferences = preferences();

        let block = add_time_block(
            &connection,
            NewTimeBlock {
                title: "Current".to_string(),
                block_type: BlockType::Work,
                start_time: now - 20 * 60 * 1_000,
                end_time: now + 5 * 60 * 1_000,
                task_id: None,
                intensity: 4,
                source: Some(BlockSource::Planner),
                is_protected: None,
                enforcement_profile: None,
            },
        )
        .expect("block should create");
        connection
            .execute(
                "UPDATE time_blocks SET end_time = ?1, status = 'active' WHERE id = ?2",
                params![now - 60 * 1_000, block.id],
            )
            .expect("block should become overdue active");
        add_time_block(
            &connection,
            NewTimeBlock {
                title: "Break".to_string(),
                block_type: BlockType::Break,
                start_time: now - 60 * 1_000,
                end_time: now + 20 * 60 * 1_000,
                task_id: None,
                intensity: 1,
                source: Some(BlockSource::Planner),
                is_protected: None,
                enforcement_profile: None,
            },
        )
        .expect("break should exist");

        assert_eq!(
            effective_enforcement_block_type(&connection, &schedule)
                .expect("effective type should load"),
            Some(BlockType::Break)
        );

        continue_current_block(&connection, &schedule, &preferences).expect("continue should work");

        let continue_events: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM analytics_events WHERE event_type = 'schedule.continue'",
                [],
                |row| row.get(0),
            )
            .expect("continue analytics should query");

        assert_eq!(
            effective_enforcement_block_type(&connection, &schedule)
                .expect("effective type should load"),
            Some(BlockType::Work)
        );
        assert_eq!(continue_events, 1);
    }

    #[test]
    fn emergency_blocks_are_capped_and_marked_explicitly() {
        let (connection, schedule) = setup();
        let now = now_ms();
        let preferences = preferences();

        add_time_block(
            &connection,
            NewTimeBlock {
                title: "Current".to_string(),
                block_type: BlockType::Work,
                start_time: now - 5 * 60 * 1_000,
                end_time: now + 20 * 60 * 1_000,
                task_id: None,
                intensity: 4,
                source: Some(BlockSource::Planner),
                is_protected: None,
                enforcement_profile: None,
            },
        )
        .expect("current block should create");

        let emergency = start_emergency_block(
            &connection,
            &schedule,
            &preferences,
            EmergencyBlockRequest {
                title: Some("Urgent call".to_string()),
                duration_minutes: 999,
                reason: None,
            },
        )
        .expect("emergency block should start")
        .current_block
        .expect("emergency block should exist");

        assert_eq!(emergency.source, BlockSource::Emergency);
        assert_eq!(
            (emergency.end_time - emergency.start_time) / 60_000,
            i64::from(preferences.emergency_block_max_minutes)
        );
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
