//! Page requests for the single history endpoint, built from an extracted context.
use super::{ENDPOINT, RequestContext};
use crate::hsr::{Category, Roll};
use std::{fmt, num::NonZeroU32};

/// Records requested per page, per the API contract.
pub const PAGE_SIZE: usize = 1000;

/// Where a page starts: the first page, or after a record from the previous page.
#[derive(Clone, Copy)]
pub enum Cursor<'a> {
    Start,
    After(&'a Roll),
}

/// A credential-bearing request URL. Never log or display it.
pub struct PageRequest {
    url: String,
}
impl fmt::Debug for PageRequest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("PageRequest([redacted])")
    }
}
impl PageRequest {
    pub fn url(&self) -> &str {
        &self.url
    }
    /// Records requested; a page with fewer is the category's last.
    pub fn size(&self) -> usize {
        PAGE_SIZE
    }
}

impl RequestContext {
    /// Keep the cached credential fields byte for byte, in their cached order, and
    /// set fresh paging fields. Cached paging values never carry over.
    pub fn page_request(
        &self,
        category: Category,
        page: NonZeroU32,
        cursor: Cursor<'_>,
    ) -> PageRequest {
        let end_id = match cursor {
            Cursor::Start => "0".to_owned(),
            Cursor::After(roll) => encode(&roll.id),
        };
        PageRequest {
            url: format!(
                "{ENDPOINT}{}&gacha_type={}&page={page}&size={PAGE_SIZE}&end_id={end_id}",
                self.fields.join("&"),
                category.code()
            ),
        }
    }
}

/// Parsed IDs are digits and pass through unchanged; anything else is percent-encoded.
fn encode(value: &str) -> String {
    value
        .bytes()
        .map(|byte| {
            if byte.is_ascii_alphanumeric() || b"-._~".contains(&byte) {
                char::from(byte).to_string()
            } else {
                format!("%{byte:02X}")
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acquisition::extract_request_contexts;

    fn context(key: &str) -> RequestContext {
        let url = format!(
            "{ENDPOINT}authkey={key}&authkey_ver=1&sign_type=2&game_biz=hkrpg_global&lang=en&gacha_type=11&page=3&size=5&end_id=42"
        );
        extract_request_contexts(format!("1/0/{url}\0").as_bytes())
            .unwrap()
            .remove(0)
            .into_context()
    }
    fn roll(id: &str) -> Roll {
        serde_json::from_value(serde_json::json!({
            "uid": "100000001", "id": id, "gacha_id": "1001", "gacha_type": "11",
            "item_id": "1001", "count": "1", "time": "2026-01-01 00:00:00", "name": "n",
            "lang": "en", "item_type": "Character", "rank_type": "5",
        }))
        .unwrap()
    }
    fn page(number: u32) -> NonZeroU32 {
        NonZeroU32::new(number).unwrap()
    }

    #[test]
    fn categories_use_the_contract_codes_in_order() {
        let codes: Vec<_> = Category::ALL
            .iter()
            .map(|category| category.code())
            .collect();
        assert_eq!(codes, ["1", "2", "11", "12", "21", "22"]);
    }

    #[test]
    fn first_page_keeps_cached_fields_and_replaces_paging_fields() {
        let request =
            context("synthetic%2Bkey%3D").page_request(Category::Stellar, page(1), Cursor::Start);
        assert_eq!(
            request.url(),
            format!(
                "{ENDPOINT}authkey=synthetic%2Bkey%3D&authkey_ver=1&sign_type=2&game_biz=hkrpg_global&lang=en&gacha_type=1&page=1&size=1000&end_id=0"
            )
        );
        assert_eq!(request.size(), PAGE_SIZE);
        assert_eq!(format!("{request:?}"), "PageRequest([redacted])");
    }

    #[test]
    fn later_pages_advance_page_and_cursor_from_the_previous_record() {
        let previous = roll("1780000000000000001");
        let request = context("synthetic").page_request(
            Category::LightConeCollaboration,
            page(2),
            Cursor::After(&previous),
        );
        assert!(
            request
                .url()
                .ends_with("&gacha_type=22&page=2&size=1000&end_id=1780000000000000001")
        );
    }

    #[test]
    fn unexpected_cursor_bytes_cannot_escape_the_query() {
        let previous = roll("1&authkey=other #é");
        let request = context("synthetic").page_request(
            Category::Departure,
            page(9),
            Cursor::After(&previous),
        );
        assert!(
            request
                .url()
                .ends_with("&end_id=1%26authkey%3Dother%20%23%C3%A9")
        );
        assert_eq!(request.url().matches("authkey=").count(), 1);
        // RFC 3986 unreserved characters need no encoding.
        let unreserved = roll("1-2._~3");
        let request = context("synthetic").page_request(
            Category::Departure,
            page(9),
            Cursor::After(&unreserved),
        );
        assert!(request.url().ends_with("&end_id=1-2._~3"));
    }
}
