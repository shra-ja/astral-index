//! Cursor pagination over the six known categories from a validated context.
use super::{
    Category, Cursor, FetchFailure, PAGE_SIZE, RequestContext, Transport, parse_body,
    transport_failure,
};
use crate::MAX_BATCH_BYTES;
use std::{cmp::Ordering, collections::HashSet, fmt, num::NonZeroU32, time::Duration};

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
}

/// Receives progress as it happens. It must return quickly.
pub type Report<'a> = &'a (dyn Fn(Progress) + Sync);

/// Why history retrieval stopped. No URL, credential or response text is included.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AcquisitionError {
    Fetch(FetchFailure),
    /// A full page's last record repeated an earlier cursor in its category.
    CursorCycle,
    /// The responses together exceeded the 16 MiB batch bound; fetching stopped.
    TooLarge,
}
impl From<FetchFailure> for AcquisitionError {
    fn from(failure: FetchFailure) -> Self {
        Self::Fetch(failure)
    }
}

/// Every response body retrieved, in request order, for an import preview.
/// Holds player data: never log or display it.
pub struct History {
    responses: Vec<Vec<u8>>,
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
}

/// Fetch every page of all six categories, in order. Call only on an explicit
/// user request, with a context that passed validation.
///
/// Each category starts at page 1 with no cursor. A page with fewer records than
/// requested, including none, is its last. A full page advances the page and the
/// cursor, which is its last record's ID; a cursor seen before in the category is
/// a cycle. A page with more records than requested is invalid. Any failure stops
/// retrieval, as does passing the batch bound, before a further request.
pub async fn fetch_history(
    transport: &impl Transport,
    context: &RequestContext,
    report: Report<'_>,
) -> Result<History, AcquisitionError> {
    let mut responses = Vec::new();
    let mut total = 0;
    let mut records_received = 0;
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
            let mut records = parse_body(&body)?.list;
            total += body.len();
            if total > MAX_BATCH_BYTES {
                return Err(AcquisitionError::TooLarge);
            }
            responses.push(body);
            records_received += records.len();
            match records.len().cmp(&PAGE_SIZE) {
                Ordering::Less => break,
                Ordering::Equal => {
                    let roll = records.swap_remove(PAGE_SIZE - 1);
                    if !cursors.insert(roll.id.clone()) {
                        return Err(AcquisitionError::CursorCycle);
                    }
                    last = Some(roll);
                    page = page.saturating_add(1);
                }
                Ordering::Greater => return Err(FetchFailure::InvalidResponse.into()),
            }
        }
    }
    Ok(History { responses })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::MAX_BATCH_BYTES;
    use crate::acquisition::tests::scripted::{Scripted, ignore};
    use crate::acquisition::{
        Category, ENDPOINT, PAGE_SIZE, TransportError, extract_request_contexts,
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
        format!(
            "{ENDPOINT}authkey=synthetic&authkey_ver=1&sign_type=2&game_biz=hkrpg_global&lang=en&gacha_type={}&page={page}&size={PAGE_SIZE}&end_id={end_id}",
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
            "data": { "page": "1", "size": "1000", "region": "synthetic-server",
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
    fn fetches_each_category_in_order_until_a_short_page() {
        let bodies: Vec<_> = Category::ALL
            .into_iter()
            .enumerate()
            .map(|(index, category)| body(category, index as u64..index as u64 * 2, None))
            .collect();
        let transport = scripted(&bodies);
        let history = run(fetch_history(&transport, &context(), &ignore)).unwrap();
        assert_eq!(
            transport.requested(),
            Category::ALL.map(|category| url(category, 1, "0")).to_vec()
        );
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
        ];
        bodies.extend(empty_after(Category::Stellar));
        let events = std::sync::Mutex::new(Vec::new());
        let report = |progress| events.lock().unwrap().push(progress);
        run(fetch_history(&scripted(&bodies), &context(), &report)).unwrap();
        let requesting = |category, page, pages, records| Progress::Requesting {
            category,
            page: NonZeroU32::new(page).unwrap(),
            pages,
            records,
        };
        let events = events.into_inner().unwrap();
        assert_eq!(
            events[..3],
            [
                requesting(Category::Stellar, 1, 0, 0),
                requesting(Category::Stellar, 2, 1, 1000),
                requesting(Category::Departure, 1, 2, 1002),
            ]
        );
        assert_eq!(
            events[6..],
            [requesting(Category::LightConeCollaboration, 1, 6, 1002)]
        );
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
        let history = run(fetch_history(&transport, &context(), &ignore)).unwrap();
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
                run(fetch_history(&transport, &context(), &ignore)).unwrap_err(),
                AcquisitionError::CursorCycle
            );
            assert_eq!(transport.requested().len(), bodies.len());
        }
        // The same record ID in another category is not a cycle.
        let mut bodies = vec![full(Category::Stellar, 1), empty(Category::Stellar)];
        bodies.extend([full(Category::Departure, 1), empty(Category::Departure)]);
        bodies.extend(empty_after(Category::Departure));
        assert!(run(fetch_history(&scripted(&bodies), &context(), &ignore)).is_ok());
    }

    #[test]
    fn pages_larger_than_requested_are_invalid() {
        let transport = scripted(&[body(Category::Stellar, 0..PAGE_SIZE as u64 + 1, None)]);
        assert_eq!(
            run(fetch_history(&transport, &context(), &ignore)).unwrap_err(),
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
                run(fetch_history(&transport, &context(), &ignore)).unwrap_err(),
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
        assert!(run(fetch_history(&scripted(&bodies), &context(), &ignore)).is_ok());
        // Eight full 2 MiB pages reach it, so the next response stops retrieval
        // before any further request.
        let mut bodies = padded_full(8);
        bodies.push(empty(category));
        bodies.extend(rest);
        let transport = scripted(&bodies);
        assert_eq!(
            run(fetch_history(&transport, &context(), &ignore)).unwrap_err(),
            AcquisitionError::TooLarge
        );
        assert_eq!(transport.requested().len(), 9);
    }
}
