fn main() {
    let commands = tauri_build::AppManifest::new().commands(include!("src/desktop/commands.in"));
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(commands))
        .expect("failed to build Astral Index");
    // Tauri links its Windows resource, the manifest and icons, into binaries only;
    // test binaries need it too, or Windows cannot start them. Elsewhere, nothing.
    let msvc = std::env::var("CARGO_CFG_TARGET_ENV").is_ok_and(|env| env == "msvc");
    let resource = std::env::var("OUT_DIR").expect("Cargo sets OUT_DIR") + "/resource.lib";
    print!(
        "{}",
        msvc.then_some(format!("cargo:rustc-link-arg={resource}\n"))
            .unwrap_or_default()
    );
}
