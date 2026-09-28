//! Turn one fetch attempt into a page or an actionable, safe failure category.
use super::TransportError;
use crate::hsr::{Page, ParseError, parse_response};

/// Why a fetch failed, without URLs, credentials or response text.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FetchFailure {
    /// `retcode -101`: the user must reopen the in-game warp history.
    ExpiredKey,
    /// Any other nonzero API code, kept for display.
    Api(i64),
    /// HTTP 429. The API-level rate-limit code is not known and is not guessed.
    RateLimited,
    /// Timeout, connection failure or HTTP 5xx: the only retryable category.
    Transient,
    /// Any other HTTP status, including redirects, which are never followed.
    Rejected(u16),
    /// Malformed, oversized or inconsistent response data.
    InvalidResponse,
    /// Nothing was sent: an unsupported URL, no HTTPS client or no context to validate.
    Internal,
}
impl FetchFailure {
    /// Whether one retry may help, within the acquisition's retry budget.
    pub fn is_transient(self) -> bool {
        self == Self::Transient
    }
}

/// Classify one attempt. HTTP success is not API success: a 200 body can still
/// carry a nonzero `retcode`, which the parser reports as `ParseError::Api`.
pub fn classify(response: Result<Vec<u8>, TransportError>) -> Result<Page, FetchFailure> {
    parse_body(&response.map_err(transport_failure)?)
}

/// Classify a failed transport attempt.
pub fn transport_failure(error: TransportError) -> FetchFailure {
    match error {
        TransportError::Status(429) => FetchFailure::RateLimited,
        TransportError::Status(500..=599)
        | TransportError::Timeout
        | TransportError::Connection => FetchFailure::Transient,
        TransportError::Status(status) => FetchFailure::Rejected(status),
        TransportError::TooLarge => FetchFailure::InvalidResponse,
        TransportError::UnsupportedUrl | TransportError::Unavailable => FetchFailure::Internal,
    }
}

/// Classify a received body, which callers may keep for an import preview.
pub fn parse_body(body: &[u8]) -> Result<Page, FetchFailure> {
    parse_response(body).map_err(|error| match error {
        ParseError::Api(-101) => FetchFailure::ExpiredKey,
        ParseError::Api(code) => FetchFailure::Api(code),
        ParseError::TooLarge
        | ParseError::InvalidResponse
        | ParseError::InvalidContext
        | ParseError::InvalidRecord
        | ParseError::MixedAccounts => FetchFailure::InvalidResponse,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    const PAGE: &[u8] = include_bytes!("../../tests/fixtures/hsr-api/page.json");
    const ERROR: &[u8] = include_bytes!("../../tests/fixtures/hsr-api/error.json");

    fn api(code: i64) -> Vec<u8> {
        format!("{{\"retcode\":{code},\"message\":\"synthetic detail\",\"data\":null}}")
            .into_bytes()
    }

    #[test]
    fn valid_pages_pass_through() {
        let page = classify(Ok(PAGE.to_vec())).unwrap();
        assert_eq!(page, parse_response(PAGE).unwrap());
    }

    #[test]
    fn api_codes_distinguish_only_the_observed_expired_key() {
        assert_eq!(classify(Ok(api(-101))), Err(FetchFailure::ExpiredKey));
        assert_eq!(classify(Ok(ERROR.to_vec())), Err(FetchFailure::Api(-100)));
        assert_eq!(classify(Ok(api(-110))), Err(FetchFailure::Api(-110)));
    }

    #[test]
    fn transport_errors_map_to_categories() {
        for (error, failure) in [
            (TransportError::Status(429), FetchFailure::RateLimited),
            (TransportError::Status(500), FetchFailure::Transient),
            (TransportError::Status(503), FetchFailure::Transient),
            (TransportError::Status(599), FetchFailure::Transient),
            (TransportError::Timeout, FetchFailure::Transient),
            (TransportError::Connection, FetchFailure::Transient),
            (TransportError::Status(302), FetchFailure::Rejected(302)),
            (TransportError::Status(404), FetchFailure::Rejected(404)),
            (TransportError::Status(600), FetchFailure::Rejected(600)),
            (TransportError::TooLarge, FetchFailure::InvalidResponse),
            (TransportError::UnsupportedUrl, FetchFailure::Internal),
            (TransportError::Unavailable, FetchFailure::Internal),
        ] {
            assert_eq!(classify(Err(error)), Err(failure), "{error:?}");
        }
    }

    #[test]
    fn invalid_response_data_is_never_retried() {
        let mut mixed: serde_json::Value = serde_json::from_slice(PAGE).unwrap();
        mixed["data"]["list"][1]["uid"] = serde_json::json!("100000003");
        let mut record: serde_json::Value = serde_json::from_slice(PAGE).unwrap();
        record["data"]["list"][0]["id"] = serde_json::json!("abc");
        let mut context: serde_json::Value = serde_json::from_slice(PAGE).unwrap();
        context["data"]["region"] = serde_json::json!("");
        for body in [
            b"not json".to_vec(),
            vec![b' '; crate::MAX_RESPONSE_BYTES + 1],
            serde_json::to_vec(&mixed).unwrap(),
            serde_json::to_vec(&record).unwrap(),
            serde_json::to_vec(&context).unwrap(),
        ] {
            let failure = classify(Ok(body)).unwrap_err();
            assert_eq!(failure, FetchFailure::InvalidResponse);
            assert!(!failure.is_transient());
        }
    }

    #[test]
    fn only_transient_failures_are_retryable() {
        assert!(FetchFailure::Transient.is_transient());
        for failure in [
            FetchFailure::ExpiredKey,
            FetchFailure::Api(-100),
            FetchFailure::RateLimited,
            FetchFailure::Rejected(302),
            FetchFailure::InvalidResponse,
            FetchFailure::Internal,
        ] {
            assert!(!failure.is_transient(), "{failure:?}");
        }
    }
}
