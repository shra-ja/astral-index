//! Real HTTPS client construction. These tests never request the history endpoint:
//! `cargo test` may run with network access, and live API calls are forbidden.
use roll_tracker::acquisition::{HttpTransport, Transport, TransportError};

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
}

#[test]
fn real_client_uses_ring_and_can_be_built_repeatedly() {
    let transport = HttpTransport::new().unwrap();
    assert!(rustls::crypto::CryptoProvider::get_default().is_some());
    HttpTransport::new().unwrap();
    // A loopback URL would reach a real socket if the endpoint check were missing.
    let refused = runtime().block_on(transport.get("http://127.0.0.1:9/"));
    assert_eq!(refused, Err(TransportError::UnsupportedUrl));
}
