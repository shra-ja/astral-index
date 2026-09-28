//! Pure HSR response parsing; no filesystem, network, or persistence access.

use crate::acquisition::Category;
use serde::{Deserialize, Serialize};

pub const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
/// Bound for all responses in one acquisition or import batch.
pub const MAX_BATCH_BYTES: usize = 16 * 1024 * 1024;

/// Distinguish actionable failures without exposing response contents.
#[derive(Debug, PartialEq, Eq)]
pub enum ParseError {
    TooLarge,
    InvalidResponse,
    Api(i64),
    InvalidContext,
    InvalidRecord,
    MixedAccounts,
}

/// Preserve source identity and fields losslessly for validation, merging and later export.
#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct Roll {
    #[serde(flatten)]
    pub extra: std::collections::BTreeMap<String, serde_json::Value>,
    pub uid: String,
    pub id: String,
    pub gacha_id: String,
    pub gacha_type: String,
    pub item_id: String,
    pub count: String,
    pub time: String,
    pub name: String,
    pub lang: String,
    pub item_type: String,
    pub rank_type: String,
}

/// Retain page context and record order without treating a page as complete history.
#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct Page {
    #[serde(flatten)]
    pub extra: std::collections::BTreeMap<String, serde_json::Value>,
    pub region: Option<String>,
    pub region_time_zone: Option<i32>,
    pub list: Vec<Roll>,
}

/// Validate one bounded API page. Missing context remains unknown; no deduplication
/// or completeness inference occurs here. Nonzero API codes discard source text.
pub fn parse_response(bytes: &[u8]) -> Result<Page, ParseError> {
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err(ParseError::TooLarge);
    }
    crate::validate_json(bytes).map_err(|_| ParseError::InvalidResponse)?;
    // Read the API status before requiring success data; ignore server messages.
    #[derive(Deserialize)]
    struct Envelope {
        retcode: i64,
        #[serde(default)]
        data: Option<Box<serde_json::value::RawValue>>,
    }
    let envelope: Envelope =
        serde_json::from_slice(bytes).map_err(|_| ParseError::InvalidResponse)?;
    if envelope.retcode != 0 {
        return Err(ParseError::Api(envelope.retcode));
    }
    let page: Page = serde_json::from_str(envelope.data.ok_or(ParseError::InvalidResponse)?.get())
        .map_err(|_| ParseError::InvalidResponse)?;
    if page.region.as_deref() == Some("") {
        return Err(ParseError::InvalidContext);
    }
    if page
        .region_time_zone
        .is_some_and(|offset| !(-12..=14).contains(&offset))
    {
        return Err(ParseError::InvalidContext);
    }
    for roll in &page.list {
        if !valid_roll(roll) {
            return Err(ParseError::InvalidRecord);
        }
        if roll.uid != page.list[0].uid {
            return Err(ParseError::MixedAccounts);
        }
    }
    Ok(page)
}

/// Validate decimal identity text while retaining leading zeros and avoiding numeric conversion.
pub(crate) fn digits(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit())
}

/// Enforce the supported HSR record contract before any record can enter an import.
pub(crate) fn valid_roll(roll: &Roll) -> bool {
    digits(&roll.id)
        && roll.id.len() <= 19
        && digits(&roll.uid)
        && !roll.gacha_id.is_empty()
        && !roll.item_id.is_empty()
        && Category::ALL
            .iter()
            .any(|category| category.code() == roll.gacha_type)
        && roll.count == "1"
        && ["3", "4", "5"].contains(&roll.rank_type.as_str())
        && !roll.lang.is_empty()
        && valid_time(&roll.time)
}

/// Require canonical, valid source-local timestamps without assuming a timezone.
fn valid_time(value: &str) -> bool {
    use chrono::{NaiveDateTime, Timelike};
    if value.len() != 19 {
        return false;
    }
    if !value
        .bytes()
        .zip(b"0000-00-00 00:00:00")
        .all(|(byte, template)| {
            if *template == b'0' {
                byte.is_ascii_digit()
            } else {
                byte == *template
            }
        })
    {
        return false;
    }
    let Ok(time) = NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S") else {
        return false;
    };
    // Reject noncanonical spellings and leap seconds; retain the original text.
    time.nanosecond() == 0 && time.format("%Y-%m-%d %H:%M:%S").to_string() == value
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    const PAGE: &[u8] = include_bytes!("../tests/fixtures/hsr-api/page.json");
    const EMPTY: &[u8] = include_bytes!("../tests/fixtures/hsr-api/empty.json");
    const ERROR: &[u8] = include_bytes!("../tests/fixtures/hsr-api/error.json");

    fn fixture() -> Value {
        serde_json::from_slice(PAGE).unwrap()
    }
    fn parse(value: &Value) -> Result<Page, ParseError> {
        parse_response(&serde_json::to_vec(value).unwrap())
    }

    #[test]
    fn preserves_identity_order_same_second_records_and_source_fields() {
        let page = parse_response(PAGE).unwrap();
        assert_eq!(page.region.as_deref(), Some("synthetic-server"));
        assert_eq!(page.region_time_zone, Some(8));
        assert_eq!(page.list.len(), 2);
        let r = &page.list[0];
        assert_eq!(
            (&r.uid, &r.id),
            (&"100000002".to_owned(), &"9007199254740993".to_owned())
        );
        assert_eq!(page.list[1].id, "9007199254740992");
        assert_eq!(
            (&r.gacha_id, &r.gacha_type, &r.item_id),
            (
                &"1001".to_owned(),
                &"11".to_owned(),
                &"synthetic-item".to_owned()
            )
        );
        assert_eq!(
            (
                &r.count,
                &r.time,
                &r.name,
                &r.lang,
                &r.item_type,
                &r.rank_type
            ),
            (
                &"1".to_owned(),
                &"2024-02-29 12:34:56".to_owned(),
                &"Synthetic item".to_owned(),
                &"en".to_owned(),
                &"Synthetic category".to_owned(),
                &"5".to_owned()
            )
        );
        assert_eq!(page, parse_response(PAGE).unwrap());
    }

    #[test]
    fn empty_pages_do_not_invent_account_or_timezone_evidence() {
        let page = parse_response(EMPTY).unwrap();
        assert!(page.list.is_empty());
        assert_eq!(page.region, None);
        assert_eq!(page.region_time_zone, None);
    }

    #[test]
    fn rejects_api_errors_without_exposing_source_messages() {
        assert_eq!(parse_response(ERROR), Err(ParseError::Api(-100)));
        assert_eq!(format!("{:?}", parse_response(ERROR)), "Err(Api(-100))");
        assert_eq!(
            parse(&json!({"retcode":123,"data":"secret"})),
            Err(ParseError::Api(123))
        );
    }

    #[test]
    fn rejects_malformed_shapes_types_and_oversized_input() {
        for bytes in [
            b"".as_slice(),
            b"{",
            b"null",
            b"[]",
            b"{\"retcode\":\"0\"}",
            b"{\"retcode\":0}",
            b"{\"retcode\":0,\"data\":null}",
            b"{\"retcode\":0,\"data\":{}}",
            b"{\"retcode\":0,\"data\":{\"list\":null}}",
            b"{\"retcode\":0,\"data\":{\"list\":[],\"region_time_zone\":\"8\"}}",
            b"\xff",
        ] {
            assert_eq!(parse_response(bytes), Err(ParseError::InvalidResponse));
        }
        assert_eq!(
            parse_response(&vec![b' '; MAX_RESPONSE_BYTES + 1]),
            Err(ParseError::TooLarge)
        );
        let mut exact = EMPTY.to_vec();
        exact.resize(MAX_RESPONSE_BYTES, b' ');
        assert!(parse_response(&exact).is_ok());
        for field in [
            "uid",
            "id",
            "gacha_id",
            "gacha_type",
            "item_id",
            "count",
            "time",
            "name",
            "lang",
            "item_type",
            "rank_type",
        ] {
            for value in [Value::Null, json!(123)] {
                let mut page = fixture();
                page["data"]["list"][0][field] = value;
                assert_eq!(parse(&page), Err(ParseError::InvalidResponse), "{field}");
            }
            let mut page = fixture();
            page["data"]["list"][0]
                .as_object_mut()
                .unwrap()
                .remove(field);
            assert_eq!(parse(&page), Err(ParseError::InvalidResponse), "{field}");
        }
    }

    #[test]
    fn validates_context_without_inferring_server_from_uid_or_offset() {
        for value in [json!(-13), json!(15)] {
            let mut page = fixture();
            page["data"]["region_time_zone"] = value;
            assert_eq!(parse(&page), Err(ParseError::InvalidContext));
        }
        let mut page = fixture();
        page["data"]["region"] = json!("");
        assert_eq!(parse(&page), Err(ParseError::InvalidContext));
        for offset in [-12, 0, 14] {
            let mut page = fixture();
            page["data"]["region_time_zone"] = json!(offset);
            assert_eq!(parse(&page).unwrap().region_time_zone, Some(offset));
        }
        let mut page = fixture();
        page["data"]
            .as_object_mut()
            .unwrap()
            .remove("region_time_zone");
        assert_eq!(parse(&page).unwrap().region_time_zone, None);
        page["data"]["list"][1]["uid"] = json!("100000003");
        assert_eq!(parse(&page), Err(ParseError::MixedAccounts));
    }

    #[test]
    fn rejects_invalid_records_atomically() {
        for (field, values) in [
            ("id", vec!["", "abc", "１２", "12345678901234567890"]),
            ("uid", vec!["", "x"]),
            ("gacha_id", vec![""]),
            ("item_id", vec![""]),
            ("gacha_type", vec!["13", "301", ""]),
            ("count", vec!["0", "2"]),
            ("rank_type", vec!["2", "6"]),
            ("lang", vec![""]),
            (
                "time",
                vec![
                    "",
                    "2023-02-29 12:34:56",
                    "2024-2-29 12:34:56",
                    "2024-02-29 24:00:00",
                    "2024-02-29 12:34:60",
                    "2024-02-29T12:34:56",
                    "2024-02-29 12:34:56Z",
                ],
            ),
        ] {
            for value in values {
                let mut page = fixture();
                page["data"]["list"][1][field] = json!(value);
                assert_eq!(
                    parse(&page),
                    Err(ParseError::InvalidRecord),
                    "{field}={value}"
                );
            }
        }
    }

    #[test]
    fn retains_supported_banners_long_ids_duplicates_and_unknown_catalog_items() {
        for banner in ["1", "2", "11", "12", "21", "22"] {
            for rank in ["3", "4", "5"] {
                let mut page = fixture();
                page["data"]["list"][0]["gacha_type"] = json!(banner);
                page["data"]["list"][0]["rank_type"] = json!(rank);
                page["data"]["list"][0]["id"] = json!("0007199254740993123");
                page["data"]["list"][1] = page["data"]["list"][0].clone();
                let result = parse(&page).unwrap();
                assert_eq!(result.list[0], result.list[1]);
                assert_eq!(result.list[0].id, "0007199254740993123");
                assert_eq!(result.list[0].gacha_type, banner);
                assert_eq!(result.list[0].rank_type, rank);
            }
        }
    }

    #[test]
    fn retains_unrecognized_fields_for_future_compatibility() {
        let mut page = fixture();
        page["data"]["new_context"] = json!({"synthetic":true});
        page["data"]["list"][0]["new_record_field"] = json!(["synthetic"]);
        let parsed = parse(&page).unwrap();
        assert_eq!(
            parsed.extra.get("new_context"),
            Some(&json!({"synthetic":true}))
        );
        assert_eq!(
            parsed.list[0].extra.get("new_record_field"),
            Some(&json!(["synthetic"]))
        );
    }

    #[test]
    fn accepts_api_error_envelopes_without_success_data() {
        assert_eq!(
            parse(&json!({"retcode":-101,"message":"synthetic secret"})),
            Err(ParseError::Api(-101))
        );
    }

    // A scripted response source for the parser boundary, not an HTTP client.
    // Expected requests contain only non-secret pagination metadata.
    struct MockResponses {
        steps: std::collections::VecDeque<(u32, String, Vec<u8>)>,
    }

    impl MockResponses {
        // Enforce the expected pagination sequence before returning the next synthetic response.
        fn request(&mut self, page: u32, end_id: &str) -> Vec<u8> {
            let (expected_page, expected_cursor, body) = self.steps.pop_front().unwrap();
            assert_eq!((page, end_id), (expected_page, expected_cursor.as_str()));
            body
        }
    }

    #[test]
    fn scripted_pages_preserve_overlap_and_do_not_turn_errors_into_empty_history() {
        let mut overlap = fixture();
        overlap["data"]["list"][0]["id"] = json!("9007199254740992");
        overlap["data"]["list"][1]["id"] = json!("9007199254740991");
        for terminal in [EMPTY, ERROR] {
            let mut source = MockResponses {
                steps: [
                    (1, "0".to_owned(), PAGE.to_vec()),
                    (
                        2,
                        "9007199254740992".to_owned(),
                        serde_json::to_vec(&overlap).unwrap(),
                    ),
                    (3, "9007199254740991".to_owned(), terminal.to_vec()),
                ]
                .into(),
            };
            let first = parse_response(&source.request(1, "0")).unwrap();
            let second =
                parse_response(&source.request(2, &first.list.last().unwrap().id)).unwrap();
            assert_eq!(first.list[1], second.list[0]);
            assert_eq!(first.list.len() + second.list.len(), 4);
            let final_page = parse_response(&source.request(3, &second.list.last().unwrap().id));
            if terminal == EMPTY {
                assert!(final_page.unwrap().list.is_empty());
            } else {
                assert_eq!(final_page, Err(ParseError::Api(-100)));
            }
            assert!(source.steps.is_empty());
        }
    }

    #[test]
    fn preserves_precise_numeric_extensions_without_collapsing_distinct_values() {
        let a = parse_response(include_bytes!(
            "../tests/fixtures/hsr-api/numeric-extensions-a.json"
        ))
        .unwrap();
        let b = parse_response(include_bytes!(
            "../tests/fixtures/hsr-api/numeric-extensions-b.json"
        ))
        .unwrap();
        assert_ne!(a, b);
        let saved = serde_json::to_string(&a).unwrap();
        assert!(saved.contains("18446744073709551616"));
        assert!(saved.contains("0.123456789012345678901"));
        assert_eq!(serde_json::from_str::<Page>(&saved).unwrap(), a);
    }

    #[test]
    fn rejects_duplicate_members_before_identity_or_error_classification() {
        let original = std::str::from_utf8(PAGE).unwrap();
        let duplicate_uid = original.replacen(
            "\"uid\": \"100000002\"",
            "\"uid\":\"100000003\",\"uid\":\"100000002\"",
            1,
        );
        let duplicate_list = original.replacen("\"list\":", "\"list\":[],\"list\":", 1);
        for bytes in [
            duplicate_uid.as_bytes(),
            duplicate_list.as_bytes(),
            br#"{"retcode":-101,"retcode":0,"data":{"list":[]}}"#,
            br#"{"retcode":0,"data":{"list":[],"future":{"x":1,"x":2}}}"#,
            br#"{"retcode":0,"data":{"list":[],"future":[{"x":1,"\u0078":1}]}}"#,
            br#"{"retcode":0,"data":{"list":[],"future":{"$serde_json::private::Number":"123"}}}"#,
        ] {
            assert_eq!(parse_response(bytes), Err(ParseError::InvalidResponse));
        }
    }

    #[test]
    fn rejects_signed_and_extended_timestamp_years() {
        for time in ["+10000-02-29 12:34:56", "-0001-02-28 12:34:56"] {
            let mut input = fixture();
            input["data"]["list"][0]["time"] = json!(time);
            assert_eq!(parse(&input), Err(ParseError::InvalidRecord));
        }
    }

    #[test]
    fn rejects_malformed_ambiguous_and_excessively_nested_raw_json() {
        for bytes in [
            b"true".as_slice(),
            b"{} trailing",
            b"{1:2}",
            b"{\"x\":}",
            b"[1,]",
            b"[",
            b"{",
            b"[ {\"a\":1,\"a\":2} ]",
        ] {
            assert_eq!(parse_response(bytes), Err(ParseError::InvalidResponse));
        }
        let nested = format!("{}0{}", "[".repeat(130), "]".repeat(130));
        assert_eq!(
            parse_response(nested.as_bytes()),
            Err(ParseError::InvalidResponse)
        );
    }
}
