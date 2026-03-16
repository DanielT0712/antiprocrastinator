#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Err(error) = app_lib::guard::watchdog::run_guard_helper_from_cli() {
        eprintln!("guard helper failed: {error}");
    }
}
