//! Auth-key validation: send cached requests unchanged until one key works.
use super::{CachedRequest, FetchFailure, RequestContext, Transport, classify};

/// Contexts validated per acquisition, per the API contract.
pub const MAX_VALIDATED_CONTEXTS: usize = 5;

/// Send each cached request unchanged, in the given order, and return the first
/// context whose key works. Call only on an explicit user request.
///
/// A rejected key (`-101` or another API code) moves on to the next context; any
/// other failure, including a rate limit, stops. If every key is rejected, report an expired key if any
/// expired, else the first code. The validation page's records are discarded, and
/// every cached URL is dropped on return. With no contexts, nothing is sent.
pub async fn validate(
    transport: &impl Transport,
    requests: Vec<CachedRequest>,
) -> Result<RequestContext, FetchFailure> {
    let mut rejected = None;
    for request in requests.into_iter().take(MAX_VALIDATED_CONTEXTS) {
        match classify(transport.get(request.url()).await) {
            Ok(_) => return Ok(request.into_context()),
            Err(FetchFailure::ExpiredKey) => rejected = Some(FetchFailure::ExpiredKey),
            Err(FetchFailure::Api(code)) => {
                rejected = rejected.or(Some(FetchFailure::Api(code)));
            }
            Err(failure) => return Err(failure),
        }
    }
    Err(rejected.unwrap_or(FetchFailure::Internal))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acquisition::tests::scripted::Scripted;
    use crate::acquisition::{ENDPOINT, TransportError, extract_request_contexts};
    use std::future::Future;

    const PAGE: &[u8] = include_bytes!("../../tests/fixtures/hsr-api/page.json");

    fn scripted(responses: Vec<Result<Vec<u8>, TransportError>>) -> Scripted {
        Scripted::new(responses)
    }

    fn run<T>(future: impl Future<Output = T>) -> T {
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(future)
    }
    // Cached requests keep their own paging values; validation must not replace them.
    fn url(key: &str) -> String {
        format!(
            "{ENDPOINT}authkey={key}&authkey_ver=1&sign_type=2&game_biz=hkrpg_global&lang=en&gacha_type=11&page=2&size=5&end_id=17"
        )
    }
    /// Cached requests for `keys`, in validation order.
    fn requests(keys: &[&str]) -> Vec<CachedRequest> {
        let mut bytes = Vec::new();
        for key in keys.iter().rev() {
            bytes.extend_from_slice(format!("1/0/{}\0", url(key)).as_bytes());
        }
        extract_request_contexts(&bytes).unwrap()
    }
    fn context(key: &str) -> RequestContext {
        requests(&[key]).remove(0).into_context()
    }
    fn page() -> Result<Vec<u8>, TransportError> {
        Ok(PAGE.to_vec())
    }
    fn api(code: i64) -> Result<Vec<u8>, TransportError> {
        Ok(format!("{{\"retcode\":{code},\"message\":\"synthetic\",\"data\":null}}").into_bytes())
    }

    #[test]
    fn sends_cached_urls_unchanged_and_stops_at_the_first_working_key() {
        let transport = scripted(vec![api(-101), api(-100), page()]);
        let validated = run(validate(&transport, requests(&["a", "b", "c", "d"])));
        assert_eq!(validated, Ok(context("c")));
        assert_eq!(transport.requested(), [url("a"), url("b"), url("c")]);
    }

    #[test]
    fn validates_at_most_five_contexts() {
        let transport = scripted(vec![api(-101); 7]);
        let keys = ["a", "b", "c", "d", "e", "f", "g"];
        assert_eq!(
            run(validate(&transport, requests(&keys))),
            Err(FetchFailure::ExpiredKey)
        );
        assert_eq!(
            transport.requested(),
            keys[..MAX_VALIDATED_CONTEXTS]
                .iter()
                .map(|key| url(key))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn rejected_keys_report_expiry_if_any_expired_else_the_first_code() {
        let transport = scripted(vec![api(-100), api(-101), api(-111)]);
        assert_eq!(
            run(validate(&transport, requests(&["a", "b", "c"]))),
            Err(FetchFailure::ExpiredKey)
        );
        let transport = scripted(vec![api(-100), api(-111)]);
        assert_eq!(
            run(validate(&transport, requests(&["a", "b"]))),
            Err(FetchFailure::Api(-100))
        );
    }

    #[test]
    fn other_failures_stop_validation_without_trying_further_keys() {
        for (response, failure) in [
            (Err(TransportError::Status(429)), FetchFailure::RateLimited),
            (api(-110), FetchFailure::RateLimited),
            (Err(TransportError::Timeout), FetchFailure::Transient),
            (
                Err(TransportError::Status(302)),
                FetchFailure::Rejected(302),
            ),
            (Ok(b"not json".to_vec()), FetchFailure::InvalidResponse),
            (Err(TransportError::UnsupportedUrl), FetchFailure::Internal),
        ] {
            let transport = scripted(vec![api(-101), response, page()]);
            assert_eq!(
                run(validate(&transport, requests(&["a", "b", "c"]))),
                Err(failure)
            );
            assert_eq!(transport.requested().len(), 2);
        }
    }

    #[test]
    fn no_contexts_sends_nothing() {
        let transport = scripted(vec![]);
        assert_eq!(
            run(validate(&transport, vec![])),
            Err(FetchFailure::Internal)
        );
        assert!(transport.requested().is_empty());
    }
}
