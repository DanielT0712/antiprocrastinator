pub const CURRENT_SCHEMA_VERSION: i32 = 8;

pub const INITIAL_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS task_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    group_id INTEGER,
    priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    estimated_minutes INTEGER,
    deadline INTEGER,
    max_chunk_minutes INTEGER,
    min_chunk_minutes INTEGER,
    minimum_rest_minutes INTEGER,
    work_ratio INTEGER,
    rest_ratio INTEGER,
    protect_generated_blocks INTEGER NOT NULL DEFAULT 0,
    enforcement_profile TEXT,
    average_priority REAL NOT NULL DEFAULT 3.0,
    average_actual_minutes REAL,
    completion_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS time_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    block_type TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    task_id INTEGER,
    status TEXT NOT NULL DEFAULT 'scheduled',
    intensity INTEGER NOT NULL DEFAULT 3 CHECK (intensity BETWEEN 1 AND 5),
    source TEXT NOT NULL DEFAULT 'manual',
    is_protected INTEGER NOT NULL DEFAULT 0,
    enforcement_profile TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS weekly_templates (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    template_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS process_rules (
    process_name TEXT PRIMARY KEY,
    category TEXT,
    action TEXT NOT NULL,
    warn_seconds INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

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
    classification_action TEXT NOT NULL DEFAULT 'unclassified',
    confidence REAL NOT NULL DEFAULT 0.0,
    classification_status TEXT NOT NULL DEFAULT 'unclassified',
    first_seen_at INTEGER NOT NULL,
    last_seen_running_at INTEGER,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    task_id INTEGER,
    block_id INTEGER,
    process_name TEXT,
    payload_json TEXT,
    occurred_at INTEGER NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    FOREIGN KEY (block_id) REFERENCES time_blocks(id) ON DELETE SET NULL
);

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

CREATE TABLE IF NOT EXISTS browser_title_observations (
    observation_key TEXT PRIMARY KEY,
    cleaned_title TEXT NOT NULL,
    raw_title TEXT,
    first_seen_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
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

CREATE TABLE IF NOT EXISTS blocked_processes_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    process_name TEXT NOT NULL,
    rule_action TEXT NOT NULL,
    block_id INTEGER,
    task_id INTEGER,
    occurred_at INTEGER NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    FOREIGN KEY (block_id) REFERENCES time_blocks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_group_id ON tasks(group_id);
CREATE INDEX IF NOT EXISTS idx_tasks_name ON tasks(name);
CREATE INDEX IF NOT EXISTS idx_time_blocks_start_time ON time_blocks(start_time);
CREATE INDEX IF NOT EXISTS idx_time_blocks_status ON time_blocks(status);
CREATE INDEX IF NOT EXISTS idx_known_apps_status ON known_apps(classification_status);
CREATE INDEX IF NOT EXISTS idx_known_apps_updated_at ON known_apps(updated_at);
CREATE INDEX IF NOT EXISTS idx_known_apps_classification_action ON known_apps(classification_action);
CREATE INDEX IF NOT EXISTS idx_app_category_memberships_category_name ON app_category_memberships(category_name);
CREATE INDEX IF NOT EXISTS idx_known_browser_targets_classification_action ON known_browser_targets(classification_action);
CREATE INDEX IF NOT EXISTS idx_browser_title_observations_last_seen_at ON browser_title_observations(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_occurred_at ON analytics_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_blocked_processes_occurred_at ON blocked_processes_log(occurred_at);
CREATE INDEX IF NOT EXISTS idx_enforcement_history_occurred_at ON enforcement_history(occurred_at);
CREATE INDEX IF NOT EXISTS idx_schedule_mutation_history_occurred_at ON schedule_mutation_history(occurred_at);
"#;
