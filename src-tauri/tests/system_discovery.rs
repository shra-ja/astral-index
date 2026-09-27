//! Real process/file boundaries with synthetic executables, never Windows profiles.
#![cfg(target_os = "linux")]

use roll_tracker::discovery::{
    LogError,
    system::{DiscoveryError, discover_current_user_logs},
};
use std::{
    fs,
    os::unix::fs::PermissionsExt,
    path::Path,
    process::Command,
    time::{Duration, Instant},
};

fn runtime<T>(future: impl std::future::Future<Output = T>) -> T {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(future)
}

fn executable(path: &Path, script: &str) {
    fs::write(path, script).unwrap();
    fs::set_permissions(path, fs::Permissions::from_mode(0o700)).unwrap();
}

#[test]
fn current_user_discovery_uses_real_process_pipes_and_only_the_two_logs() {
    if let Some(root) = std::env::var_os("ROLL_TRACKER_SYSTEM_FIXTURE") {
        let root = std::path::PathBuf::from(root);
        let result = runtime(discover_current_user_logs()).unwrap();
        assert_eq!(
            result.current,
            Err(DiscoveryError::Log(LogError::InvalidText))
        );
        assert_eq!(result.previous.unwrap(), [root.join("mounted-game")]);
        return;
    }

    let root = std::env::temp_dir().join(format!("roll-tracker-system-{}", std::process::id()));
    let bin = root.join("bin");
    let logs = root.join("AppData/LocalLow/Cognosphere/Star Rail");
    fs::create_dir_all(&bin).unwrap();
    fs::create_dir_all(&logs).unwrap();
    let previous = b"Loading player data from D:/Games/Star Rail/data.unity3d\n";
    fs::write(logs.join("Player.log"), [0xff]).unwrap();
    fs::write(logs.join("Player-prev.log"), previous).unwrap();
    executable(
        &bin.join("powershell.exe"),
        "#!/bin/sh\nprintf '%s' 'C:\\Users\\Synthetic\\AppData\\Roaming'\n",
    );
    executable(
        &bin.join("wslpath"),
        r#"#!/bin/sh
[ "$1" = "-a" ] && [ "$2" = "-u" ] && [ "$#" = "3" ] || exit 8
case "$3" in
  'C:/Users/Synthetic/AppData/Roaming') printf '%s\n' "$ROLL_TRACKER_SYSTEM_FIXTURE/AppData/Roaming";;
  'D:/Games/Star Rail/') printf '%s\n' "$ROLL_TRACKER_SYSTEM_FIXTURE/mounted-game";;
  *) exit 9;;
esac
"#,
    );
    let output = Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "current_user_discovery_uses_real_process_pipes_and_only_the_two_logs",
            "--nocapture",
        ])
        .env("ROLL_TRACKER_SYSTEM_FIXTURE", &root)
        .env("WSL_DISTRO_NAME", "Synthetic")
        .env("PATH", &bin)
        .output()
        .unwrap();
    let unchanged = fs::read(logs.join("Player-prev.log")).unwrap() == previous
        && fs::read(logs.join("Player.log")).unwrap() == [0xff];
    fs::remove_dir_all(root).unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(unchanged);
}

#[test]
fn failed_oversized_and_stalled_helpers_fail_safely_and_are_terminated() {
    if let Some(mode) = std::env::var_os("ROLL_TRACKER_HELPER_MODE") {
        let started = Instant::now();
        let expected = match mode.to_str().unwrap() {
            "failure" => DiscoveryError::ProcessFailed,
            "oversize" => DiscoveryError::OutputTooLarge,
            "stall" => DiscoveryError::TimedOut,
            _ => unreachable!(),
        };
        // Keep the runtime alive while checking cleanup/reaping after dropping the child.
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        assert!(
            matches!(rt.block_on(discover_current_user_logs()), Err(error) if error == expected)
        );
        assert!(started.elapsed() < Duration::from_secs(10));
        let pid = fs::read_to_string(std::env::var_os("ROLL_TRACKER_HELPER_PID").unwrap()).unwrap();
        rt.block_on(async {
            for _ in 0..100 {
                if !Path::new("/proc").join(pid.trim()).exists() {
                    return;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            panic!("lookup helper was not terminated/reaped");
        });
        return;
    }

    let root = std::env::temp_dir().join(format!(
        "roll-tracker-system-failure-{}",
        std::process::id()
    ));
    fs::create_dir_all(&root).unwrap();
    let pid = root.join("pid");
    executable(
        &root.join("powershell.exe"),
        r#"#!/bin/sh
printf '%s' "$$" > "$ROLL_TRACKER_HELPER_PID"
printf '%s' 'synthetic private diagnostic' >&2
case "$ROLL_TRACKER_HELPER_MODE" in
  failure) exit 9;;
  oversize) printf '%040000d' 0;;
esac
exec /bin/sleep 60
"#,
    );
    let result = std::panic::catch_unwind(|| {
        for mode in ["failure", "oversize", "stall"] {
            let output = Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "failed_oversized_and_stalled_helpers_fail_safely_and_are_terminated",
                    "--nocapture",
                ])
                .env("ROLL_TRACKER_HELPER_MODE", mode)
                .env("ROLL_TRACKER_HELPER_PID", &pid)
                .env("WSL_DISTRO_NAME", "Synthetic")
                .env("PATH", &root)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
            assert!(
                !String::from_utf8_lossy(&output.stderr).contains("synthetic private diagnostic")
            );
        }
    });
    fs::remove_dir_all(root).unwrap();
    result.unwrap();
}
