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

# Next Backend Tasks

- [ ] Expand per-task planning metadata and chunking behavior beyond the current section-clustering pass with learned or task-specific refinement
- [ ] Enrich the unified mutation model with reason codes, persisted schedule-mutation history, and tighter analytics queries on planner/runtime changes
- [ ] Add explicit block-level pin/edit workflows on top of the new protection flag so manual and planner-generated pins can be managed separately
