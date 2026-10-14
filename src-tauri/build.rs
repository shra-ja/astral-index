fn main() {
    let commands = tauri_build::AppManifest::new().commands(include!("src/desktop/commands.in"));
    // On Windows the linker embeds the manifest below instead of Tauri's resource,
    // which only binaries link: test binaries need it too, or Windows cannot start them.
    let windows = tauri_build::WindowsAttributes::new_without_app_manifest();
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(commands)
            .windows_attributes(windows),
    )
    .expect("failed to build Astral Index");
    println!("cargo:rerun-if-changed=windows-app-manifest.xml");
    let msvc = std::env::var("CARGO_CFG_TARGET_ENV").is_ok_and(|env| env == "msvc");
    let manifest = concat!(env!("CARGO_MANIFEST_DIR"), "/windows-app-manifest.xml");
    let embed = format!(
        "cargo:rustc-link-arg=/MANIFEST:EMBED\ncargo:rustc-link-arg=/MANIFESTINPUT:{manifest}\n"
    );
    print!("{}", msvc.then_some(embed).unwrap_or_default());
}
