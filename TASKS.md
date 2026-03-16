# Completed Tasks

- [x] Added SQLite schema creation and migration bootstrapping for the Tauri backend
- [x] Implemented persistent task groups, task CRUD, search, and task stats commands
- [x] Implemented JSON-backed user preferences storage and settings commands
- [x] Implemented rolling schedule storage, weekly template generation, and timer command APIs
- [x] Implemented analytics query commands and the guard quit-challenge API
- [x] Implemented built-in process categories, rule CRUD, live process snapshots, and background enforcement scaffolding
- [x] Added a first pass of the section-based scheduler/rescheduler with deadline scoring, integrated packing, and fit mode
- [x] Documented the current planner algorithm in `PLANNER.md`
- [x] Replaced simple shift-based completion/extend/pause behavior with local rest-buffer adjustment plus planner fallback, and added emergency blocks with enforcement allowlists
- [x] Added overdue work-block prompting plus explicit continue mode that consumes rest buffers until the user marks done or the next work block takes over
- [x] Routed passive overdue blocks through rest permissions and recorded schedule prompt/continue/handoff actions in analytics events
- [x] Added a persistent known-app inventory with installed-app scans, live running-process discovery, and unclassified-app detection events
- [x] Added focused-window detection and browser-specific enforcement that targets the active browser tab/window title before killing the whole browser
- [x] Added browser title allow/block keyword preferences with cleaned focused-title matching so browser enforcement can key off words like `github` or `youtube`
- [x] Added known-app confirmation/edit APIs with category overrides and optional syncing into default process rules
- [x] Added minimal per-task planning metadata for max chunk length, per-task work/rest ratios, and protected planner-generated blocks
- [x] Unified schedule-changing command results around a shared mutation/diff payload with block-level semantic changes
- [x] Added section-level clustering preferences for task grouping/separation, chunk grouping/separation, optional priority inversions, and optional dead-gap filling
- [x] Added enforcement profiles with inheritance (`rest`, `work`, `deep_work`, and custom profiles), category/app/browser-target overrides, and backend APIs for editing those diffs
- [x] Added browser-target inventory and classification flow so recognized focused browser tabs can be classified separately from desktop apps
- [x] Changed unclassified discovery flow to batch-friendly behavior: unclassified apps/targets remain effectively allowed, prompts can be disabled globally, and popup emission is deduplicated instead of repeating every scan
- [x] Persisted schedule mutation history and enforcement edit history so planner/runtime changes and rule/profile edits can be queried later
- [x] Set the default app/tab countdown to 30 seconds, added reopen escalation (warn three times, then kill immediately on further reopen attempts within the same block/profile context), and exposed warning counts to the frontend
- [x] Added manual creation APIs for custom browser keywords/targets and custom known apps so users can add sites like `bilibili` or custom executables before they are auto-discovered
- [x] Added desktop keep-alive guardrails: close interception, tray restore/quit flow, guarded app-exit interception, and launch-at-login syncing from preferences

# Next Backend Tasks

- [ ] Expand per-task planning metadata and chunking behavior beyond the current section-clustering pass with learned or task-specific refinement
- [ ] Enrich the unified mutation model with tighter reason codes and richer analytics queries on planner/runtime changes
- [ ] Add explicit block-level pin/edit workflows on top of the new protection flag so manual and planner-generated pins can be managed separately
- [ ] Build the frontend workflows on top of the new backend primitives: batch classification review, profile/category editors, and schedule mutation history views
- [ ] Decide whether `strong_guard_enabled` should grow into a true helper/watchdog relaunch mode or stay as an in-process quit barrier
