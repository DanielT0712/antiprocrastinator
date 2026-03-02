# AntiProcrastinator - Architecture & Implementation Plan

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Backend | Rust (Tauri v2) | App framework, process management, schedule engine, database |
| Frontend | React + TypeScript | UI components, user interaction |
| Styling | Tailwind CSS v4 | Utility-first CSS with theme variables |
| State | Zustand | Frontend global state management |
| Database | SQLite (rusqlite) | Structured data storage (tasks, schedule, analytics) |
| Config | JSON files | User preferences, process category definitions |
| Process monitoring | sysinfo crate | Cross-platform process listing and killing |

---

## Project Structure

```
antiprocrastinator/
├── CLAUDE.md                         # Dev workflow guidelines
├── DESIGN.md                         # Feature specifications
├── ARCHITECTURE.md                   # This file
├── FUTURE_FEATURES.md                # Planned future enhancements
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── .gitignore
│
├── src/                              # Frontend (React + TypeScript)
│   ├── main.tsx                      # React entry point
│   ├── App.tsx                       # Root component, routing
│   ├── vite-env.d.ts
│   ├── styles/
│   │   └── global.css                # Tailwind import, CSS variables, dark theme
│   ├── api/                          # Typed wrappers around Tauri invoke()
│   │   ├── schedule.ts
│   │   ├── tasks.ts
│   │   ├── processes.ts
│   │   ├── analytics.ts
│   │   └── settings.ts
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx           # Icon-based navigation sidebar
│   │   │   └── AppShell.tsx          # Layout wrapper (sidebar + content)
│   │   ├── focus/
│   │   │   ├── FocusView.tsx         # Main focus screen
│   │   │   ├── CountdownTimer.tsx    # Digital countdown + progress bar
│   │   │   ├── TaskCard.tsx          # Current/next task display
│   │   │   └── QuickActions.tsx      # Pause, Done, Skip, Extend buttons
│   │   ├── schedule/
│   │   │   ├── ScheduleView.tsx      # Schedule list grouped by day
│   │   │   ├── TimeBlockItem.tsx     # Individual block row
│   │   │   ├── AddBlockModal.tsx     # Add/edit block modal
│   │   │   └── WeeklyTemplateEditor.tsx
│   │   ├── tasks/
│   │   │   ├── TaskManager.tsx       # Task library management
│   │   │   ├── TaskForm.tsx          # Add/edit task form
│   │   │   ├── TaskAutocomplete.tsx  # Autocomplete dropdown
│   │   │   └── TaskGroupList.tsx     # Grouped task list
│   │   ├── processes/
│   │   │   ├── ProcessMonitor.tsx    # Running processes + rules
│   │   │   ├── ProcessRuleEditor.tsx # Per-process rule config
│   │   │   └── CategoryManager.tsx   # Category management
│   │   ├── analytics/
│   │   │   ├── AnalyticsView.tsx     # Dashboard with charts
│   │   │   ├── FocusChart.tsx        # Focus time bar chart
│   │   │   └── DailySummary.tsx      # Daily metrics card
│   │   └── common/
│   │       ├── Modal.tsx
│   │       ├── Button.tsx
│   │       ├── ProgressBar.tsx
│   │       └── ConfirmDialog.tsx     # Multi-step quit confirmation
│   ├── hooks/
│   │   ├── useSchedule.ts           # Schedule state + Tauri event listeners
│   │   ├── useTimer.ts              # Timer tick subscription
│   │   ├── useProcesses.ts          # Process monitoring state
│   │   └── useAnalytics.ts          # Analytics data fetching
│   ├── stores/
│   │   └── appStore.ts              # Zustand store (currentBlock, timer, theme)
│   └── types/
│       ├── schedule.ts              # TimeBlock, WeeklyTemplate, BlockType, etc.
│       ├── task.ts                   # Task, TaskGroup, TaskStats
│       ├── process.ts               # ProcessRule, ProcessCategory, ProcessInfo
│       └── analytics.ts             # DailySummary, FocusStats, etc.
│
├── src-tauri/                        # Backend (Rust)
│   ├── Cargo.toml
│   ├── tauri.conf.json               # Tauri config (window, bundle, dev server)
│   ├── build.rs
│   ├── capabilities/
│   │   └── default.json              # Permission capabilities
│   ├── icons/                        # App icons
│   └── src/
│       ├── main.rs                   # Desktop entry point
│       ├── lib.rs                    # App setup, plugin/command registration, state init
│       ├── db/
│       │   ├── mod.rs                # Connection init, Mutex<Connection> state, DbAccess trait
│       │   ├── schema.rs             # All CREATE TABLE statements
│       │   └── migrations.rs         # PRAGMA user_version based migration runner
│       ├── schedule/
│       │   ├── mod.rs
│       │   ├── engine.rs             # Schedule generation, block advancement, timer loop
│       │   ├── models.rs             # TimeBlock, WeeklyTemplate, FixedBlock, enums
│       │   └── commands.rs           # #[tauri::command] functions
│       ├── tasks/
│       │   ├── mod.rs
│       │   ├── models.rs             # Task, TaskGroup, TaskStats, NewTask, TaskUpdate
│       │   ├── repository.rs         # SQLite CRUD, search, stat computation
│       │   └── commands.rs           # #[tauri::command] functions
│       ├── processes/
│       │   ├── mod.rs
│       │   ├── monitor.rs            # sysinfo::System scanner (5s loop)
│       │   ├── enforcer.rs           # Warn -> countdown -> kill state machine
│       │   ├── categories.rs         # Built-in categories, JSON loading
│       │   ├── models.rs             # ProcessRule, ProcessCategory, ProcessInfo
│       │   └── commands.rs           # #[tauri::command] functions
│       ├── analytics/
│       │   ├── mod.rs
│       │   ├── tracker.rs            # Event recording to analytics_events table
│       │   ├── aggregator.rs         # SQL aggregation queries for charts
│       │   ├── models.rs             # AnalyticsEvent, DailySummary, FocusStats
│       │   └── commands.rs           # #[tauri::command] functions
│       ├── guard/
│       │   ├── mod.rs
│       │   ├── watchdog.rs           # Close interception, frontend restart, tray management
│       │   └── commands.rs           # Quit challenge/confirm commands
│       └── config/
│           ├── mod.rs
│           ├── models.rs             # UserPreferences struct
│           └── manager.rs            # JSON config file read/write
```

---

## Key Architectural Decisions

### 1. Timer runs in Rust, not JavaScript
The countdown timer is a `tokio::spawn` background loop in Rust that emits `timer-tick` events to the frontend every second via Tauri's event system. This ensures:
- Timer accuracy even if the webview is slow or unresponsive
- Schedule advances automatically even if the frontend window is closed
- Block transitions happen server-side with proper state management

### 2. Direct rusqlite over Tauri SQL plugin
The official `tauri-plugin-sql` exposes raw SQL to the frontend. Instead, we use `rusqlite` directly in Rust and expose a clean command API. This keeps all business logic (rolling schedule generation, stat aggregation, enforcement decisions) in Rust where it belongs.

### 3. SQLite for data, JSON for config
- **SQLite**: Tasks, schedule blocks, analytics events, process rules, blocked process log. These are relational, queried frequently, and benefit from SQL.
- **JSON**: User preferences, process category definitions, weekly templates. These change rarely and benefit from being human-readable.

### 4. Process enforcement independent of UI
The process monitor and enforcer run in a `tokio::spawn` background task on the Rust side. They operate even when the frontend window is minimized, closed, or in the system tray. Only the Rust process needs to be running.

### 5. Frontend state with Zustand
Zustand provides a single store with no boilerplate. The store holds cross-component state like the current block, timer values, and theme. Components subscribe to specific slices to avoid unnecessary rerenders.

### 6. Tailwind CSS v4 with CSS variables
CSS custom properties define the theme colors. Tailwind utilities handle layout and spacing. A `data-theme` attribute on `<html>` enables future theme switching without changing component code.

---

## Tauri Command API

All frontend-backend communication uses `invoke()` from `@tauri-apps/api/core`. Commands are Rust functions annotated with `#[tauri::command]`, registered in `lib.rs`. Arguments are camelCase objects; returns are JSON-serialized Rust structs.

### Schedule Commands
| Command | Description |
|---------|-------------|
| `get_current_block` | Get the currently active time block |
| `get_next_block` | Get the next upcoming block |
| `get_schedule_range(from, to)` | Get all blocks in a time range |
| `add_time_block(block)` | Insert a new block |
| `update_time_block(id, updates)` | Modify an existing block |
| `delete_time_block(id)` | Remove a block |
| `apply_weekly_template(template)` | Generate blocks from template |
| `get_weekly_template` | Get current template |
| `save_weekly_template(template)` | Persist template |
| `complete_current_block` | Mark current done, advance |
| `skip_current_block` | Skip current, advance |
| `extend_current_block(minutes)` | Add time to current block |
| `pause_current_block` | Pause timer |
| `resume_current_block` | Resume timer |

### Task Commands
| Command | Description |
|---------|-------------|
| `get_tasks(filter?)` | List tasks, optionally filtered |
| `search_tasks(query)` | Autocomplete search by name substring |
| `create_task(task)` | Create new task |
| `update_task(id, updates)` | Update task |
| `delete_task(id)` | Delete task |
| `get_task_groups` | List all groups |
| `create_task_group(name, color?)` | Create group |
| `get_task_stats(taskId)` | Get avg duration, priority, completion count |

### Process Commands
| Command | Description |
|---------|-------------|
| `get_running_processes` | Snapshot of current processes |
| `get_process_rules` | All user-defined rules |
| `set_process_rule(rule)` | Create/update a process rule |
| `delete_process_rule(processName)` | Remove a rule |
| `get_process_categories` | Built-in + user categories |
| `update_process_category(category)` | Modify category |
| `get_enforcement_status` | Current enforcement state |
| `get_blocked_processes_log(from, to)` | Kill history |

### Analytics Commands
| Command | Description |
|---------|-------------|
| `get_daily_summary(date)` | Summary for a date |
| `get_focus_stats(from, to)` | Focus time/streaks for a range |
| `get_task_completion_stats(from, to)` | Per-task completion data |
| `get_process_kill_stats(from, to)` | Per-app kill counts |

### Guard Commands
| Command | Description |
|---------|-------------|
| `request_quit` | Initiate quit flow, get challenge |
| `confirm_quit(phrase)` | Submit typed phrase to quit |
| `get_guard_status` | Guard active status |

### Settings Commands
| Command | Description |
|---------|-------------|
| `get_preferences` | Get all user preferences |
| `update_preferences(prefs)` | Save preferences |

### Events (Rust -> Frontend)
| Event | Payload | Description |
|-------|---------|-------------|
| `timer-tick` | `{ remaining_secs, total_secs }` | Every second during active block |
| `block-changed` | `TimeBlock` | New block became active |
| `process-warning` | `{ processName, secondsUntilKill }` | Warning before kill |
| `process-killed` | `{ processName, timestamp }` | Process was killed |

---

## Database Schema

```sql
CREATE TABLE time_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    block_type TEXT NOT NULL,          -- 'work', 'break', 'sleep', 'meal', 'custom'
    start_time INTEGER NOT NULL,       -- epoch milliseconds
    end_time INTEGER NOT NULL,
    task_id INTEGER,                   -- FK to tasks (nullable)
    status TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled/active/completed/skipped/paused
    intensity INTEGER DEFAULT 3,       -- 1-5
    created_at INTEGER NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    group_id INTEGER,                  -- FK to task_groups
    priority INTEGER DEFAULT 3,
    estimated_duration_mins INTEGER DEFAULT 60,
    deadline INTEGER,                  -- epoch ms (nullable)
    avg_actual_duration_mins REAL,
    avg_priority REAL,
    completion_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (group_id) REFERENCES task_groups(id)
);

CREATE TABLE task_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT                         -- hex color string
);

CREATE TABLE process_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    process_name TEXT NOT NULL UNIQUE,
    action TEXT NOT NULL,              -- 'always_allow', 'always_block', 'block_during_work', etc.
    category_override TEXT,            -- if set, overrides the category default
    created_at INTEGER NOT NULL
);

CREATE TABLE analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,          -- 'block_completed', 'block_skipped', 'process_killed', etc.
    event_data TEXT,                   -- JSON payload
    timestamp INTEGER NOT NULL
);

CREATE TABLE blocked_process_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    process_name TEXT NOT NULL,
    action_taken TEXT NOT NULL,        -- 'killed', 'warned', 'allowed'
    block_id INTEGER,                  -- FK to time_blocks
    timestamp INTEGER NOT NULL
);
```

Migrations use `PRAGMA user_version` to track schema version. On startup, the app checks the version and runs any needed upgrade SQL in transactions.

---

## Phased Implementation

### Phase 0: Project Scaffolding [DONE]
- Rust installed via rustup
- Tauri + React + TypeScript project scaffolded
- All dependencies installed (frontend + Rust)
- Module directory structure created with stub files
- Tailwind, dark theme CSS variables, .gitignore configured
- Verified: `npm run tauri dev` opens a window

### Phase 1: Database + Schedule Engine
- SQLite connection management, schema, migrations
- Schedule models and engine (template generation, block advancement, rolling schedule)
- Background timer loop emitting events
- All schedule Tauri commands

### Phase 2: Task Management
- Task models, repository (CRUD + search + stats)
- All task Tauri commands

### Phase 3: Frontend Views (MVP UI)
- Routing, layout (AppShell + Sidebar)
- FocusView with live timer
- ScheduleView with block list
- TaskManager with autocomplete
- Zustand store

### Phase 4: Process Monitoring & Enforcement
- Process scanner (sysinfo, 5s interval)
- Category system with built-in defaults
- Enforcement pipeline (warn -> countdown -> kill)
- Frontend process views

### Phase 5: Anti-Circumvention (Guard)
- Close interception, quit challenge
- System tray, persistent backend
- Auto-start registration

### Phase 6: Analytics
- Event tracking, aggregation queries
- Frontend charts and summaries

### Phase 7: Polish
- Settings UI, weekly template editor
- Theme toggle prep
