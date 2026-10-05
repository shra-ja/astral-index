fn main() {
    let scenario = std::env::var(roll_tracker::acquisition::mock::VARIABLE).ok();
    let scenario = roll_tracker::desktop::Scenario::named(scenario.as_deref())
        .expect("unknown ASTRAL_INDEX_MOCK_SCENARIO");
    roll_tracker::desktop::register_mock(tauri::Builder::default(), scenario)
        .run(tauri::generate_context!())
        .expect("failed to run Roll Tracker's mock");
}
