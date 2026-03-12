# AntiProcrastinator - Feature Design Specification

AntiProcrastinator is a desktop time management app that enforces productivity by managing your schedule and actively killing unproductive processes on your computer. It runs on Tauri (Rust backend + React/TypeScript frontend).

---

## 1. Schedule System

### Rolling Schedule

The schedule is **rolling** - there is no daily reset. Tasks and time blocks flow continuously across days. If you didn't finish something today, it stays in the schedule and rolls forward. The schedule is an infinite timeline, not a day-by-day planner.

### Weekly Templates

Users define a **weekly template** that auto-generates the repeating structure of their days:

- **Sleep blocks**: Fixed start/end times per day (e.g., 23:00-07:00). Can vary by day of the week.
- **Work/break pattern**: A repeating cycle that fills all non-fixed time. User sets the durations, e.g., 90 minutes of work followed by 30 minutes of break. These alternate automatically throughout the available hours.
- **Fixed blocks**: Recurring events like meals, gym, commute, meetings. Each has a title, day(s) of the week, start time, and duration. These are placed into the schedule first, and work/break cycles fill around them.

For example, a user might configure:
- Sleep: 23:00-07:00 every day
- Lunch: 12:00-12:45 every day
- Gym: 18:00-19:00 on Mon/Wed/Fri
- Work blocks: 90 minutes
- Break blocks: 30 minutes

The template engine takes these inputs and generates the full schedule: sleep block, then alternating work/break blocks from 07:00 to 12:00, lunch, more work/break blocks from 12:45 to 18:00, gym (on gym days) or more work/break, then evening blocks until 23:00.

Templates can be customized per day of the week (e.g., lighter schedule on weekends). The generated schedule is not read-only - users can manually add, move, or delete individual blocks after generation.

### Time Blocks

Every slot in the schedule is a **time block** with:
- **Title**: What this block is for (e.g., "Deep Work", "Lunch", a specific task name)
- **Type**: `work`, `break`, `sleep`, `meal`, or `custom`
- **Start/end time**: Exact timestamps
- **Assigned task** (optional): A task from the task library can be linked to a work block
- **Status**: `scheduled`, `active`, `completed`, `skipped`, `paused`
- **Intensity**: 1-5 scale indicating how demanding this block is (informational, shown to user)

---

## 2. Main Focus View

This is the primary screen the user sees while working. It is designed to be **minimal and distraction-free** - dark background, clean typography, no clutter.

### What's on screen:
- **Current task name**: Large, prominent text showing what you should be doing right now
- **Countdown timer**: Large digital display (MM:SS or HH:MM:SS) counting down the remaining time in the current block. Below it, a progress bar showing how far through the block you are.
- **Next task preview**: A smaller card below the timer showing what comes next, so you know what's ahead
- **Intensity indicator**: Visual indicator (dots or bars, 1-5) of the current block's intensity
- **Quick action buttons**:
  - **Pause**: Pauses the countdown timer. The block doesn't advance, time freezes.
  - **Done**: Marks the current block as completed early and immediately advances to the next block.
  - **Skip**: Skips the current block entirely (marks as skipped) and advances to the next.
  - **Extend**: Adds more time to the current block. Offers options like +5m, +10m, +15m.
- **Navigation menu**: Small, unobtrusive access to the other views (schedule, tasks, processes, analytics, settings)

### Timer behavior:
- The timer runs in the **Rust backend**, not in JavaScript. This ensures accuracy even if the browser tab is slow, and allows the schedule to advance even if the frontend window is closed.
- The backend emits tick events every second, which the frontend subscribes to and displays.
- When a block's time expires, the backend automatically advances to the next block and emits a block-changed event.

---

## 3. Schedule/Plan View

This is the detailed view where users see and manage their full schedule.

### MVP: Simple list view
- Time blocks displayed as a vertical list, grouped by day
- Each block shows: time range, title, block type (color-coded), status badge
- Color coding: work=indigo, break=green, sleep=blue, meal=amber, custom=purple
- Click any block to edit it (opens a modal)
- "Add Block" button available in gaps between existing blocks
- Rescheduling: users can change times, reorder blocks, or reassign tasks

### Interactions:
- Click a block to edit its title, times, assigned task, intensity
- Delete a block
- Add a new block at a specific time
- Apply/regenerate the weekly template for a date range

---

## 4. Task Management

Tasks are the **library of things you work on**. They are separate from the schedule - you create tasks once and then assign them to schedule blocks as needed.

### Task input
- **Text entry with autocomplete**: When assigning a task to a schedule block, the user types in an input field. As they type, a dropdown appears showing matching tasks from the library, sorted by frequency of use (most-used first). The user can select an existing task or create a new one.
- **Predictive matching**: The dropdown filters in real-time based on what's typed so far. Matching is by substring against the task name.

### Task properties
- **Name**: What the task is called (e.g., "Review PRs", "Write chapter 3", "Study algorithms")
- **Priority**: 1-5, set by the user each time it's scheduled. An **average priority** is computed and stored from all previous times this task was used.
- **Estimated duration**: How long the user thinks it'll take. An **average actual duration** is also tracked from completions.
- **Deadline** (optional): When this task needs to be done by
- **Group/category**: Tasks can be organized into groups (e.g., "Work", "Personal", "Study") with optional color labels
- **Completion count**: How many times this task has been completed (used for frecency sorting in autocomplete)

### Task Manager view
A dedicated interface for managing the task library:
- Lists all tasks, grouped by their task group
- Add new tasks, edit existing ones, delete them
- Create/edit/delete task groups
- View stats for each task: average duration, average priority, completion count

### Future enhancement (noted, not for MVP):
- Local LLM inference (e.g., Qwen 3B) to predict priority and estimated duration for new tasks based on the name and historical data
- Could also use a web API, but cost is a concern

---

## 5. Process Detection & Killing

This is the core enforcement feature. The app monitors running processes on the computer and kills ones that are classified as unproductive during work blocks.

### Process monitoring
- The Rust backend scans all running processes every 5 seconds using the `sysinfo` crate (cross-platform, works on macOS and Windows)
- Each scan gets the list of running process names

### Process classification
Processes are classified into categories:

**Built-in categories** (pre-configured, user can modify):
- **Games**: Steam, Epic Games, Riot Client, Battle.net, individual game executables
- **Social Media**: Discord, Telegram, WhatsApp, Signal
- **Entertainment**: Spotify, VLC, Netflix (browser-based would need different detection)
- **Browsers**: Chrome, Firefox, Safari, Edge, Arc, Brave (these are special - sometimes productive, sometimes not)

Each category has a **default action**:
- `always_block`: Kill during any work block (e.g., games)
- `block_during_work`: Kill only during work blocks, allow during breaks (e.g., social media)
- `allow_during_break`: Only allowed during break blocks
- `warn`: Just notify the user, don't auto-kill (e.g., browsers)
- `always_allow`: Never touch this process (e.g., system processes)

**Context-aware rules**: Different enforcement per block type. During a "deep work" block, Slack might be blocked. During a "meetings" block, Slack would be allowed. This is configurable per-task or per-block-type.

**Per-process overrides**: The user can set individual rules for any process, overriding its category default. E.g., "Always allow Discord" even though it's in the social media category.

**Reconsider warnings**: If a user tries to allow a process that is in an obviously unproductive category (games, for instance), the app shows a warning dialog: "This is categorized as a game. Allowing it during work may hurt your focus. Are you sure?" They can still allow it, but the friction is intentional.

### Future enhancement (noted, not for MVP):
- Local LLM inference to auto-classify unknown processes (ones not in any built-in category) as productive or unproductive, so the user doesn't have to manually categorize every process
- System processes would be auto-identified and allowed

### Enforcement pipeline

When a blocked process is detected during a work block:

1. **T-120 seconds (2 minutes before kill)**: A non-intrusive notification appears: "Discord detected. It will be closed in 2 minutes."
2. **T-30 seconds**: A modal countdown overlay appears on the focus view: "Discord will be closed in 30 seconds. [Allow] [Close Now]"
3. **T-0**: The process is killed via `process.kill()`. A log entry is recorded.

This is the **default** behavior. Users can configure per-app:
- Immediate kill (no warning)
- Warning then kill (the default pipeline above)
- Notify only (never auto-kill)

All kills are logged with timestamp and process name for analytics.

### Future idea (noted, not for MVP):
- **Process hibernation/freezing**: Instead of killing a process, somehow suspend or freeze it so it can be restored later. This would be less destructive than killing (you wouldn't lose unsaved state in the app). Implementation complexity is high - would need OS-level process suspension (SIGSTOP on macOS, NtSuspendProcess on Windows). Saved as a future feature to explore.

---

## 6. Anti-Circumvention (Guard System)

The app is designed to resist casual attempts to bypass it when you're tempted to procrastinate.

### Strong guard mode:
- **Persistent backend**: The Rust backend runs as a separate process from the frontend window. If the user closes the window (clicks X or Cmd+Q), the backend keeps running - the schedule engine and process enforcer continue operating.
- **Auto-restart frontend**: If the frontend window is closed, the backend detects this and can reopen it. The system tray icon persists, and clicking it reopens the window.
- **Quit challenge**: To actually quit the app, the user must go through a multi-step flow:
  1. Click the quit button in the app
  2. A dialog appears with discouragement text explaining why they should keep going
  3. The user must type the exact phrase **"I WANT TO PROCRASTINATE"** into a text input
  4. This phrase is validated server-side (in Rust) to prevent frontend tampering
  5. Only then does the app exit
- **System tray**: The app lives in the system tray (menu bar on macOS, system tray on Windows). Minimizing sends it to tray. Process enforcement continues in the background.
- **Login item**: Optionally registers as a startup item so it launches when the computer boots.

### Escape hatch:
- The user can always kill the process via Activity Monitor / Task Manager. This is acceptable - the goal is to add friction to impulsive procrastination, not to create malware.
- The quit challenge is annoying enough to make you reconsider, but not impossible to bypass.

---

## 7. Analytics

The app tracks detailed productivity metrics and presents them visually.

### What's tracked:
- **Time per task**: How long was actually spent on each task vs. planned duration
- **Completion rates**: How often tasks are completed vs. skipped
- **Blocked/killed apps**: Which processes were killed, when, and how many times
- **Focus streaks**: Consecutive work blocks completed without skipping. Longest streak tracked.
- **Daily summaries**: Total focus time, tasks completed, processes killed for each day

### Analytics view:
- Date range selector to view different periods
- **Daily summary card**: Key numbers for a single day
- **Focus time chart**: Bar chart showing hours of focus time per day over the selected range
- **Top killed apps**: List of most-frequently killed processes
- **Task completion stats**: Per-task breakdown of completion rate and duration accuracy

---

## 8. Data Storage

### SQLite (via rusqlite in Rust)
Used for all structured, relational data that needs querying:
- Time blocks (the schedule)
- Tasks and task groups
- Process rules and overrides
- Analytics events and daily summaries
- Blocked process log

The database file lives in the OS-appropriate app data directory.

### JSON files
Used for configuration and preferences:
- User preferences (theme, work/break durations, enforcement timing, notification settings)
- Process category definitions (the built-in category lists)
- Weekly template configuration

JSON is used here because these files change rarely, benefit from being human-readable/editable, and don't need relational queries.

---

## 9. Visual Design

### Theme: Minimal Dark (default)
- Background: `#0f0f13` (very dark, near-black)
- Secondary background: `#1a1a24` (cards, sidebar)
- Tertiary background: `#252533` (inputs, hover states)
- Primary text: `#e8e8ed` (bright white-grey)
- Secondary text: `#8888a0` (muted, for labels)
- Accent: `#6366f1` (indigo, for buttons, active states, progress bars)
- Danger: `#ef4444` (red, for kill actions, warnings)
- Success: `#22c55e` (green, for completions)
- Warning: `#f59e0b` (amber, for countdown warnings)

### Layout:
- Narrow left sidebar with icon-based navigation (Focus, Schedule, Tasks, Processes, Analytics, Settings)
- Main content area takes the rest of the width
- Focus view is centered, single column
- Other views use full width

### Future enhancement:
- Theme toggle (dark/light/warm/high-contrast)
