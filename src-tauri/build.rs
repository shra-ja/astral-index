fn main() {
    let commands = tauri_build::AppManifest::new().commands(include!("src/desktop/commands.in"));
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(commands))
        .expect("failed to build Astral Index");
}
