//! Retrieved history feeds a real import preview and commit unchanged.
use roll_tracker::acquisition::{
    Transport, TransportError, extract_request_contexts, fetch_history,
};
use roll_tracker::storage::{Store, Summary};
use std::{collections::VecDeque, sync::Mutex};

const PAGE: &[u8] = include_bytes!("fixtures/hsr-api/page.json");
const EMPTY: &[u8] =
    br#"{"retcode":0,"message":"OK","data":{"region":"synthetic-server","region_time_zone":8,"list":[]}}"#;

/// A public-API transport double; integration tests cannot use the crate's unit doubles.
struct Scripted(Mutex<VecDeque<&'static [u8]>>);
impl Transport for Scripted {
    async fn get(&self, _: &str) -> Result<Vec<u8>, TransportError> {
        Ok(self
            .0
            .lock()
            .unwrap()
            .pop_front()
            .expect("unscripted request")
            .to_vec())
    }
}

#[test]
fn retrieved_history_previews_and_commits_through_storage() {
    let cache = "1/0/https://public-operation-hkrpg-sg.hoyoverse.com/common/hkrpg_gacha_record/api/getGachaLog?authkey=synthetic&authkey_ver=1&sign_type=2&game_biz=hkrpg_global&lang=en\0";
    let context = extract_request_contexts(cache.as_bytes())
        .unwrap()
        .remove(0)
        .into_context();
    // The synthetic records sit in the character event category, third of six.
    let transport = Scripted(Mutex::new([EMPTY, EMPTY, PAGE, EMPTY, EMPTY, EMPTY].into()));
    let history = tokio::runtime::Builder::new_current_thread()
        .build()
        .unwrap()
        .block_on(fetch_history(&transport, &context, &|_| {}))
        .unwrap();
    assert!(transport.0.lock().unwrap().is_empty());

    let directory =
        std::env::temp_dir().join(format!("roll-tracker-pagination-{}", std::process::id()));
    std::fs::create_dir(&directory).unwrap();
    let mut store = Store::open(&directory.join("history.sqlite")).unwrap();
    // Preview under the account and server resolved from the responses.
    let account = history.account().unwrap();
    assert_eq!(
        (account.uid(), account.server()),
        ("100000002", "synthetic-server")
    );
    let preview = store
        .preview(account.uid(), account.server(), &history.responses())
        .unwrap();
    let expected = Summary {
        inserted: 2,
        ..Default::default()
    };
    assert_eq!(preview.summary(), expected);
    assert_eq!(store.commit(preview, 1).unwrap(), expected);
    assert_eq!(
        store
            .history("100000002", "synthetic-server")
            .unwrap()
            .len(),
        2
    );
    drop(store);
    std::fs::remove_dir_all(directory).unwrap();
}
