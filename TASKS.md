# Completed Tasks

- [x] Added SQLite schema creation and migration bootstrapping for the Tauri backend
- [x] Implemented persistent task groups, task CRUD, search, and task stats commands
- [x] Implemented JSON-backed user preferences storage and settings commands
- [x] Implemented rolling schedule storage, weekly template generation, and timer command APIs
- [x] Implemented analytics query commands and the guard quit-challenge API
- [x] Implemented built-in process categories, rule CRUD, live process snapshots, and background enforcement scaffolding
- [x] Added a first pass of the section-based scheduler/rescheduler with deadline scoring, integrated packing, and fit mode
- [x] Documented the current planner algorithm in `PLANNER.md`

# Next Backend Tasks

- [ ] Replace the current simple future-shift logic in block completion/extend/pause flows with planner-driven rebuilds
- [ ] Add explicit task planning metadata such as per-task max block length, work/rest ratio, and protected/manual pin state
- [ ] Hook schedule/process actions into analytics event recording
