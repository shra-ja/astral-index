//! Explicit current-user discovery; no startup hooks or history requests.
use super::{
    ExtractionError, LogDiscovery, LogError, PathMapping, discover_appdata_logs, extract_from_logs,
    map_windows_directory,
};
use crate::acquisition::CachedRequest;
use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::io::AsyncReadExt;

#[cfg(test)]
use tests::os::{self as env, Command, data_dir};
#[cfg(not(test))]
use {dirs::data_dir, std::env, tokio::process::Command};

const COMMAND_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_COMMAND_BYTES: usize = 32 * 1024;
const APPDATA_QUERY: &str = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); [Console]::Write([Environment]::GetFolderPath('ApplicationData'))";

#[derive(Debug, PartialEq, Eq)]
pub enum DiscoveryError {
    UnsupportedHost,
    AppDataUnavailable,
    ProcessUnavailable,
    ProcessFailed,
    TimedOut,
    OutputTooLarge,
    InvalidOutput,
    Log(LogError),
}

/// Call only in response to source discovery. Requires a Tokio runtime with I/O and time.
pub async fn discover_current_user_logs() -> Result<LogDiscovery<DiscoveryError>, DiscoveryError> {
    discover_for_os(env::consts::OS).await
}

/// Call only on an explicit user request. Reads local files; makes no history request.
pub async fn extract_current_user_contexts() -> Result<Vec<CachedRequest>, ExtractionError> {
    let logs = discover_current_user_logs()
        .await
        .map_err(ExtractionError::Discovery)?;
    extract_from_logs(logs)
}

async fn discover_for_os(os: &str) -> Result<LogDiscovery<DiscoveryError>, DiscoveryError> {
    let wsl = match os {
        "windows" => false,
        "linux" if env::var_os("WSL_DISTRO_NAME").is_some_and(|name| !name.is_empty()) => true,
        _ => return Err(DiscoveryError::UnsupportedHost),
    };
    let app_data = if wsl {
        let output = run_command(
            "powershell.exe",
            &[
                OsStr::new("-NoLogo"),
                OsStr::new("-NoProfile"),
                OsStr::new("-NonInteractive"),
                OsStr::new("-Command"),
                OsStr::new(APPDATA_QUERY),
            ],
        )
        .await?;
        let windows = map_windows_directory(&output, PathMapping::Windows)
            .map_err(|_| DiscoveryError::InvalidOutput)?;
        translate_path(&windows).await?
    } else {
        let native = data_dir()
            .filter(|path| !path.as_os_str().is_empty())
            .ok_or(DiscoveryError::AppDataUnavailable)?;
        map_windows_directory(
            native.to_str().ok_or(DiscoveryError::InvalidOutput)?,
            PathMapping::Windows,
        )
        .map_err(|_| DiscoveryError::InvalidOutput)?
    };
    let logs =
        discover_appdata_logs(&app_data, PathMapping::Windows).map_err(DiscoveryError::Log)?;
    Ok(LogDiscovery {
        current: resolve_candidates(logs.current, wsl).await,
        previous: resolve_candidates(logs.previous, wsl).await,
    })
}

async fn resolve_candidates(
    paths: Result<Vec<PathBuf>, LogError>,
    wsl: bool,
) -> Result<Vec<PathBuf>, DiscoveryError> {
    let paths = paths.map_err(DiscoveryError::Log)?;
    if !wsl {
        return Ok(paths);
    }
    let mut mapped = Vec::new();
    for path in paths {
        let path = translate_path(&path).await?;
        if !mapped.contains(&path) {
            mapped.push(path);
        }
    }
    Ok(mapped)
}

/// Paths are separate arguments, never interpolated into a shell expression.
async fn translate_path(windows: &Path) -> Result<PathBuf, DiscoveryError> {
    let output = run_command(
        "wslpath",
        &[OsStr::new("-a"), OsStr::new("-u"), windows.as_os_str()],
    )
    .await?;
    if !output.starts_with('/')
        || output.contains('\\')
        || output.split('/').any(|part| matches!(part, "." | ".."))
    {
        return Err(DiscoveryError::InvalidOutput);
    }
    Ok(PathBuf::from(output))
}

/// Bound both a running child and its stdout; stderr never reaches logs or errors.
/// kill_on_drop also applies if the caller cancels this future.
async fn run_command(program: &str, args: &[&OsStr]) -> Result<String, DiscoveryError> {
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| DiscoveryError::ProcessUnavailable)?;
    let result = tokio::time::timeout(COMMAND_TIMEOUT, async {
        let stdout = child.stdout.take().ok_or(DiscoveryError::ProcessFailed)?;
        let mut bytes = Vec::new();
        stdout
            .take((MAX_COMMAND_BYTES + 1) as u64)
            .read_to_end(&mut bytes)
            .await
            .map_err(|_| DiscoveryError::ProcessFailed)?;
        if bytes.len() > MAX_COMMAND_BYTES {
            return Err(DiscoveryError::OutputTooLarge);
        }
        if !child
            .wait()
            .await
            .map_err(|_| DiscoveryError::ProcessFailed)?
            .success()
        {
            return Err(DiscoveryError::ProcessFailed);
        }
        let text = std::str::from_utf8(&bytes)
            .map_err(|_| DiscoveryError::InvalidOutput)?
            .trim_end_matches(['\r', '\n']);
        if text.is_empty() || text.chars().any(char::is_control) {
            return Err(DiscoveryError::InvalidOutput);
        }
        Ok(text.to_owned())
    })
    .await
    .unwrap_or(Err(DiscoveryError::TimedOut));
    if result.is_err() {
        // Dropping alone only guarantees best-effort reaping. Await error cleanup,
        // but do not replace the useful original error if cleanup itself fails.
        let _ = tokio::time::timeout(COMMAND_TIMEOUT, child.kill()).await;
    }
    result
}

#[cfg(test)]
pub(crate) mod tests {
    pub(crate) mod os;
    use super::*;
    use crate::acquisition::tests::filesystem::{self, Fixture};

    fn run<T>(future: impl std::future::Future<Output = T>) -> T {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .start_paused(true)
            .build()
            .unwrap()
            .block_on(future)
    }

    fn install_logs(root: &str) {
        filesystem::install(Fixture {
            files: [(
                PathBuf::from(root).join("LocalLow/Cognosphere/Star Rail/Player-prev.log"),
                b"Loading player data from D:/Games/Star Rail/data.unity3d\n".to_vec(),
            )]
            .into(),
            ..Default::default()
        });
    }

    #[test]
    fn current_user_extraction_reads_the_discovered_cache_or_reports_discovery_failure() {
        os::install(os::Fixture::default());
        assert_eq!(
            run(extract_current_user_contexts()),
            Err(ExtractionError::Discovery(DiscoveryError::UnsupportedHost))
        );
        os::install(os::Fixture {
            distro: Some("Synthetic".into()),
            plans: [
                os::Plan::output("C:\\Users\\Example\\AppData\\Roaming"),
                os::Plan::output("/windows/c/Users/Example/AppData/Roaming\n"),
                os::Plan::output("/volumes/games/Star Rail\n"),
            ]
            .into(),
            ..Default::default()
        });
        let cache = "1/0/https://public-operation-hkrpg-sg.hoyoverse.com/common/hkrpg_gacha_record/api/getGachaLog?authkey=synthetic&authkey_ver=1&sign_type=2&game_biz=hkrpg_global&lang=en\0";
        filesystem::install(Fixture {
            files: [
                (
                    PathBuf::from("/windows/c/Users/Example/AppData/LocalLow/Cognosphere/Star Rail/Player.log"),
                    b"Loading player data from D:/Games/Star Rail/data.unity3d\n".to_vec(),
                ),
                (
                    PathBuf::from("/volumes/games/Star Rail/webCaches/3.0.0.0/Cache/Cache_Data/data_2"),
                    cache.as_bytes().to_vec(),
                ),
            ]
            .into(),
            listings: [(
                PathBuf::from("/volumes/games/Star Rail/webCaches"),
                vec![PathBuf::from("/volumes/games/Star Rail/webCaches/3.0.0.0")],
            )]
            .into(),
            ..Default::default()
        });
        assert_eq!(
            run(extract_current_user_contexts()).unwrap(),
            crate::acquisition::extract_request_contexts(cache.as_bytes()).unwrap()
        );
    }

    #[test]
    fn native_windows_uses_known_folder_without_processes_or_environment_guesses() {
        os::install(os::Fixture {
            app_data: Some("C:/Synthetic/AppData/Roaming".into()),
            ..Default::default()
        });
        install_logs("C:/Synthetic/AppData");
        let logs = run(discover_for_os("windows")).unwrap();
        assert_eq!(
            logs.current,
            Err(DiscoveryError::Log(LogError::Source(
                crate::acquisition::CacheError::Unreadable
            )))
        );
        assert_eq!(
            logs.previous.unwrap(),
            [PathBuf::from("D:/Games/Star Rail")]
        );
        os::inspect(|state| {
            assert_eq!(state.folder_reads, 1);
            assert!(state.calls.is_empty());
            assert!(state.env_reads.is_empty());
        });
    }

    #[test]
    fn wsl_queries_windows_folder_then_translates_each_candidate_without_mount_assumptions() {
        os::install(os::Fixture {
            distro: Some("Synthetic".into()),
            plans: [
                os::Plan::output("C:\\Users\\Example 星\\AppData\\Roaming"),
                os::Plan::output("/windows/system/Users/Example 星/AppData/Roaming\n"),
                os::Plan::output("/volumes/games/Games/Star Rail\n"),
            ]
            .into(),
            ..Default::default()
        });
        install_logs("/windows/system/Users/Example 星/AppData");
        let logs = run(discover_current_user_logs()).unwrap();
        assert_eq!(
            logs.current,
            Err(DiscoveryError::Log(LogError::Source(
                crate::acquisition::CacheError::Unreadable
            )))
        );
        assert_eq!(
            logs.previous.unwrap(),
            [PathBuf::from("/volumes/games/Games/Star Rail")]
        );
        os::inspect(|state| {
            assert_eq!(
                state.calls,
                [
                    (
                        "powershell.exe".into(),
                        [
                            "-NoLogo",
                            "-NoProfile",
                            "-NonInteractive",
                            "-Command",
                            APPDATA_QUERY
                        ]
                        .map(Into::into)
                        .to_vec()
                    ),
                    (
                        "wslpath".into(),
                        ["-a", "-u", "C:/Users/Example 星/AppData/Roaming"]
                            .map(Into::into)
                            .to_vec()
                    ),
                    (
                        "wslpath".into(),
                        ["-a", "-u", "D:/Games/Star Rail/"].map(Into::into).to_vec()
                    ),
                ]
            );
            assert_eq!(state.folder_reads, 0);
        });
    }

    #[test]
    fn unsupported_hosts_and_missing_folders_fail_without_subprocesses() {
        for distro in [None, Some("".into())] {
            os::install(os::Fixture {
                distro,
                ..Default::default()
            });
            assert!(matches!(
                run(discover_for_os("linux")),
                Err(DiscoveryError::UnsupportedHost)
            ));
            assert!(matches!(
                run(discover_for_os("macos")),
                Err(DiscoveryError::UnsupportedHost)
            ));
            assert!(matches!(
                run(discover_for_os("windows")),
                Err(DiscoveryError::AppDataUnavailable)
            ));
            os::inspect(|state| assert!(state.calls.is_empty()));
        }
    }

    #[test]
    fn lookup_failures_and_invalid_paths_are_safe() {
        for app_data in [PathBuf::new(), PathBuf::from("/")] {
            os::install(os::Fixture {
                app_data: Some(app_data.clone()),
                ..Default::default()
            });
            let expected = if app_data.as_os_str().is_empty() {
                DiscoveryError::AppDataUnavailable
            } else {
                DiscoveryError::InvalidOutput
            };
            assert_eq!(run(discover_for_os("windows")).err(), Some(expected));
        }
        for plan in [
            os::Plan {
                spawn_error: true,
                ..Default::default()
            },
            os::Plan::output("relative"),
            os::Plan::output("//server/share/Roaming"),
        ] {
            os::install(os::Fixture {
                distro: Some("Synthetic".into()),
                plans: [plan].into(),
                ..Default::default()
            });
            assert!(run(discover_current_user_logs()).is_err());
            os::inspect(|state| assert_eq!(state.calls.len(), 1));
        }
        for output in ["relative", "/mnt/../other", "/mnt/./other", "/mnt\\other"] {
            os::install(os::Fixture {
                plans: [os::Plan::output(output)].into(),
                ..Default::default()
            });
            assert_eq!(
                run(translate_path(Path::new("C:/synthetic"))),
                Err(DiscoveryError::InvalidOutput)
            );
        }
        os::install(os::Fixture {
            plans: [os::Plan {
                spawn_error: true,
                ..Default::default()
            }]
            .into(),
            ..Default::default()
        });
        assert_eq!(
            run(translate_path(Path::new("C:/synthetic"))),
            Err(DiscoveryError::ProcessUnavailable)
        );
        os::install(os::Fixture {
            distro: Some("Synthetic".into()),
            plans: [
                os::Plan::output("C:/Users/Example/AppData/Roaming"),
                os::Plan::output("relative"),
            ]
            .into(),
            ..Default::default()
        });
        assert!(matches!(
            run(discover_current_user_logs()),
            Err(DiscoveryError::InvalidOutput)
        ));
    }

    #[test]
    fn translated_appdata_without_a_parent_fails_before_log_reads() {
        filesystem::install(Default::default());
        os::install(os::Fixture {
            distro: Some("Synthetic".into()),
            plans: [
                os::Plan::output("C:/Users/Example/AppData/Roaming"),
                os::Plan::output("/"),
            ]
            .into(),
            ..Default::default()
        });
        assert_eq!(
            run(discover_current_user_logs()).err(),
            Some(DiscoveryError::Log(LogError::UnsupportedPath))
        );
        filesystem::inspect(|state| assert!(state.accessed.is_empty()));
    }

    #[test]
    fn native_folder_lookup_rejects_nonlocal_and_malformed_paths_before_io() {
        for path in ["relative", "//server/share/Roaming", "C:/Users/../Roaming"] {
            filesystem::install(Default::default());
            os::install(os::Fixture {
                app_data: Some(path.into()),
                ..Default::default()
            });
            assert_eq!(
                run(discover_for_os("windows")).err(),
                Some(DiscoveryError::InvalidOutput)
            );
            filesystem::inspect(|state| assert!(state.accessed.is_empty()));
        }
    }

    #[cfg(unix)]
    #[test]
    fn native_folder_lookup_rejects_non_unicode_paths() {
        use std::{ffi::OsString, os::unix::ffi::OsStringExt};
        os::install(os::Fixture {
            app_data: Some(PathBuf::from(OsString::from_vec(
                b"C:/Users/\xff/Roaming".to_vec(),
            ))),
            ..Default::default()
        });
        assert_eq!(
            run(discover_for_os("windows")).err(),
            Some(DiscoveryError::InvalidOutput)
        );
    }

    #[test]
    fn translated_duplicates_collapse_and_failed_current_mapping_keeps_previous() {
        os::install(os::Fixture {
            plans: [
                os::Plan::output("/games/one"),
                os::Plan::output("/games/one"),
            ]
            .into(),
            ..Default::default()
        });
        let mapped = run(resolve_candidates(
            Ok(vec!["D:/One".into(), "D:/ONE".into()]),
            true,
        ))
        .unwrap();
        assert_eq!(mapped, [PathBuf::from("/games/one")]);

        let appdata = "/synthetic/AppData";
        let logs = Path::new(appdata).join("LocalLow/Cognosphere/Star Rail");
        filesystem::install(Fixture {
            files: [
                (logs.join("Player.log"), b"Loading player data from C:/One/data.unity3d\nLoading player data from D:/Two/data.unity3d\n".to_vec()),
                (logs.join("Player-prev.log"), b"Loading player data from E:/Other/data.unity3d\n".to_vec()),
            ].into(), ..Default::default()
        });
        os::install(os::Fixture {
            distro: Some("Synthetic".into()),
            plans: [
                os::Plan::output("C:/Users/Example/AppData/Roaming"),
                os::Plan::output("/synthetic/AppData/Roaming"),
                os::Plan::output("/games/one"),
                os::Plan {
                    unsuccessful: true,
                    ..Default::default()
                },
                os::Plan::output("/games/other"),
            ]
            .into(),
            ..Default::default()
        });
        let result = run(discover_current_user_logs()).unwrap();
        assert_eq!(result.current, Err(DiscoveryError::ProcessFailed));
        assert_eq!(result.previous.unwrap(), [PathBuf::from("/games/other")]);
        filesystem::inspect(|state| assert!(state.accessed.iter().all(|p| p.starts_with(&logs))));
    }

    #[test]
    fn dropping_a_pending_lookup_drops_its_child() {
        os::install(os::Fixture {
            plans: [os::Plan {
                pending_read: true,
                ..Default::default()
            }]
            .into(),
            ..Default::default()
        });
        run(async {
            let mut future = Box::pin(run_command("synthetic", &[]));
            std::future::poll_fn(|cx| {
                assert!(future.as_mut().poll(cx).is_pending());
                std::task::Poll::Ready(())
            })
            .await;
            os::inspect(|state| assert_eq!(state.drops, 0));
            drop(future);
            os::inspect(|state| assert_eq!(state.drops, 1));
        });
    }

    #[test]
    fn commands_are_bounded_redacted_and_killed_on_early_exit() {
        let cases = [
            (os::Plan::output("valid\r\n"), Ok("valid".to_owned())),
            (
                os::Plan {
                    spawn_error: true,
                    ..Default::default()
                },
                Err(DiscoveryError::ProcessUnavailable),
            ),
            (
                os::Plan {
                    stdout_missing: true,
                    ..Default::default()
                },
                Err(DiscoveryError::ProcessFailed),
            ),
            (
                os::Plan {
                    read_error: true,
                    ..Default::default()
                },
                Err(DiscoveryError::ProcessFailed),
            ),
            (
                os::Plan {
                    read_error: true,
                    kill_error: true,
                    ..Default::default()
                },
                Err(DiscoveryError::ProcessFailed),
            ),
            (
                os::Plan {
                    read_error: true,
                    pending_kill: true,
                    ..Default::default()
                },
                Err(DiscoveryError::ProcessFailed),
            ),
            (
                os::Plan {
                    wait_error: true,
                    ..Default::default()
                },
                Err(DiscoveryError::ProcessFailed),
            ),
            (
                os::Plan {
                    unsuccessful: true,
                    ..Default::default()
                },
                Err(DiscoveryError::ProcessFailed),
            ),
            (
                os::Plan {
                    pending_read: true,
                    ..Default::default()
                },
                Err(DiscoveryError::TimedOut),
            ),
            (
                os::Plan {
                    pending_wait: true,
                    ..Default::default()
                },
                Err(DiscoveryError::TimedOut),
            ),
            (
                os::Plan {
                    bytes: vec![b'x'; MAX_COMMAND_BYTES + 100],
                    ..Default::default()
                },
                Err(DiscoveryError::OutputTooLarge),
            ),
            (
                os::Plan {
                    bytes: vec![b'x'; MAX_COMMAND_BYTES],
                    ..Default::default()
                },
                Ok("x".repeat(MAX_COMMAND_BYTES)),
            ),
        ];
        for (plan, expected) in cases {
            let spawned = !plan.spawn_error;
            let failed = expected.is_err();
            os::install(os::Fixture {
                plans: [plan].into(),
                ..Default::default()
            });
            assert_eq!(run(run_command("synthetic", &[])), expected);
            os::inspect(|state| {
                assert_eq!(state.drops, usize::from(spawned));
                assert_eq!(state.kills, usize::from(spawned && failed));
                assert!(state.bytes_read <= MAX_COMMAND_BYTES + 1);
            });
        }
        for bytes in [
            vec![0xff],
            vec![],
            b"two\nlines".to_vec(),
            b"nul\0".to_vec(),
            b"tab\t".to_vec(),
        ] {
            os::install(os::Fixture {
                plans: [os::Plan {
                    bytes,
                    ..Default::default()
                }]
                .into(),
                ..Default::default()
            });
            assert_eq!(
                run(run_command("synthetic", &[])),
                Err(DiscoveryError::InvalidOutput)
            );
        }
    }
}
