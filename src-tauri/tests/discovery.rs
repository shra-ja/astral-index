use roll_tracker::{
    acquisition::CacheError,
    discovery::{
        LogError, MAX_LOG_HEADER_BYTES, PathMapping, discover_appdata_logs, read_selected_log,
    },
};
use std::fs;

#[test]
fn real_appdata_logs_are_read_only_and_previous_survives_current_failure() {
    let directory = std::env::temp_dir().join(format!("roll-tracker-logs-{}", std::process::id()));
    let app_data = directory.join("AppData/Roaming");
    let logs = directory.join("AppData/LocalLow/Cognosphere/Star Rail");
    fs::create_dir_all(&logs).unwrap();
    let current = logs.join("Player.log");
    let previous = logs.join("Player-prev.log");
    let mut bytes = b"Loading player data from D:\\Games\\Star Rail\\data.unity3d\r\n".to_vec();
    bytes.extend(b"other\n".repeat(10));
    bytes.extend(vec![0xff; MAX_LOG_HEADER_BYTES * 2]);
    fs::write(&previous, &bytes).unwrap();
    fs::write(&current, [0xff]).unwrap();
    let result = discover_appdata_logs(&app_data, PathMapping::Windows).unwrap();
    assert_eq!(result.current, Err(LogError::InvalidText));
    assert_eq!(
        result.previous.unwrap(),
        [std::path::PathBuf::from("D:/Games/Star Rail")]
    );
    assert_eq!(fs::read(&previous).unwrap(), bytes);
    assert_eq!(fs::read(&current).unwrap(), [0xff]);
    fs::remove_file(&current).unwrap();
    assert_eq!(
        discover_appdata_logs(&app_data, PathMapping::Windows)
            .unwrap()
            .current,
        Err(LogError::Source(CacheError::Unreadable))
    );
    // Windows can reject a directory at open; Unix can reject its opened type.
    assert!(matches!(
        read_selected_log(&logs, PathMapping::Windows),
        Err(LogError::Source(
            CacheError::NotRegularFile | CacheError::Unreadable
        ))
    ));
    fs::remove_dir_all(directory).unwrap();
}

#[cfg(unix)]
#[test]
fn explicit_wsl_mapping_connects_log_candidates_to_selected_cache_reading() {
    use roll_tracker::acquisition::{discover_cache_files, read_selected_cache};
    let mount = std::env::temp_dir().join(format!("roll-tracker-mount-{}", std::process::id()));
    let game = mount.join("d/Games/Star Rail");
    let cache = game.join("webCaches/2.10.0.0/Cache/Cache_Data/data_2");
    fs::create_dir_all(cache.parent().unwrap()).unwrap();
    let bytes = b"1/0/https://public-operation-hkrpg-sg.hoyoverse.com/common/hkrpg_gacha_record/api/getGachaLog?authkey=synthetic&authkey_ver=1&sign_type=2&game_biz=hkrpg_global&lang=en\0";
    fs::write(&cache, bytes).unwrap();
    let log = mount.join("Player.log");
    fs::write(
        &log,
        b"Loading player data from D:/Games/Star Rail/data.unity3d\n",
    )
    .unwrap();
    let candidates = read_selected_log(&log, PathMapping::Wsl { mount_root: &mount }).unwrap();
    assert_eq!(candidates, [game]);
    let files = discover_cache_files(&candidates[0]).unwrap();
    assert_eq!(files, std::slice::from_ref(&cache));
    assert_eq!(read_selected_cache(&files[0]).unwrap().len(), 1);
    assert_eq!(fs::read(cache).unwrap(), bytes);
    fs::remove_dir_all(mount).unwrap();
}
