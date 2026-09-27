//! Scripted HTTP client double: unit tests never open sockets or reach the network.
use std::{cell::RefCell, collections::VecDeque, time::Duration};

#[derive(Default)]
pub struct Fixture {
    pub build_error: bool,
    pub responses: VecDeque<Result<Plan, Error>>,
    pub provider_installs: usize,
    pub https_only: Option<bool>,
    pub no_redirects: bool,
    pub connect_timeout: Option<Duration>,
    pub timeout: Option<Duration>,
    pub requested: Vec<String>,
    pub chunks_read: usize,
}
/// A response: status and body chunks, each of which may fail while reading.
pub struct Plan {
    pub status: u16,
    pub chunks: Vec<Result<Vec<u8>, Error>>,
}
thread_local! { static STATE: RefCell<Fixture> = RefCell::default(); }
pub fn install(fixture: Fixture) {
    STATE.with(|state| *state.borrow_mut() = fixture);
}
pub fn inspect<T>(read: impl FnOnce(&Fixture) -> T) -> T {
    STATE.with(|state| read(&state.borrow()))
}

#[derive(Debug)]
pub struct Error {
    pub timeout: bool,
}
impl Error {
    pub fn is_timeout(&self) -> bool {
        self.timeout
    }
}

pub struct Provider;
pub fn default_provider() -> Provider {
    Provider
}
impl Provider {
    pub fn install_default(self) -> Result<(), ()> {
        STATE.with(|state| state.borrow_mut().provider_installs += 1);
        Err(())
    }
}

pub mod redirect {
    pub struct Policy;
    impl Policy {
        pub fn none() -> Self {
            super::STATE.with(|state| state.borrow_mut().no_redirects = true);
            Policy
        }
    }
}

pub struct Client;
pub struct ClientBuilder;
impl Client {
    pub fn builder() -> ClientBuilder {
        ClientBuilder
    }
    pub fn get(&self, url: &str) -> RequestBuilder {
        STATE.with(|state| state.borrow_mut().requested.push(url.to_owned()));
        RequestBuilder
    }
}
impl ClientBuilder {
    pub fn https_only(self, enabled: bool) -> Self {
        STATE.with(|state| state.borrow_mut().https_only = Some(enabled));
        self
    }
    pub fn redirect(self, _: redirect::Policy) -> Self {
        self
    }
    pub fn connect_timeout(self, timeout: Duration) -> Self {
        STATE.with(|state| state.borrow_mut().connect_timeout = Some(timeout));
        self
    }
    pub fn timeout(self, timeout: Duration) -> Self {
        STATE.with(|state| state.borrow_mut().timeout = Some(timeout));
        self
    }
    pub fn build(self) -> Result<Client, Error> {
        if STATE.with(|state| state.borrow().build_error) {
            return Err(Error { timeout: false });
        }
        Ok(Client)
    }
}

pub struct RequestBuilder;
impl RequestBuilder {
    pub async fn send(self) -> Result<Response, Error> {
        let plan = STATE.with(|state| state.borrow_mut().responses.pop_front());
        let plan = plan.expect("unscripted request")?;
        Ok(Response {
            status: plan.status,
            chunks: plan.chunks.into(),
        })
    }
}

pub struct StatusCode(u16);
impl StatusCode {
    pub fn as_u16(&self) -> u16 {
        self.0
    }
}
pub struct Response {
    status: u16,
    chunks: VecDeque<Result<Vec<u8>, Error>>,
}
impl Response {
    pub fn status(&self) -> StatusCode {
        StatusCode(self.status)
    }
    pub async fn chunk(&mut self) -> Result<Option<Vec<u8>>, Error> {
        STATE.with(|state| state.borrow_mut().chunks_read += 1);
        self.chunks.pop_front().transpose()
    }
}
