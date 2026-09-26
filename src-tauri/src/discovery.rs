//! Bounded discovery from explicitly selected Windows player logs; no environment scans.
use crate::acquisition::{CacheError, open_selected_file};
use std::path::{Path, PathBuf};
use std::{
    collections::HashSet,
    io::{BufRead, BufReader, Read},
};

pub const MAX_LOG_HEADER_BYTES: usize = 64 * 1024;
const LOG_HEADER_LINES: usize = 11;

/// WSL automount roots are explicit because `/mnt` can be changed or disabled.
#[derive(Clone, Copy)]
pub enum PathMapping<'a> {
    Windows,
    Wsl { mount_root: &'a Path },
}

#[derive(Debug, PartialEq, Eq)]
pub enum LogError {
    Source(CacheError),
    InvalidText,
    UnsupportedPath,
    NoGameDataPath,
}

/// Keep each log's result visible; an unreadable current log must not hide a previous log.
/// Paths remain native-only and are not embedded in diagnostic text.
pub struct LogDiscovery {
    pub current: Result<Vec<PathBuf>, LogError>,
    pub previous: Result<Vec<PathBuf>, LogError>,
}

/// The caller supplies the host-native roaming AppData path, not a profile name.
/// WSL callers must translate that location explicitly before calling this service.
pub fn discover_appdata_logs(
    app_data: &Path,
    mapping: PathMapping<'_>,
) -> Result<LogDiscovery, LogError> {
    let parent = app_data.parent().ok_or(LogError::UnsupportedPath)?;
    let root = parent.join("LocalLow/Cognosphere/Star Rail");
    Ok(LogDiscovery {
        current: read_selected_log(&root.join("Player.log"), mapping),
        previous: read_selected_log(&root.join("Player-prev.log"), mapping),
    })
}

/// Only inspect the startup header; large later gameplay logs are irrelevant.
pub fn read_selected_log(path: &Path, mapping: PathMapping<'_>) -> Result<Vec<PathBuf>, LogError> {
    let mut file = open_selected_file(path).map_err(LogError::Source)?;
    read_header(&mut file, mapping)
}

fn read_header(reader: &mut dyn Read, mapping: PathMapping<'_>) -> Result<Vec<PathBuf>, LogError> {
    let mut reader = BufReader::new(reader.take((MAX_LOG_HEADER_BYTES + 1) as u64));
    let mut bytes = Vec::new();
    for _ in 0..LOG_HEADER_LINES {
        let count = reader
            .read_until(b'\n', &mut bytes)
            .map_err(|_| LogError::Source(CacheError::Unreadable))?;
        if bytes.len() > MAX_LOG_HEADER_BYTES {
            return Err(LogError::Source(CacheError::TooLarge));
        }
        if count == 0 {
            break;
        }
    }
    extract_game_data(&bytes, mapping)
}

fn extract_game_data(bytes: &[u8], mapping: PathMapping<'_>) -> Result<Vec<PathBuf>, LogError> {
    let text = std::str::from_utf8(bytes).map_err(|_| LogError::InvalidText)?;
    let text = text.trim_start_matches('\u{feff}');
    let mut paths = Vec::new();
    let mut seen = HashSet::new();
    for line in text.lines() {
        if let Some(value) = line.strip_prefix("Loading player data from ") {
            let path = map_game_data(value, mapping)?;
            if seen.insert(path.clone()) {
                paths.push(path);
            }
        }
    }
    if paths.is_empty() {
        return Err(LogError::NoGameDataPath);
    }
    Ok(paths)
}

/// Accept drive-absolute paths only; never interpret traversal, UNC or device paths.
fn map_game_data(value: &str, mapping: PathMapping<'_>) -> Result<PathBuf, LogError> {
    let normalized = value.replace('\\', "/");
    let (drive, tail) = normalized
        .split_once(":/")
        .ok_or(LogError::UnsupportedPath)?;
    if drive.len() != 1 || !drive.as_bytes()[0].is_ascii_alphabetic() {
        return Err(LogError::UnsupportedPath);
    }
    let directory = tail
        .strip_suffix("data.unity3d")
        .ok_or(LogError::UnsupportedPath)?;
    // An empty directory denotes a drive root. Otherwise require a filename boundary.
    if !directory.is_empty() && !directory.ends_with('/') {
        return Err(LogError::UnsupportedPath);
    }
    for component in directory.split_terminator('/') {
        if component.is_empty()
            || component.ends_with(['.', ' '])
            || component
                .chars()
                .any(|c| c.is_control() || "<>:\"|?*".contains(c))
        {
            return Err(LogError::UnsupportedPath);
        }
    }
    match mapping {
        PathMapping::Windows => Ok(PathBuf::from(format!(
            "{}:/{directory}",
            drive.to_ascii_uppercase()
        ))),
        PathMapping::Wsl { mount_root } => {
            let root = mount_root.to_str().ok_or(LogError::UnsupportedPath)?;
            if !root.starts_with('/')
                || root.contains('\\')
                || root.split('/').any(|part| matches!(part, "." | ".."))
            {
                return Err(LogError::UnsupportedPath);
            }
            Ok(mount_root.join(drive.to_ascii_lowercase()).join(directory))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn log(path: &str) -> Vec<u8> {
        format!("Loading player data from {path}\r\n").into_bytes()
    }

    #[test]
    fn preserves_windows_drive_paths_spaces_unicode_and_deduplicates() {
        let bytes = "\u{feff}other log entry\r\nLoading player data from d:\\Games\\Star Rail 星\\data.unity3d\r\nLoading player data from D:/Games/Star Rail 星/data.unity3d\r\nLoading player data from C:/data.unity3d\r\n";
        assert_eq!(
            extract_game_data(bytes.as_bytes(), PathMapping::Windows).unwrap(),
            [PathBuf::from("D:/Games/Star Rail 星"), PathBuf::from("C:/")]
        );
    }

    #[test]
    fn maps_windows_drives_only_under_an_explicit_wsl_mount_root() {
        let bytes = log("D:/Games/Star Rail/data.unity3d");
        for root in ["/mnt", "/windows", "/"] {
            let root = Path::new(root);
            assert_eq!(
                extract_game_data(&bytes, PathMapping::Wsl { mount_root: root }).unwrap(),
                [root.join("d/Games/Star Rail")]
            );
        }
    }

    #[test]
    fn headers_are_line_and_byte_bounded() {
        let record = log("C:/Games/data.unity3d");
        let mut header = b"ignored
"
        .repeat(LOG_HEADER_LINES - 1);
        header.extend(&record);
        let mut large_log = header.clone();
        large_log.extend(vec![0xff; MAX_LOG_HEADER_BYTES * 2]);
        let mut cursor = std::io::Cursor::new(large_log);
        assert_eq!(
            read_header(&mut cursor, PathMapping::Windows).unwrap(),
            [PathBuf::from("C:/Games")]
        );
        assert!(cursor.position() <= (MAX_LOG_HEADER_BYTES + 1) as u64);
        let mut late = b"ignored
"
        .repeat(LOG_HEADER_LINES);
        late.extend(&record);
        assert_eq!(
            read_header(&mut late.as_slice(), PathMapping::Windows),
            Err(LogError::NoGameDataPath)
        );
        let mut exact = record.clone();
        exact.resize(MAX_LOG_HEADER_BYTES, b'x');
        assert_eq!(
            read_header(&mut exact.as_slice(), PathMapping::Windows).unwrap(),
            [PathBuf::from("C:/Games")]
        );
        exact.push(b'x');
        assert_eq!(
            read_header(&mut exact.as_slice(), PathMapping::Windows),
            Err(LogError::Source(CacheError::TooLarge))
        );
    }

    #[test]
    fn appdata_location_and_independent_log_results_use_mocked_files() {
        use crate::acquisition::tests::filesystem::{self, Fixture};
        let app_data = Path::new("selected/AppData/Roaming");
        let root = Path::new("selected/AppData/LocalLow/Cognosphere/Star Rail");
        let current = root.join("Player.log");
        let previous = root.join("Player-prev.log");
        let bytes = log("D:/Games/data.unity3d");
        filesystem::install(Fixture {
            files: [(previous.clone(), bytes.clone())].into(),
            ..Default::default()
        });
        let result = discover_appdata_logs(app_data, PathMapping::Windows).unwrap();
        assert_eq!(
            result.current,
            Err(LogError::Source(CacheError::Unreadable))
        );
        assert_eq!(result.previous.unwrap(), [PathBuf::from("D:/Games")]);
        filesystem::inspect(|state| {
            assert_eq!(state.files[&previous], bytes);
            assert!(
                state
                    .accessed
                    .iter()
                    .all(|path| path == &current || path == &previous)
            );
        });
        filesystem::install(Fixture {
            files: [(current, vec![])].into(),
            ..Default::default()
        });
        let result = discover_appdata_logs(app_data, PathMapping::Windows).unwrap();
        assert_eq!(result.current, Err(LogError::NoGameDataPath));
        assert_eq!(
            result.previous,
            Err(LogError::Source(CacheError::Unreadable))
        );
        assert!(matches!(
            discover_appdata_logs(Path::new(""), PathMapping::Windows),
            Err(LogError::UnsupportedPath)
        ));
    }

    #[test]
    fn malformed_headers_and_paths_never_return_partial_candidates() {
        assert_eq!(
            extract_game_data(&[0xff], PathMapping::Windows),
            Err(LogError::InvalidText)
        );
        for path in [
            "",
            "C:data.unity3d",
            "/Games/data.unity3d",
            "//host/share/data.unity3d",
            "1:/data.unity3d",
            "C:/Games/../data.unity3d",
            "C:/./data.unity3d",
            "C:/Games//data.unity3d",
            "C:/Games/other",
            "C:/Games/notdata.unity3d",
            "CD:/data.unity3d",
            "C:/bad:/data.unity3d",
            "C:/bad /data.unity3d",
            "C:/bad?/data.unity3d",
            "C:/bad./data.unity3d",
            "C:/bad /data.unity3d",
        ] {
            let mut bytes = log("C:/Valid/data.unity3d");
            bytes.extend(log(path));
            assert_eq!(
                extract_game_data(&bytes, PathMapping::Windows),
                Err(LogError::UnsupportedPath),
                "{path}"
            );
        }
        for root in ["relative", "/mnt/../other", "/mnt/./other", "/mnt\\other"] {
            assert_eq!(
                extract_game_data(
                    &log("C:/data.unity3d"),
                    PathMapping::Wsl {
                        mount_root: Path::new(root)
                    }
                ),
                Err(LogError::UnsupportedPath)
            );
        }
        assert_eq!(
            extract_game_data(
                b"prefix Loading player data from C:/data.unity3d",
                PathMapping::Windows
            ),
            Err(LogError::NoGameDataPath)
        );
    }

    #[cfg(unix)]
    #[test]
    fn non_utf8_mount_roots_are_rejected() {
        use std::{ffi::OsStr, os::unix::ffi::OsStrExt};
        assert_eq!(
            extract_game_data(
                &log("C:/data.unity3d"),
                PathMapping::Wsl {
                    mount_root: Path::new(OsStr::from_bytes(b"/mnt/\xff"))
                }
            ),
            Err(LogError::UnsupportedPath)
        );
    }

    #[test]
    fn read_failures_are_redacted() {
        struct Broken;
        impl std::io::Read for Broken {
            fn read(&mut self, _: &mut [u8]) -> std::io::Result<usize> {
                Err(std::io::Error::other("private source"))
            }
        }
        assert_eq!(
            read_header(&mut Broken, PathMapping::Windows),
            Err(LogError::Source(CacheError::Unreadable))
        );
        assert_eq!(
            read_header(&mut &b""[..], PathMapping::Windows),
            Err(LogError::NoGameDataPath)
        );
    }
}
