//! Local request-context extraction; selecting a cache never initiates a request.
#[cfg(test)]
use self::tests::filesystem as fs;
#[cfg(not(test))]
use std::fs;
#[cfg(all(unix, not(test)))]
use std::os::unix::fs::OpenOptionsExt;
use std::{collections::HashSet, fmt, io::Read, path::Path};

mod cancel;
mod outcome;
mod pagination;
mod request;
mod retry;
mod transport;
mod validation;
pub use cancel::Cancellable;
pub use outcome::{FetchFailure, classify, parse_body, transport_failure};
pub use pagination::{AcquisitionError, History, fetch_history};
pub use request::{Category, Cursor, PAGE_SIZE, PageRequest};
pub use retry::{MAX_RETRIES, RETRY_DELAY, RetryBudget, Retrying};
pub use transport::{CONNECT_TIMEOUT, HttpTransport, REQUEST_TIMEOUT, Transport, TransportError};
pub use validation::{MAX_VALIDATED_CONTEXTS, validate};

pub const MAX_CACHE_BYTES: usize = 16 * 1024 * 1024;
const ENDPOINT: &str =
    "https://public-operation-hkrpg-sg.hoyoverse.com/common/hkrpg_gacha_record/api/getGachaLog?";

/// Opaque native-only credentials. Never serialize this value into webview state.
#[derive(PartialEq, Eq)]
pub struct RequestContext {
    fields: Vec<String>,
}
impl fmt::Debug for RequestContext {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("RequestContext([redacted])")
    }
}

/// An extracted context with its cached request URL, which validation sends unchanged.
/// Hold it only until validation ends; afterwards keep at most the validated context.
#[derive(PartialEq, Eq)]
pub struct CachedRequest {
    context: RequestContext,
    url: String,
}
impl fmt::Debug for CachedRequest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("CachedRequest([redacted])")
    }
}
impl CachedRequest {
    /// The credential-bearing cached URL, already checked against the endpoint.
    /// Crate-private so only native acquisition code can read it. Never log or display it.
    pub(crate) fn url(&self) -> &str {
        &self.url
    }
    /// Drop the cached URL, keeping only the credentials for new page requests.
    pub fn into_context(self) -> RequestContext {
        self.context
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum CacheError {
    Unreadable,
    NotRegularFile,
    TooLarge,
    NoSupportedRequest,
    NoCacheFound,
}

/// Resolve documented layouts only beneath a selected Windows game-data directory.
/// Auth keys last about a day, so only the latest and previous game versions can
/// hold a valid key; the previous one only just after an update. Only versioned
/// `webCaches/<version>` folders are supported.
pub fn discover_cache_files(game_data: &Path) -> Result<Vec<std::path::PathBuf>, CacheError> {
    let root = game_data.join("webCaches");
    let mut entries = fs::read_dir(&root).map_err(unreadable)?;
    resolve_cache_entries(&mut entries)
}

const CACHE_VERSIONS: usize = 2;

// Separate enumeration to exercise mid-directory I/O failures without OS races.
fn resolve_cache_entries(
    entries: &mut dyn Iterator<Item = std::io::Result<fs::DirEntry>>,
) -> Result<Vec<std::path::PathBuf>, CacheError> {
    let mut versions = Vec::new();
    for entry in entries {
        let entry = entry.map_err(unreadable)?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let parts: Vec<_> = name.split('.').collect();
        if parts.len() != 4 {
            continue;
        }
        let version: Result<Vec<u32>, _> = parts.iter().map(|part| part.parse()).collect();
        // Version folders count even without a cache, so a missing latest cache
        // cannot promote an older version into the window.
        if let Ok(version) = version {
            let path = entry.path();
            if !fs::metadata(&path).is_ok_and(|metadata| metadata.is_file()) {
                versions.push((version, path));
            }
        }
    }
    versions.sort_by(|a, b| b.cmp(a));
    let paths: Vec<_> = versions
        .into_iter()
        .take(CACHE_VERSIONS)
        .map(|(_, path)| path.join("Cache/Cache_Data/data_2"))
        .filter(|path| fs::metadata(path).is_ok_and(|metadata| metadata.is_file()))
        .collect();
    if paths.is_empty() {
        return Err(CacheError::NoCacheFound);
    }
    Ok(paths)
}

fn unreadable(_: std::io::Error) -> CacheError {
    CacheError::Unreadable
}

/// Read only the explicitly selected regular file, bounding allocation even if it grows.
pub fn read_selected_cache(path: &Path) -> Result<Vec<CachedRequest>, CacheError> {
    read_cache(&mut open_selected_file(path)?)
}

// Shared regular-file boundary for selected caches and bounded player-log headers.
pub(crate) fn open_selected_file(path: &Path) -> Result<fs::File, CacheError> {
    let mut options = fs::OpenOptions::new();
    options.read(true);
    // Opening a FIFO must not wait for a writer before we can inspect its type.
    // Check the opened handle, so replacing the path cannot bypass validation.
    #[cfg(unix)]
    options.custom_flags(libc::O_NONBLOCK);
    let file = options.open(path).map_err(|_| CacheError::Unreadable)?;
    if !file.metadata().is_ok_and(|metadata| metadata.is_file()) {
        return Err(CacheError::NotRegularFile);
    }
    Ok(file)
}

fn read_cache(reader: &mut dyn Read) -> Result<Vec<CachedRequest>, CacheError> {
    let mut bytes = Vec::new();
    reader
        .take((MAX_CACHE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| CacheError::Unreadable)?;
    extract_request_contexts(&bytes)
}

/// Return distinct contexts in reverse file order, keeping each one's last position
/// and cached URL. Newer entries tend to sit later, but cache order is not
/// chronology or key validity.
pub fn extract_request_contexts(bytes: &[u8]) -> Result<Vec<CachedRequest>, CacheError> {
    if bytes.len() > MAX_CACHE_BYTES {
        return Err(CacheError::TooLarge);
    }
    let text = String::from_utf8_lossy(bytes);
    // Split forwards so segment boundaries match the researched method, then reverse.
    let segments: Vec<_> = text.split("1/0/").skip(1).collect();
    let mut contexts = Vec::new();
    let mut seen = HashSet::new();
    for segment in segments.into_iter().rev() {
        if let Some(request) = parse_candidate(segment)
            && seen.insert(request.context.fields.clone())
        {
            contexts.push(request);
        }
    }
    if contexts.is_empty() {
        return Err(CacheError::NoSupportedRequest);
    }
    Ok(contexts)
}

fn parse_candidate(segment: &str) -> Option<CachedRequest> {
    let (url, _) = segment.split_once('\0')?;
    // Exact wire spelling deliberately rejects userinfo, ports, fragments and path aliases.
    let query = url.strip_prefix(ENDPOINT)?;
    if query.contains('#') {
        return None;
    }
    let pairs: Vec<_> = query.split('&').collect();
    let mut fields = Vec::new();
    for name in ["authkey", "authkey_ver", "sign_type", "game_biz", "lang"] {
        let prefix = format!("{name}=");
        let mut matches = pairs.iter().filter_map(|pair| pair.strip_prefix(&prefix));
        let value = matches.next()?;
        if matches.next().is_some() || !encoded_value(value) {
            return None;
        }
        if name == "game_biz" && value != "hkrpg_global" {
            return None;
        }
        fields.push(format!("{prefix}{value}"));
    }
    Some(CachedRequest {
        context: RequestContext { fields },
        url: url.to_owned(),
    })
}

/// Keep original query encoding; accept only unreserved/form bytes and complete escapes.
fn encoded_value(value: &str) -> bool {
    if value.is_empty() {
        return false;
    }
    let mut bytes = value.bytes();
    while let Some(byte) = bytes.next() {
        if byte == b'%' {
            for _ in 0..2 {
                match bytes.next() {
                    Some(digit) if digit.is_ascii_hexdigit() => (),
                    _ => return false,
                }
            }
        } else if !byte.is_ascii_alphanumeric() && !b"-._~+".contains(&byte) {
            return false;
        }
    }
    true
}

#[cfg(test)]
pub(crate) mod tests {
    pub(crate) mod filesystem;
    pub(crate) mod scripted;
    pub(crate) use super::transport::tests::http;
    use super::*;
    use std::io::{self, Read};

    fn url(key: &str) -> String {
        format!(
            "{ENDPOINT}authkey={key}&authkey_ver=1&sign_type=2&game_biz=hkrpg_global&lang=en&size=5"
        )
    }
    fn cache(urls: &[String]) -> Vec<u8> {
        let mut bytes = vec![0xff, 0];
        for url in urls {
            bytes.extend_from_slice(format!("1/0/{url}\0ignored").as_bytes());
        }
        bytes
    }

    #[test]
    fn extracts_distinct_contexts_in_reverse_file_order() {
        let a = url("synthetic%2Bkey%3D");
        let b = url("another+synthetic");
        let c = url("third");
        let contexts = extract_request_contexts(&cache(&[b.clone(), a.clone(), b, c])).unwrap();
        let keys: Vec<_> = contexts
            .iter()
            .map(|request| &request.context.fields[0])
            .collect();
        assert_eq!(
            keys,
            [
                "authkey=third",
                "authkey=another+synthetic",
                "authkey=synthetic%2Bkey%3D"
            ]
        );
        assert_eq!(
            contexts[2].context.fields,
            [
                "authkey=synthetic%2Bkey%3D",
                "authkey_ver=1",
                "sign_type=2",
                "game_biz=hkrpg_global",
                "lang=en"
            ]
        );
        assert_eq!(
            format!("{:?}", contexts[0].context),
            "RequestContext([redacted])"
        );
    }

    #[test]
    fn keeps_each_contexts_cached_url_from_its_last_occurrence() {
        let first = format!("{}&gacha_type=11&page=1&end_id=0", url("synthetic"));
        let last = format!("{}&gacha_type=11&page=2&end_id=17", url("synthetic"));
        let other = url("other");
        let mut requests =
            extract_request_contexts(&cache(&[first, other.clone(), last.clone()])).unwrap();
        let urls: Vec<_> = requests.iter().map(CachedRequest::url).collect();
        assert_eq!(urls, [last.as_str(), other.as_str()]);
        assert_eq!(format!("{:?}", requests[0]), "CachedRequest([redacted])");
        let context = requests.remove(1).into_context();
        assert_eq!(context.fields[0], "authkey=other");
    }

    #[test]
    fn refuses_unsupported_or_ambiguous_urls_without_echoing_source() {
        let valid = url("synthetic");
        let invalid = [
            "".to_owned(),
            valid.replace("https:", "http:"),
            valid.replace(".com/", ".com.evil/"),
            valid.replace(".com/", ".com:443/"),
            valid.replace("https://", "https://user@"),
            valid.replace("getGachaLog?", "getGachaLog/../getGachaLog?"),
            format!("{valid}#secret"),
            valid.replace("authkey=synthetic&", ""),
            valid.replace("authkey=synthetic", "authkey="),
            valid.replace("hkrpg_global", "other"),
            format!("{valid}&authkey=other"),
            format!("{valid}&lang=en"),
            valid.replace("authkey=synthetic", "authkey"),
            valid.replace("authkey=synthetic", "auth%6bey=synthetic"),
            url("bad%"),
            url("bad%0"),
            url("bad%GG"),
            url("bad%0G"),
            url("bad key"),
            url("bad\nkey"),
            url("bad=key"),
            url("é"),
        ];
        for candidate in invalid {
            assert_eq!(
                extract_request_contexts(&cache(std::slice::from_ref(&candidate))),
                Err(CacheError::NoSupportedRequest),
                "synthetic case: {candidate}"
            );
        }
        assert_eq!(
            extract_request_contexts(&vec![0; MAX_CACHE_BYTES + 1]),
            Err(CacheError::TooLarge)
        );
        assert_eq!(
            extract_request_contexts(&[]),
            Err(CacheError::NoSupportedRequest)
        );
        assert!(extract_request_contexts(&cache(&["unrelated".into(), valid])).is_ok());
    }

    #[test]
    fn read_failures_and_truncated_candidates_are_safe() {
        struct Broken;
        impl Read for Broken {
            fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
                Err(io::Error::other("private source detail"))
            }
        }
        assert_eq!(read_cache(&mut Broken), Err(CacheError::Unreadable));
        assert_eq!(
            extract_request_contexts(format!("1/0/{}", url("synthetic")).as_bytes()),
            Err(CacheError::NoSupportedRequest)
        );
        assert_eq!(
            extract_request_contexts(&vec![0; MAX_CACHE_BYTES]),
            Err(CacheError::NoSupportedRequest)
        );
        assert!(extract_request_contexts(&cache(&[url("a-._~z09%ab")])).is_ok());
    }

    #[test]
    fn directory_enumeration_failure_never_returns_partial_candidates() {
        assert_eq!(
            resolve_cache_entries(&mut [Err(io::Error::other("private path"))].into_iter()),
            Err(CacheError::Unreadable)
        );
    }
    #[test]
    fn selected_reads_are_bounded_read_only_and_report_io_failures() {
        let path = Path::new("selected/data_2");
        let bytes = cache(&[url("synthetic")]);
        filesystem::install(filesystem::Fixture {
            files: [(path.to_owned(), bytes.clone())].into(),
            ..Default::default()
        });
        assert_eq!(read_selected_cache(path).unwrap().len(), 1);
        filesystem::inspect(|state| {
            assert_eq!(state.files[path], bytes);
            assert_eq!(state.reads, bytes.len());
            assert!(state.accessed.iter().all(|accessed| accessed == path));
        });
        assert_eq!(
            read_selected_cache(Path::new("missing")),
            Err(CacheError::Unreadable)
        );
        filesystem::install(filesystem::Fixture {
            directories: vec![path.to_owned()],
            ..Default::default()
        });
        assert_eq!(read_selected_cache(path), Err(CacheError::NotRegularFile));
        filesystem::install(filesystem::Fixture {
            files: [(path.to_owned(), bytes)].into(),
            metadata_failure: true,
            ..Default::default()
        });
        assert_eq!(read_selected_cache(path), Err(CacheError::NotRegularFile));
        filesystem::install(filesystem::Fixture {
            files: [(path.to_owned(), vec![0; MAX_CACHE_BYTES + 100])].into(),
            ..Default::default()
        });
        assert_eq!(read_selected_cache(path), Err(CacheError::TooLarge));
        assert_eq!(
            filesystem::inspect(|state| state.reads),
            MAX_CACHE_BYTES + 1
        );
    }

    #[test]
    fn discovery_checks_only_the_two_newest_version_folders() {
        let directory = Path::new("selected");
        let root = directory.join("webCaches");
        filesystem::install(Default::default());
        assert_eq!(discover_cache_files(directory), Err(CacheError::Unreadable));
        filesystem::install(filesystem::Fixture {
            entries: Some(vec![]),
            ..Default::default()
        });
        assert_eq!(
            discover_cache_files(directory),
            Err(CacheError::NoCacheFound)
        );
        let legacy = root.join("Cache/Cache_Data/data_2");
        let oldest = root.join("2.9.0.0/Cache/Cache_Data/data_2");
        let previous = root.join("2.10.0.0/Cache/Cache_Data/data_2");
        let latest = root.join("3.0.0.0/Cache/Cache_Data/data_2");
        let entries = |names: &[&str]| {
            Some(
                names
                    .iter()
                    .map(|name| Ok(filesystem::DirEntry(root.join(name))))
                    .collect(),
            )
        };
        // A file with a version-like name is not a version folder.
        filesystem::install(filesystem::Fixture {
            entries: entries(&[
                "Cache",
                "2.9.0.0",
                "3.0.0.0",
                "2.10.0.0",
                "4.x.0.0",
                "5.0.0.0",
                "9999999999999999999.0.0.0",
            ]),
            files: [
                (legacy.clone(), vec![]),
                (oldest.clone(), vec![]),
                (previous.clone(), vec![]),
                (latest.clone(), vec![]),
                (root.join("5.0.0.0"), vec![]),
            ]
            .into(),
            ..Default::default()
        });
        assert_eq!(
            discover_cache_files(directory).unwrap(),
            [latest.clone(), previous.clone()]
        );
        filesystem::inspect(|state| {
            assert!(state.accessed.iter().all(|path| path.starts_with(&root)));
            assert!(!state.accessed.contains(&oldest));
            assert!(!state.accessed.contains(&legacy));
        });
        // Without the latest file, the previous version is the only candidate.
        filesystem::install(filesystem::Fixture {
            entries: entries(&["2.9.0.0", "3.0.0.0", "2.10.0.0"]),
            files: [(oldest.clone(), vec![]), (previous.clone(), vec![])].into(),
            ..Default::default()
        });
        assert_eq!(discover_cache_files(directory).unwrap(), [previous]);
        // Caches older than the previous version are never used, nor is legacy.
        filesystem::install(filesystem::Fixture {
            entries: entries(&["2.9.0.0", "3.0.0.0", "2.10.0.0"]),
            files: [(legacy.clone(), vec![]), (oldest, vec![])].into(),
            ..Default::default()
        });
        assert_eq!(
            discover_cache_files(directory),
            Err(CacheError::NoCacheFound)
        );
        // The unversioned layout is unsupported, even without version folders.
        filesystem::install(filesystem::Fixture {
            entries: entries(&["Cache", "4.x.0.0"]),
            files: [(legacy.clone(), vec![])].into(),
            ..Default::default()
        });
        assert_eq!(
            discover_cache_files(directory),
            Err(CacheError::NoCacheFound)
        );
        filesystem::inspect(|state| assert!(!state.accessed.contains(&legacy)));
    }
}
