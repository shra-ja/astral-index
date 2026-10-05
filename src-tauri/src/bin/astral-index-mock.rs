fn main() {
    let scenario = std::env::var(astral_index::acquisition::mock::VARIABLE).ok();
    let scenario = astral_index::desktop::Scenario::named(scenario.as_deref())
        .expect("unknown ASTRAL_INDEX_MOCK_SCENARIO");
    astral_index::desktop::register_mock(tauri::Builder::default(), scenario)
        .run(tauri::generate_context!())
        .expect("failed to run Astral Index's mock");
}
