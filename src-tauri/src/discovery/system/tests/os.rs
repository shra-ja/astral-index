//! Scripted OS APIs: unit tests never read environment, resolve folders or spawn processes.
use std::{
    cell::RefCell,
    collections::VecDeque,
    ffi::{OsStr, OsString},
    io,
    path::PathBuf,
    pin::Pin,
    process::Stdio,
    task::{Context, Poll},
};
use tokio::io::{AsyncRead, ReadBuf};

pub mod consts {
    pub const OS: &str = "linux";
}

#[derive(Default)]
pub struct Fixture {
    pub distro: Option<OsString>,
    pub app_data: Option<PathBuf>,
    pub plans: VecDeque<Plan>,
    pub calls: Vec<(String, Vec<OsString>)>,
    pub env_reads: Vec<String>,
    pub folder_reads: usize,
    pub drops: usize,
    pub kills: usize,
    pub bytes_read: usize,
}
#[derive(Default)]
pub struct Plan {
    pub bytes: Vec<u8>,
    pub spawn_error: bool,
    pub stdout_missing: bool,
    pub read_error: bool,
    pub wait_error: bool,
    pub unsuccessful: bool,
    pub pending_read: bool,
    pub pending_wait: bool,
    pub kill_error: bool,
    pub pending_kill: bool,
}
impl Plan {
    pub fn output(value: &str) -> Self {
        Self {
            bytes: value.as_bytes().to_vec(),
            ..Default::default()
        }
    }
}
thread_local! { static STATE: RefCell<Fixture> = RefCell::default(); }
pub fn install(state: Fixture) {
    STATE.with(|s| *s.borrow_mut() = state);
}
pub fn inspect<T>(read: impl FnOnce(&Fixture) -> T) -> T {
    STATE.with(|s| read(&s.borrow()))
}
pub fn var_os(name: &str) -> Option<OsString> {
    assert_eq!(name, "WSL_DISTRO_NAME");
    STATE.with(|s| {
        let mut s = s.borrow_mut();
        s.env_reads.push(name.into());
        s.distro.clone()
    })
}
pub fn data_dir() -> Option<PathBuf> {
    STATE.with(|s| {
        let mut s = s.borrow_mut();
        s.folder_reads += 1;
        s.app_data.clone()
    })
}
fn failure() -> io::Error {
    io::Error::other("private OS diagnostic")
}
pub struct Command {
    program: String,
    args: Vec<OsString>,
    stdio: usize,
    kill: bool,
}
impl Command {
    pub fn new(program: &str) -> Self {
        Self {
            program: program.into(),
            args: vec![],
            stdio: 0,
            kill: false,
        }
    }
    pub fn args(&mut self, args: &[&OsStr]) -> &mut Self {
        self.args = args.iter().map(|a| a.to_os_string()).collect();
        self
    }
    pub fn stdin(&mut self, _: Stdio) -> &mut Self {
        self.stdio |= 1;
        self
    }
    pub fn stdout(&mut self, _: Stdio) -> &mut Self {
        self.stdio |= 2;
        self
    }
    pub fn stderr(&mut self, _: Stdio) -> &mut Self {
        self.stdio |= 4;
        self
    }
    pub fn kill_on_drop(&mut self, value: bool) -> &mut Self {
        self.kill = value;
        self
    }
    pub fn spawn(&mut self) -> io::Result<Child> {
        assert_eq!(self.stdio, 7);
        assert!(self.kill);
        STATE.with(|s| {
            let mut s = s.borrow_mut();
            s.calls.push((self.program.clone(), self.args.clone()));
            let mut plan = s.plans.pop_front().expect("unexpected subprocess");
            if plan.spawn_error {
                return Err(failure());
            }
            let stdout = if plan.stdout_missing {
                None
            } else {
                Some(Reader {
                    data: std::io::Cursor::new(std::mem::take(&mut plan.bytes)),
                    error: plan.read_error,
                    pending: plan.pending_read,
                })
            };
            Ok(Child { stdout, plan })
        })
    }
}
pub struct Child {
    pub stdout: Option<Reader>,
    plan: Plan,
}
impl Child {
    pub async fn kill(&mut self) -> io::Result<()> {
        STATE.with(|s| s.borrow_mut().kills += 1);
        if self.plan.pending_kill {
            std::future::pending::<()>().await;
        }
        if self.plan.kill_error {
            Err(failure())
        } else {
            Ok(())
        }
    }
    pub async fn wait(&mut self) -> io::Result<Status> {
        if self.plan.pending_wait {
            std::future::pending::<()>().await;
        }
        if self.plan.wait_error {
            Err(failure())
        } else {
            Ok(Status(!self.plan.unsuccessful))
        }
    }
}
impl Drop for Child {
    fn drop(&mut self) {
        STATE.with(|s| s.borrow_mut().drops += 1);
    }
}
pub struct Status(bool);
impl Status {
    pub fn success(&self) -> bool {
        self.0
    }
}
pub struct Reader {
    data: std::io::Cursor<Vec<u8>>,
    error: bool,
    pending: bool,
}
impl AsyncRead for Reader {
    fn poll_read(
        mut self: Pin<&mut Self>,
        _: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        if self.pending {
            return Poll::Pending;
        }
        if self.error {
            return Poll::Ready(Err(failure()));
        }
        let position = self.data.position() as usize;
        let size = buf.remaining().min(self.data.get_ref().len() - position);
        buf.put_slice(&self.data.get_ref()[position..position + size]);
        self.data.set_position((position + size) as u64);
        STATE.with(|s| s.borrow_mut().bytes_read += size);
        Poll::Ready(Ok(()))
    }
}
