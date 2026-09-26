use roll_tracker::acquisition::{
    CacheError, MAX_CACHE_BYTES, discover_cache_files, read_selected_cache,
};
use std::fs;

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
    let directory = std::env::temp_dir().join(format!("roll-tracker-cache-{}", std::process::id()));
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
fn discovers_windows_cache_layouts_in_numeric_version_order() {
    let directory =
        std::env::temp_dir().join(format!("roll-tracker-discovery-{}", std::process::id()));
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
    let paths = discover_cache_files(&directory).unwrap();
    assert_eq!(
        paths,
        [
            root.join(layouts[2]),
            root.join(layouts[1]),
            root.join(layouts[0])
        ]
    );
    assert_eq!(read_selected_cache(&paths[0]).unwrap().len(), 1);
    fs::remove_dir_all(directory).unwrap();
}
