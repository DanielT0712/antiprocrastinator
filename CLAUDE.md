# AntiProcrastinator - Development Guidelines

## Workflow Rules
- **Commit frequently**: Commit on every change, addition, or fix of a feature. Do not batch commits. Write clear but concise commit messages explaining what changed and why.
- **Maintain a completed task list**: Update task tracking as each item is finished.
- **GUI verification**: Whenever a new UI element or window is added, ask the user to run the app and verify it looks good. Wait for feedback before proceeding.

## Tech Stack
- **Backend**: Rust (Tauri v2)
- **Frontend**: React + TypeScript
- **Styling**: Tailwind CSS v4
- **State**: Zustand
- **Database**: SQLite (rusqlite, bundled)
- **Process monitoring**: sysinfo crate
- **Config**: JSON files for preferences, SQLite for relational data

## Project Structure
- `src/` - React frontend
- `src-tauri/` - Rust backend
- Frontend API wrappers in `src/api/` call Tauri commands via `invoke()`
- Rust modules: db, schedule, tasks, processes, analytics, guard, config
