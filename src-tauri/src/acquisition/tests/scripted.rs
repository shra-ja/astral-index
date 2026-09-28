//! Scripted transport double: replays responses in order and records every URL.
use crate::acquisition::{Progress, Transport, TransportError};

/// Discard progress in tests that do not check it.
pub fn ignore(_: Progress) {}
use std::{collections::VecDeque, sync::Mutex};

pub struct Scripted {
    responses: Mutex<VecDeque<Result<Vec<u8>, TransportError>>>,
    requested: Mutex<Vec<String>>,
}
impl Scripted {
    pub fn new(responses: Vec<Result<Vec<u8>, TransportError>>) -> Self {
        Self {
            responses: Mutex::new(responses.into()),
            requested: Mutex::default(),
        }
    }
    pub fn requested(&self) -> Vec<String> {
        self.requested.lock().unwrap().clone()
    }
}
impl Transport for Scripted {
    // An unscripted request fails the test, so no extra request goes unnoticed.
    async fn get(&self, url: &str) -> Result<Vec<u8>, TransportError> {
        self.requested.lock().unwrap().push(url.to_owned());
        self.responses
            .lock()
            .unwrap()
            .pop_front()
            .expect("unscripted request")
    }
}
