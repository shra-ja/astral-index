//! Cursor pagination over the six known categories from a validated context.
use super::{
    Category, Cursor, FetchFailure, PAGE_SIZE, RequestContext, Transport, parse_body,
    transport_failure,
};
use crate::MAX_BATCH_BYTES;
use std::{collections::HashSet, fmt, num::NonZeroU32, time::Duration};

/// Retrieval progress for the user deciding whether to stop. Categories and counts
/// only: no IDs, URLs or response text.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Progress {
    /// A page is about to be requested; `pages` and `records` count what has been
    /// received so far across all categories.
    Requesting {
        category: Category,
        page: NonZeroU32,
        pages: usize,
        records: usize,
    },
    /// A transiently failed request will be retried after `delay`.
    RetryPending { delay: Duration },
    /// A quick refresh ended the category at rolls already saved.
    UpToDate { category: Category },
}

/// Receives progress as it happens. It must return quickly.
pub type Report<'a> = &'a (dyn Fn(Progress) + Sync);

/// A quick refresh's stop check: whether any of a page's roll IDs is already saved
/// for the account with this UID and server
/// ([decision 0015](../../../docs/decisions/0015-incremental-retrieval.md)).
pub type StopCheck<'a> = &'a (dyn Fn(&str, &str, &[&str]) -> bool + Sync);

/// Why history retrieval stopped. No URL, credential or response text is included.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AcquisitionError {
    Fetch(FetchFailure),
    /// A full page's last record repeated an earlier cursor in its category.
    CursorCycle,
    /// The responses together exceeded the 16 MiB batch bound; fetching stopped.
    TooLarge,
    /// Records from a later page belong to a different account.
    MixedAccounts,
    /// A later page names a different server.
    MixedServers,
    /// Records were retrieved, but no page named their server.
    MissingServer,
}
impl From<FetchFailure> for AcquisitionError {
    fn from(failure: FetchFailure) -> Self {
        Self::Fetch(failure)
    }
}

/// The account and server retrieved history belongs to, from the responses.
/// Holds a player identifier: never log it.
#[derive(PartialEq, Eq)]
pub struct Account {
    uid: String,
    server: String,
}
impl fmt::Debug for Account {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Account([redacted])")
    }
}
impl Account {
    pub fn uid(&self) -> &str {
        &self.uid
    }
    pub fn server(&self) -> &str {
        &self.server
    }
}

/// Every response body retrieved, in request order, for an import preview.
/// Holds player data: never log or display it.
pub struct History {
    responses: Vec<Vec<u8>>,
    account: Option<Account>,
}
impl fmt::Debug for History {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("History([redacted])")
    }
}
impl History {
    /// The bodies in the form `Store::preview` takes.
    pub fn responses(&self) -> Vec<&[u8]> {
        self.responses.iter().map(Vec::as_slice).collect()
    }
    /// The account to preview under, or `None` when no records were retrieved:
    /// no history was found, which is not an error.
    pub fn account(&self) -> Option<&Account> {
        self.account.as_ref()
    }
}

/// Fetch every page of all six categories, in order. Call only on an explicit
/// user request, with a context that passed validation.
///
/// Each category starts at page 1 with no cursor, and only an empty page ends it:
/// the collaboration endpoint caps pages below the request, and the echoed `size`
/// is not reliable (the normal endpoint echoes "0"), so a short page is not taken
/// as the last. Any other page advances the page and the cursor, which is its last
/// record's ID; a cursor seen before in the category is a cycle. A page with more
/// records than requested is invalid. Any failure stops
/// retrieval, as does passing the batch bound, before a further request.
///
/// With a `stop` check (a quick refresh), a page with records whose server is
/// named also ends its category when the check finds one of its IDs saved for the
/// page's account; that page is kept and `Progress::UpToDate` reported.
pub async fn fetch_history(
    transport: &impl Transport,
    context: &RequestContext,
    report: Report<'_>,
    stop: Option<StopCheck<'_>>,
) -> Result<History, AcquisitionError> {
    let mut responses = Vec::new();
    let mut total = 0;
    let mut records_received = 0;
    let (mut uid, mut server) = (None, None);
    for category in Category::ALL {
        let mut cursors = HashSet::new();
        let mut last = None;
        let mut page = NonZeroU32::MIN;
        loop {
            report(Progress::Requesting {
                category,
                page,
                pages: responses.len(),
                records: records_received,
            });
            let cursor = last.as_ref().map_or(Cursor::Start, Cursor::After);
            let request = context.page_request(category, page, cursor);
            let body = transport
                .get(request.url())
                .await
                .map_err(transport_failure)?;
            let page_data = parse_body(&body)?;
            // The parser already requires one UID within a page.
            if !agrees(
                &mut uid,
                page_data.list.first().map(|roll| roll.uid.as_str()),
            ) {
                return Err(AcquisitionError::MixedAccounts);
            }
            if !agrees(&mut server, page_data.region.as_deref()) {
                return Err(AcquisitionError::MixedServers);
            }
            let region = page_data.region;
            let mut records = page_data.list;
            total += body.len();
            if total > MAX_BATCH_BYTES {
                return Err(AcquisitionError::TooLarge);
            }
            responses.push(body);
            records_received += records.len();
            if records.len() > PAGE_SIZE {
                return Err(FetchFailure::InvalidResponse.into());
            }
            let Some(roll) = records.pop() else {
                break;
            };
            // A quick refresh ends the category here, keeping this page, once the
            // page holds a roll saved for its own account; without a server the
            // account is unknown, so the page never ends it.
            let reached_saved = stop.zip(region.as_deref()).is_some_and(|(stop, server)| {
                let ids: Vec<&str> = records
                    .iter()
                    .chain([&roll])
                    .map(|record| record.id.as_str())
                    .collect();
                stop(&roll.uid, server, &ids)
            });
            if reached_saved {
                report(Progress::UpToDate { category });
                break;
            }
            if !cursors.insert(roll.id.clone()) {
                return Err(AcquisitionError::CursorCycle);
            }
            last = Some(roll);
            page = page.saturating_add(1);
        }
    }
    let account = match (uid, server) {
        (None, _) => None,
        (Some(uid), Some(server)) => Some(Account { uid, server }),
        (Some(_), None) => return Err(AcquisitionError::MissingServer),
    };
    Ok(History { responses, account })
}

/// Keep the first value seen; a later, different one is a mismatch. Absent values
/// are unknown, never a mismatch.
fn agrees(known: &mut Option<String>, value: Option<&str>) -> bool {
    match value {
        None => true,
        Some(value) => known.get_or_insert_with(|| value.to_owned()) == value,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::MAX_BATCH_BYTES;
    use crate::acquisition::tests::scripted::{Scripted, ignore};
    use crate::acquisition::{
        COLLABORATION_ENDPOINT, Category, ENDPOINT, PAGE_SIZE, TransportError,
        extract_request_contexts,
    };
    use serde_json::json;
    use std::{future::Future, ops::Range};

    fn run<T>(future: impl Future<Output = T>) -> T {
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(future)
    }
    fn context() -> RequestContext {
        let url = format!(
            "{ENDPOINT}authkey=synthetic&authkey_ver=1&sign_type=2&game_biz=hkrpg_global&lang=en"
        );
        extract_request_contexts(format!("1/0/{url}\0").as_bytes())
            .unwrap()
            .remove(0)
            .into_context()
    }
    /// The URL expected for a category's page after the given cursor.
    fn url(category: Category, page: u32, end_id: &str) -> String {
        let endpoint = match category.code() {
            "21" | "22" => COLLABORATION_ENDPOINT,
            _ => ENDPOINT,
        };
        format!(
            "{endpoint}authkey=synthetic&authkey_ver=1&sign_type=2&game_biz=hkrpg_global&lang=en&gacha_type={}&page={page}&size={PAGE_SIZE}&end_id={end_id}",
            category.code()
        )
    }
    fn id(number: u64) -> String {
        format!("{number:019}")
    }
    /// A page of records with the given IDs, padded with trailing whitespace to `size`.
    fn body(category: Category, ids: Range<u64>, size: Option<usize>) -> Vec<u8> {
        let list: Vec<_> = ids
            .map(|number| {
                json!({
                    "uid": "100000001", "id": id(number), "gacha_id": "1001",
                    "gacha_type": category.code(), "item_id": "1001", "count": "1",
                    "time": "2026-01-01 00:00:00", "name": "Synthetic", "lang": "en",
                    "item_type": "Character", "rank_type": "3",
                })
            })
            .collect();
        let mut bytes = serde_json::to_vec(&json!({
            "retcode": 0, "message": "OK",
            "data": { "page": "1", "size": "0", "region": "synthetic-server",
                      "region_time_zone": 8, "list": list },
        }))
        .unwrap();
        if let Some(size) = size {
            bytes.resize(size, b' ');
        }
        bytes
    }
    fn full(category: Category, first: u64) -> Vec<u8> {
        body(category, first..first + PAGE_SIZE as u64, None)
    }
    fn empty(category: Category) -> Vec<u8> {
        body(category, 0..0, None)
    }
    /// Empty pages for every category after `category`.
    fn empty_after(category: Category) -> Vec<Vec<u8>> {
        Category::ALL
            .into_iter()
            .skip_while(|other| *other != category)
            .skip(1)
            .map(empty)
            .collect()
    }
    fn scripted(bodies: &[Vec<u8>]) -> Scripted {
        Scripted::new(bodies.iter().cloned().map(Ok).collect())
    }

    #[test]
    fn fetches_each_category_in_order_until_an_empty_page() {
        // Stellar has no records; each later category has some, then an empty page.
        let mut bodies = vec![empty(Category::Stellar)];
        let mut expected = vec![url(Category::Stellar, 1, "0")];
        for (index, category) in Category::ALL.into_iter().enumerate().skip(1) {
            let first = index as u64;
            bodies.extend([body(category, first..first * 2, None), empty(category)]);
            expected.extend([url(category, 1, "0"), url(category, 2, &id(first * 2 - 1))]);
        }
        let transport = scripted(&bodies);
        let history = run(fetch_history(&transport, &context(), &ignore, None)).unwrap();
        assert_eq!(transport.requested(), expected);
        assert_eq!(
            history.responses(),
            bodies.iter().map(Vec::as_slice).collect::<Vec<_>>()
        );
        assert_eq!(format!("{history:?}"), "History([redacted])");
    }

    #[test]
    fn reports_each_request_with_the_totals_received_so_far() {
        let mut bodies = vec![
            full(Category::Stellar, 1),
            body(Category::Stellar, 2001..2003, None),
            empty(Category::Stellar),
        ];
        bodies.extend(empty_after(Category::Stellar));
        let events = std::sync::Mutex::new(Vec::new());
        let report = |progress| events.lock().unwrap().push(progress);
        run(fetch_history(&scripted(&bodies), &context(), &report, None)).unwrap();
        let requesting = |category, page, pages, records| Progress::Requesting {
            category,
            page: NonZeroU32::new(page).unwrap(),
            pages,
            records,
        };
        let events = events.into_inner().unwrap();
        assert_eq!(
            events[..4],
            [
                requesting(Category::Stellar, 1, 0, 0),
                requesting(Category::Stellar, 2, 1, 1000),
                requesting(Category::Stellar, 3, 2, 1002),
                requesting(Category::Departure, 1, 3, 1002),
            ]
        );
        assert_eq!(
            events[7..],
            [requesting(Category::LightConeCollaboration, 1, 7, 1002)]
        );
    }

    #[test]
    fn a_stop_check_ends_a_category_at_its_first_page_with_saved_rolls() {
        // Stellar's second page holds a saved roll, so its third is never requested;
        // Departure has none saved and runs to its empty page.
        let mut bodies = vec![
            full(Category::Stellar, 1),
            body(Category::Stellar, 2001..2003, None),
            full(Category::Departure, 1),
            empty(Category::Departure),
        ];
        bodies.extend(empty_after(Category::Departure));
        let checked = std::sync::Mutex::new(Vec::new());
        let stop = |uid: &str, server: &str, ids: &[&str]| {
            checked
                .lock()
                .unwrap()
                .push((uid.to_owned(), server.to_owned(), ids.len()));
            // The recorded calls check the account; only the IDs decide here.
            ids.contains(&id(2002).as_str())
        };
        let events = std::sync::Mutex::new(Vec::new());
        let report = |progress| events.lock().unwrap().push(progress);
        let transport = scripted(&bodies);
        let history = run(fetch_history(&transport, &context(), &report, Some(&stop))).unwrap();
        let requested = transport.requested();
        assert_eq!(
            requested[..3],
            [
                url(Category::Stellar, 1, "0"),
                url(Category::Stellar, 2, &id(1000)),
                url(Category::Departure, 1, "0"),
            ]
        );
        // The page that reached saved rolls is kept for the preview.
        assert_eq!(history.responses().len(), bodies.len());
        // Each page with records is checked, with the page's account and every ID.
        let page = |ids| ("100000001".to_owned(), "synthetic-server".to_owned(), ids);
        assert_eq!(
            checked.into_inner().unwrap(),
            [page(1000), page(2), page(1000)]
        );
        let events = events.into_inner().unwrap();
        assert_eq!(
            events[2],
            Progress::UpToDate {
                category: Category::Stellar
            }
        );
        assert_eq!(
            events
                .iter()
                .filter(|event| matches!(event, Progress::UpToDate { .. }))
                .count(),
            1
        );
    }

    #[test]
    fn a_page_without_a_server_never_ends_a_category_early() {
        // Both Stellar pages hold rolls the check calls saved, but only the second
        // names its server, so only it is checked and ends the category.
        let mut bodies = vec![
            with_region(body(Category::Stellar, 1..3, None), json!(null)),
            body(Category::Stellar, 3..5, None),
        ];
        bodies.extend(empty_after(Category::Stellar));
        let checked = std::sync::Mutex::new(0);
        let stop = |_: &str, _: &str, _: &[&str]| {
            *checked.lock().unwrap() += 1;
            true
        };
        let transport = scripted(&bodies);
        run(fetch_history(&transport, &context(), &ignore, Some(&stop))).unwrap();
        let requested = transport.requested();
        assert_eq!(
            requested[..3],
            [
                url(Category::Stellar, 1, "0"),
                url(Category::Stellar, 2, &id(2)),
                url(Category::Departure, 1, "0"),
            ]
        );
        assert_eq!(*checked.lock().unwrap(), 1);
    }

    /// Change a page's `data` object.
    fn edit(bytes: Vec<u8>, change: impl FnOnce(&mut serde_json::Value)) -> Vec<u8> {
        let mut value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        change(&mut value["data"]);
        serde_json::to_vec(&value).unwrap()
    }
    fn with_uid(bytes: Vec<u8>, uid: &str) -> Vec<u8> {
        edit(bytes, |data| {
            for record in data["list"].as_array_mut().unwrap() {
                record["uid"] = json!(uid);
            }
        })
    }
    fn with_region(bytes: Vec<u8>, region: serde_json::Value) -> Vec<u8> {
        edit(bytes, |data| data["region"] = region)
    }

    #[test]
    fn the_account_comes_from_records_and_the_server_from_any_page() {
        // Only an empty page names the server; the others omit it.
        let mut bodies = vec![
            with_region(body(Category::Stellar, 1..3, None), json!(null)),
            with_region(empty(Category::Stellar), json!(null)),
            empty(Category::Departure),
        ];
        bodies.extend(
            empty_after(Category::Departure)
                .into_iter()
                .map(|page| with_region(page, json!(null))),
        );
        let history = run(fetch_history(&scripted(&bodies), &context(), &ignore, None)).unwrap();
        let account = history.account().unwrap();
        assert_eq!(
            (account.uid(), account.server()),
            ("100000001", "synthetic-server")
        );
        assert_eq!(format!("{account:?}"), "Account([redacted])");
    }

    #[test]
    fn no_records_means_no_history_rather_than_an_error() {
        let named = Category::ALL.map(empty).to_vec();
        let unnamed = Category::ALL.map(|category| with_region(empty(category), json!(null)));
        for bodies in [named, unnamed.to_vec()] {
            let history =
                run(fetch_history(&scripted(&bodies), &context(), &ignore, None)).unwrap();
            assert_eq!(history.account(), None);
            assert_eq!(history.responses().len(), 6);
        }
    }

    #[test]
    fn another_account_or_server_stops_retrieval() {
        let first = body(Category::Stellar, 1..3, None);
        for (second, error) in [
            (
                with_uid(body(Category::Stellar, 4..6, None), "100000009"),
                AcquisitionError::MixedAccounts,
            ),
            (
                with_region(empty(Category::Stellar), json!("other-server")),
                AcquisitionError::MixedServers,
            ),
        ] {
            let transport = scripted(&[first.clone(), second]);
            assert_eq!(
                run(fetch_history(&transport, &context(), &ignore, None)).unwrap_err(),
                error
            );
            assert_eq!(transport.requested().len(), 2);
        }
    }

    #[test]
    fn records_without_a_named_server_are_rejected() {
        let bodies = [
            body(Category::Stellar, 1..3, None),
            empty(Category::Stellar),
        ]
        .into_iter()
        .chain(empty_after(Category::Stellar))
        .map(|page| with_region(page, json!(null)))
        .collect::<Vec<_>>();
        assert_eq!(
            run(fetch_history(&scripted(&bodies), &context(), &ignore, None)).unwrap_err(),
            AcquisitionError::MissingServer
        );
    }

    fn with_size(bytes: Vec<u8>, size: serde_json::Value) -> Vec<u8> {
        edit(bytes, |data| data["size"] = size)
    }
    /// Empty pages for every category before `category`.
    fn empty_before(category: Category) -> Vec<Vec<u8>> {
        Category::ALL
            .into_iter()
            .take_while(|other| *other != category)
            .map(empty)
            .collect()
    }

    #[test]
    fn short_pages_continue_until_an_empty_page_whatever_size_is_echoed() {
        // The collaboration endpoint caps pages at 20 and echoes that; the normal
        // endpoint echoes "0". Neither echo ends a category early.
        let category = Category::CharacterCollaboration;
        let page = |ids, size| with_size(body(category, ids, None), size);
        let unsized_page = edit(body(category, 41..45, None), |data| {
            data.as_object_mut().unwrap().remove("size");
        });
        let mut bodies = empty_before(category);
        bodies.extend([
            page(1..21, json!("20")),
            page(21..41, json!("0")),
            unsized_page,
            empty(category),
        ]);
        bodies.extend(empty_after(category));
        let transport = scripted(&bodies);
        let history = run(fetch_history(&transport, &context(), &ignore, None)).unwrap();
        assert_eq!(
            transport.requested()[4..8],
            [
                url(category, 1, "0"),
                url(category, 2, &id(20)),
                url(category, 3, &id(40)),
                url(category, 4, &id(44)),
            ]
        );
        assert_eq!(history.responses().len(), bodies.len());
    }

    #[test]
    fn full_pages_advance_page_and_cursor_from_the_last_record() {
        let category = Category::Stellar;
        let mut bodies = vec![
            full(category, 1),
            full(category, 1001),
            // A full final page still needs the empty page after it.
            empty(category),
        ];
        bodies.extend(empty_after(category));
        let transport = scripted(&bodies);
        let history = run(fetch_history(&transport, &context(), &ignore, None)).unwrap();
        let requested = transport.requested();
        assert_eq!(
            requested[..3],
            [
                url(category, 1, "0"),
                url(category, 2, &id(1000)),
                url(category, 3, &id(2000)),
            ]
        );
        // The next category starts again from the first page.
        assert_eq!(requested[3], url(Category::Departure, 1, "0"));
        assert_eq!(history.responses().len(), bodies.len());
    }

    #[test]
    fn repeated_cursors_and_cycles_are_rejected() {
        let category = Category::CharacterEvent;
        let before = [empty(Category::Stellar), empty(Category::Departure)];
        // The same full page twice, then a cycle through two cursors.
        for pages in [
            vec![full(category, 1), full(category, 1)],
            vec![full(category, 1), full(category, 1001), full(category, 1)],
        ] {
            let bodies = [before.to_vec(), pages.clone()].concat();
            let transport = scripted(&bodies);
            assert_eq!(
                run(fetch_history(&transport, &context(), &ignore, None)).unwrap_err(),
                AcquisitionError::CursorCycle
            );
            assert_eq!(transport.requested().len(), bodies.len());
        }
        // The same record ID in another category is not a cycle.
        let mut bodies = vec![full(Category::Stellar, 1), empty(Category::Stellar)];
        bodies.extend([full(Category::Departure, 1), empty(Category::Departure)]);
        bodies.extend(empty_after(Category::Departure));
        assert!(run(fetch_history(&scripted(&bodies), &context(), &ignore, None)).is_ok());
    }

    #[test]
    fn pages_larger_than_requested_are_invalid() {
        let transport = scripted(&[body(Category::Stellar, 0..PAGE_SIZE as u64 + 1, None)]);
        assert_eq!(
            run(fetch_history(&transport, &context(), &ignore, None)).unwrap_err(),
            AcquisitionError::Fetch(FetchFailure::InvalidResponse)
        );
    }

    #[test]
    fn fetch_failures_stop_retrieval() {
        let expired = br#"{"retcode":-101,"message":"synthetic","data":null}"#.to_vec();
        for (response, failure) in [
            (Ok(expired), FetchFailure::ExpiredKey),
            (Ok(b"not json".to_vec()), FetchFailure::InvalidResponse),
            (Err(TransportError::Timeout), FetchFailure::Transient),
            (Err(TransportError::Status(429)), FetchFailure::RateLimited),
        ] {
            let transport = Scripted::new(vec![
                Ok(empty(Category::Stellar)),
                Ok(full(Category::Departure, 1)),
                response,
            ]);
            assert_eq!(
                run(fetch_history(&transport, &context(), &ignore, None)).unwrap_err(),
                AcquisitionError::Fetch(failure)
            );
            assert_eq!(transport.requested().len(), 3);
        }
    }

    #[test]
    fn responses_are_bounded_as_a_batch() {
        let category = Category::Stellar;
        let limit = crate::MAX_RESPONSE_BYTES;
        let padded_full = |pages: u64| -> Vec<_> {
            (0..pages)
                .map(|page| {
                    body(
                        category,
                        page * 1000 + 1..(page + 1) * 1000 + 1,
                        Some(limit),
                    )
                })
                .collect()
        };
        // Responses totalling exactly the bound are accepted.
        let rest = empty_after(category);
        let rest_size: usize = rest.iter().map(Vec::len).sum();
        let mut bodies = padded_full(7);
        bodies.push(body(category, 0..0, Some(limit - rest_size)));
        bodies.extend(rest.clone());
        assert_eq!(bodies.iter().map(Vec::len).sum::<usize>(), MAX_BATCH_BYTES);
        assert!(run(fetch_history(&scripted(&bodies), &context(), &ignore, None)).is_ok());
        // Eight full 2 MiB pages reach it, so the next response stops retrieval
        // before any further request.
        let mut bodies = padded_full(8);
        bodies.push(empty(category));
        bodies.extend(rest);
        let transport = scripted(&bodies);
        assert_eq!(
            run(fetch_history(&transport, &context(), &ignore, None)).unwrap_err(),
            AcquisitionError::TooLarge
        );
        assert_eq!(transport.requested().len(), 9);
    }
}
