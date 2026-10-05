use astral_index::acquisition::{
    CacheError, MAX_CACHE_BYTES, discover_cache_files, read_selected_cache,
};
use std::fs;

// Run potentially blocking regressions in a child so failures cannot hang the suite.
fn bounded_child(name: &str, seconds: u64, path: Option<&std::path::Path>) {
    use std::{
        process::Command,
        time::{Duration, Instant},
    };
    let mut command = Command::new(std::env::current_exe().unwrap());
    command
        .args(["--exact", name, "--nocapture"])
        .env("ASTRAL_INDEX_ACQUISITION_CHILD", "1");
    if let Some(path) = path {
        command.env("ASTRAL_INDEX_FIFO_PATH", path);
    }
    let mut child = command.spawn().unwrap();
    let start = Instant::now();
    loop {
        if let Some(status) = child.try_wait().unwrap() {
            assert!(status.success(), "acquisition regression child failed");
            return;
        }
        if start.elapsed() > Duration::from_secs(seconds) {
            child.kill().unwrap();
            child.wait().unwrap();
            panic!("{name} exceeded its {seconds}-second processing budget");
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[cfg(unix)]
#[test]
fn selected_fifo_is_rejected_without_waiting_for_a_writer() {
    if std::env::var_os("ASTRAL_INDEX_ACQUISITION_CHILD").is_some() {
        let path = std::env::var_os("ASTRAL_INDEX_FIFO_PATH").unwrap();
        assert_eq!(
            read_selected_cache(std::path::Path::new(&path)),
            Err(CacheError::NotRegularFile)
        );
        return;
    }
    let directory = std::env::temp_dir().join(format!("astral-index-fifo-{}", std::process::id()));
    fs::create_dir(&directory).unwrap();
    let path = directory.join("data_2");
    assert!(
        std::process::Command::new("mkfifo")
            .arg(&path)
            .status()
            .unwrap()
            .success()
    );
    let result = std::panic::catch_unwind(|| {
        bounded_child(
            "selected_fifo_is_rejected_without_waiting_for_a_writer",
            3,
            Some(&path),
        )
    });
    fs::remove_dir_all(directory).unwrap();
    result.unwrap();
}

#[test]
fn large_cache_deduplicates_within_processing_budget() {
    if std::env::var_os("ASTRAL_INDEX_ACQUISITION_CHILD").is_none() {
        bounded_child(
            "large_cache_deduplicates_within_processing_budget",
            10,
            None,
        );
        return;
    }
    use astral_index::acquisition::extract_request_contexts;
    let urls: Vec<_> = (0..80_000).map(|i| url(&format!("{i:08}"))).collect();
    let mut bytes = cache(&urls);
    bytes.extend(cache(&[urls[0].clone(), urls[79_999].clone()]));
    assert!(bytes.len() < MAX_CACHE_BYTES);
    let contexts = extract_request_contexts(&bytes).unwrap();
    assert_eq!(contexts.len(), urls.len());
    // Reverse order places the repeated tail first, then the remaining originals.
    for (position, index) in [(0, 79_999), (1, 0), (2, 79_998), (79_999, 1)] {
        let expected = extract_request_contexts(&cache(&[urls[index].clone()])).unwrap();
        assert_eq!(contexts[position], expected[0]);
    }
}

const ENDPOINT: &str =
    "https://public-operation-hkrpg-sg.hoyoverse.com/common/hkrpg_gacha_record/api/getGachaLog?";

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
fn selected_file_is_read_only_and_bounded() {
    let directory = std::env::temp_dir().join(format!("astral-index-cache-{}", std::process::id()));
    fs::create_dir_all(&directory).unwrap();
    let path = directory.join("data_2");
    let bytes = cache(&[url("synthetic")]);
    fs::write(&path, &bytes).unwrap();
    assert_eq!(read_selected_cache(&path).unwrap().len(), 1);
    assert_eq!(fs::read(&path).unwrap(), bytes);
    assert_eq!(
        read_selected_cache(&directory),
        Err(CacheError::NotRegularFile)
    );
    assert_eq!(
        read_selected_cache(&directory.join("missing")),
        Err(CacheError::Unreadable)
    );
    fs::File::create(&path)
        .unwrap()
        .set_len((MAX_CACHE_BYTES + 1) as u64)
        .unwrap();
    assert_eq!(read_selected_cache(&path), Err(CacheError::TooLarge));
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn discovers_only_the_two_newest_windows_cache_versions() {
    let directory =
        std::env::temp_dir().join(format!("astral-index-discovery-{}", std::process::id()));
    fs::create_dir_all(&directory).unwrap();
    assert_eq!(
        discover_cache_files(&directory),
        Err(CacheError::Unreadable)
    );
    let root = directory.join("webCaches");
    fs::create_dir(&root).unwrap();
    assert_eq!(
        discover_cache_files(&directory),
        Err(CacheError::NoCacheFound)
    );
    let layouts = [
        "Cache/Cache_Data/data_2",
        "2.9.0.0/Cache/Cache_Data/data_2",
        "2.10.0.0/Cache/Cache_Data/data_2",
    ];
    for layout in layouts {
        let path = root.join(layout);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, cache(&[url("synthetic")])).unwrap();
    }
    for invalid in [
        "3.0.0",
        "999999999999999999999.0.0.0",
        "4.x.0.0",
        "5.0.0.0.0",
        "6.0.0.0",
    ] {
        fs::create_dir(root.join(invalid)).unwrap();
    }
    fs::write(root.join("7.0.0.0"), b"not a directory").unwrap();
    // 6.0.0.0 and 2.10.0.0 are the two newest version folders; 6.0.0.0 has no cache.
    let paths = discover_cache_files(&directory).unwrap();
    assert_eq!(paths, [root.join(layouts[2])]);
    assert_eq!(read_selected_cache(&paths[0]).unwrap().len(), 1);
    fs::remove_dir(root.join("6.0.0.0")).unwrap();
    assert_eq!(
        discover_cache_files(&directory).unwrap(),
        [root.join(layouts[2]), root.join(layouts[1])]
    );
    fs::remove_dir_all(directory).unwrap();
}
