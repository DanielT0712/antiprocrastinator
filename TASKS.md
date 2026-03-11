# Completed Tasks

- [x] Added SQLite schema creation and migration bootstrapping for the Tauri backend
- [x] Implemented persistent task groups, task CRUD, search, and task stats commands
- [x] Implemented JSON-backed user preferences storage and settings commands
- [x] Implemented rolling schedule storage, weekly template generation, and timer command APIs
- [x] Implemented analytics query commands and the guard quit-challenge API
- [x] Implemented built-in process categories, rule CRUD, live process snapshots, and background enforcement scaffolding

# Next Backend Tasks

- [ ] Confirm edge-case schedule policy for pause/resume and template regeneration behavior
- [ ] Decide whether non-`work` custom blocks should participate in process enforcement
- [ ] Hook schedule/process actions into analytics event recording
