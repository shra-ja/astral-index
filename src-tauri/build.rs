use std::collections::HashMap;

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
    // Link lines by target environment: only MSVC's linker takes them.
    let manifest = concat!(env!("CARGO_MANIFEST_DIR"), "/windows-app-manifest.xml");
    let link_lines = HashMap::from([(
        "msvc",
        format!(
            "cargo:rustc-link-arg=/MANIFEST:EMBED\ncargo:rustc-link-arg=/MANIFESTINPUT:{manifest}\n"
        ),
    )]);
    let target = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    print!(
        "{}",
        link_lines.get(target.as_str()).map_or("", String::as_str)
    );
}
