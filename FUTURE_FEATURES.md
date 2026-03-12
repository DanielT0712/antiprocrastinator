# AntiProcrastinator - Future Features

Features planned for post-MVP implementation. These are not in the current scope but should be kept in mind during development to avoid painting ourselves into a corner.

---

## Schedule Enhancements

### Drag-and-drop schedule editing
- Vertical timeline view (like Google Calendar day view) where blocks can be dragged to reorder and resized to change duration
- Kanban-style column view with columns per time slot, tasks draggable between them

### Calendar integration
- Import events from Google Calendar, Outlook, Apple Calendar
- Auto-create fixed blocks from calendar events
- Sync deadlines from calendar to task deadlines

---

## Local LLM Integration

### Task prediction (Qwen 3B or similar small model)
- Auto-predict priority for new tasks based on name and historical data
- Auto-predict estimated duration based on similar past tasks
- Suggest optimal scheduling based on deadline proximity and task dependencies
- Could alternatively use a web API (e.g., Claude API), but cost is a concern for continuous use

### Process auto-classification
- Automatically classify unknown processes (ones not in any built-in category) as productive or unproductive
- Auto-identify system/OS processes and mark them as always-allow so the user doesn't have to manually deal with them
- Learn from user overrides to improve classification over time

---

## Process Management

### Process hibernation/freezing
Instead of killing processes, suspend them so they can be restored later without losing state:
- **macOS**: Send `SIGSTOP` to freeze, `SIGCONT` to resume
- **Windows**: Use `NtSuspendProcess` / `NtResumeProcess`
- Frozen processes stay in memory but consume no CPU
- At end of work block (or during break), auto-resume frozen processes
- UI shows frozen processes with a "thaw" button

**Complexity notes**: Process freezing is OS-specific and can cause issues with some apps (network timeouts, audio glitches). Needs careful testing per-app. Some apps may need to be killed rather than frozen if they don't handle suspension well.

---

## Visual Design

### Multiple themes
- **Minimal dark** (current default)
- **Warm & focused**: Warm amber/orange accents, slightly rounded corners, cozy study-app feel
- **High contrast minimal**: Bold black & white with single accent color, very large timer
- **Light mode**: Clean white background for daytime use

### Customizable accent colors
Let users pick their own accent color from a palette or color picker.

---

## Platform & Distribution

### Mobile companion app
- View current task and timer
- Receive notifications for block changes
- Mark tasks as done from phone
- Sync via local network or cloud

### Cross-device sync
- Sync schedule, tasks, and analytics across multiple computers
- Would need a server component or peer-to-peer sync

---

## Analytics Enhancements

### Productivity score
- Composite score based on completion rate, focus time, process kills
- Daily/weekly/monthly trends
- Gamification: streaks, achievements, milestones

### Export
- Export analytics data as CSV or PDF reports
- Weekly email summary (if email integration is added)

---

## Workflow Integrations

### Pomodoro mode
- Strict pomodoro timer (25 min work / 5 min break / 15 min long break)
- Configurable intervals
- Auto-count pomodoros per day

### Website blocking
- Beyond process killing, block specific URLs in the browser
- Would require a browser extension or system-level proxy
- Block social media sites, news sites, etc. during work blocks

### Notification management
- Suppress desktop notifications during work blocks (Do Not Disturb integration)
- macOS: Use Focus mode API
- Windows: Use Focus Assist API
