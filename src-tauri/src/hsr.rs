//! Pure HSR response parsing; no filesystem, network, or persistence access.
pub mod storage;

use serde::{Deserialize, Serialize};

pub const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;

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
    // Read the API status before requiring success data; ignore server messages.
    #[derive(Deserialize)]
    struct Envelope {
        retcode: i64,
        #[serde(default)]
        data: serde_json::Value,
    }
    let envelope: Envelope =
        serde_json::from_slice(bytes).map_err(|_| ParseError::InvalidResponse)?;
    if envelope.retcode != 0 {
        return Err(ParseError::Api(envelope.retcode));
    }
    let page: Page =
        serde_json::from_value(envelope.data).map_err(|_| ParseError::InvalidResponse)?;
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
fn digits(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit())
}

/// Enforce the supported HSR record contract before any record can enter an import.
fn valid_roll(roll: &Roll) -> bool {
    digits(&roll.id)
        && roll.id.len() <= 19
        && digits(&roll.uid)
        && !roll.gacha_id.is_empty()
        && !roll.item_id.is_empty()
        && ["1", "2", "11", "12", "21", "22"].contains(&roll.gacha_type.as_str())
        && roll.count == "1"
        && ["3", "4", "5"].contains(&roll.rank_type.as_str())
        && !roll.lang.is_empty()
        && valid_time(&roll.time)
}

/// Require canonical, valid source-local timestamps without assuming a timezone.
fn valid_time(value: &str) -> bool {
    use chrono::{NaiveDateTime, Timelike};
    let Ok(time) = NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S") else {
        return false;
    };
    // Reject noncanonical spellings and leap seconds; retain the original text.
    time.nanosecond() == 0 && time.format("%Y-%m-%d %H:%M:%S").to_string() == value
}
