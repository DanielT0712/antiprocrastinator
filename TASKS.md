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

# Next Backend Tasks

- [ ] Add explicit task planning metadata such as per-task max block length, work/rest ratio, and protected/manual pin state
- [ ] Finish moving all runtime schedule mutations onto the same planner diff model, including richer warnings/events and per-task overrides
- [ ] Hook schedule/process actions into analytics event recording
