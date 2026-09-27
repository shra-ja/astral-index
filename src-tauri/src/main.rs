#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    roll_tracker::desktop::register(tauri::Builder::default())
        .run(tauri::generate_context!())
        .expect("failed to run Roll Tracker");
}
