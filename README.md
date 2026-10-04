# Roll Tracker

A locally run Tauri desktop application for gacha history, starting with
Honkai: Star Rail and Genshin Impact. History acquisition will contact HoYoverse
only when the user requests it; player data stays on the user’s machine.
The current shell provides game selection and an empty state. History fetching,
file import and statistics are not implemented yet. Tested Rust response parsing
and SQLite preview/import services exist independently of the shell.

## Development setup

The initial game-installation target is **Windows**, with cache discovery intended
from Windows and WSL. The development/test environment is **Ubuntu 24.04 x86_64**. Windows and macOS
are not yet validated release targets. Use asdf 0.20.0 with its shims on `PATH`.
Node.js and Rust are pinned in [.tool-versions](.tool-versions).

Add plugins only if they are not already installed, then install project tools:

```sh
asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git
asdf plugin add rust https://github.com/code-lever/asdf-rust.git
ASDF_RUST_PROFILE=minimal asdf install
rustup component add rustfmt clippy llvm-tools-preview
cargo install cargo-llvm-cov --version 0.9.1 --locked
cargo install tauri-driver --version 2.0.6 --locked
asdf reshim
```

The dated nightly enables Rust branch coverage. Follow asdf's shims rather than
sourcing the Rust installer's suggested environment. The
[asdf Rust plugin](https://github.com/code-lever/asdf-rust) manages its own
Cargo/Rustup directories.

Tauri's Linux shared libraries and test utilities are OS packages, not asdf runtimes:

```sh
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev xvfb webkit2gtk-driver xdotool dbus-x11 bubblewrap python3
npm ci --ignore-scripts
cargo fetch --manifest-path src-tauri/Cargo.toml --locked
```

The Python native-test helper uses only the standard library; system Python 3
or an existing asdf Python 3 installation works. Fetch dependencies before the
isolated native test. Setup and future user-requested history acquisition need
internet access; stored-history operations remain local. See
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for platform details.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run tauri -- dev` | Native development; Vite uses loopback port 1420 |
| `npm run tauri:mock` | The same, running the mock debug binary against a synthetic HoYoverse; set `ROLL_TRACKER_MOCK_SCENARIO` to `history` (default), `expired-link`, `network-failure`, `rate-limited`, `no-history`, `newer-history`, `second-account` or `mixed-accounts` |
| `npm run dev` | Browser preview only; does not verify native behavior |

Development builds (both commands above) read `ROLL_TRACKER_ZOOM`, a webview
zoom from 0.5 to 3, so the app can match the Windows display scale when it runs
under WSL, which renders at 1×: for a monitor at 125%, run
`ROLL_TRACKER_ZOOM=1.25 npm run tauri:mock`. Release builds ignore it.
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --test hsr` | Focused synthetic Rust HSR response tests |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --lib storage` | SQLite migration, preview, transaction, isolation and restart tests |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --lib storage::tests` | SQLite internal failure-injection tests |
| `npm test` | The frontend's tests (run in `src-ui/`), then the repository-tooling tests |
| `npm run coverage` | Fresh frontend and tooling coverage, each with 100% per-file thresholds, as JSON and HTML |
| `npm run coverage:json` | The same frontend and tooling gates without HTML rendering |
| `npm run typecheck` | `vue-tsc --build` over the app, UI-test and Node projects, including templates |
| `npm run build` | The type check, then bundled web assets |
| `npm run test:backend` | Instrumented Rust build and tests, the end-to-end UI/keyboard/close test, LLVM reports |
| `npm run test:offline` | `test:backend` in a namespace with no external network route |
| `npm run coverage:backend-unit` | Reset backend counters, run Rust unit tests and freeze their JSON/HTML coverage |
| `npm run test:backend-integration` | Run the instrumented Cargo test suite without launching the desktop |
| `npm run test:e2e-smoke` | Build and exercise the desktop app end to end without running backend tests |
| `npm run coverage:backend-report` | Render JSON/HTML from the current backend execution counters |
| `npm run test:probes` | Prepare JSON evidence, run scoped enforcement probes, then regenerate and validate full coverage |
| `npm run coverage:verify` | Validate frontend, Rust unit-only and startup/build coverage against source inventories and modification times |
| `npm run format` / `npm run format:check` | Format with Prettier, or only check the formatting |
| `npm run lint` / `npm run lint:check` | Fix what ESLint can in `src-ui/` and the root, or only check, failing on warnings |
| `npm run check` | All coverage, build/type, offline native, probe, format and lint gates |
| `npm run tauri -- build --no-bundle` | Production executable; installer packaging is deferred |

`npm run check` checks formatting and lint, builds the frontend, runs the probe
pipeline and its final full test/coverage validation, then checks reports, Rust
formatting and Clippy. Probes
restore each mutation immediately; their final hook regenerates authoritative
JSON/HTML reports once, including after a failed probe. Tests and per-file
coverage thresholds are unchanged. `test:probes` needs bundled frontend assets;
run `npm run build` first when invoking it separately.

The frontend is the `src-ui/` npm workspace and the backend the `src-tauri/`
crate. Unit tests sit with their code: sibling `*.test.ts` files in `src-ui/`,
inline `#[cfg(test)]` modules in `src-tauri/src/`. Integration tests live in
`src-ui/tests/` and `src-tauri/tests/`, and the repository's own tooling in
`tooling/`, with its tests beside it. Root `tests/` holds repository-level
verification: the native end-to-end test and the coverage gates. See
[contributor test layout](CONTRIBUTING.md#test-layout).

Rust backend coverage is enforced at 100% from unit tests using mocked filesystem
and SQLite APIs, before integration tests run. `coverage/backend-unit/` contains
that independent report. Only the minimal Tauri `main.rs`, mock binary and `build.rs`
delegates use the separate backend wrapper gate in `coverage/backend/`; a source-body
guard requires review if any wrapper changes. Real-file, SQLite and desktop integration tests
remain mandatory additional checks and cannot compensate for unit-test gaps.


The [overlap workload](docs/TESTING.md#overlapping-imports-and-schema-2-2026-09-23)
includes commands for import timings, peak memory and database-growth measurements.

Native tests require Linux, Xvfb, WebKitWebDriver and user network namespaces.
They use X11 even on Wayland hosts. Run checks serially: probes temporarily change
source and restore it, then regenerate the real coverage reports. Inspect source
if a probe is interrupted.

The executable is `src-tauri/target/release/roll-tracker`. Reports live in
`coverage/frontend/`, `coverage/tooling/`, `coverage/backend-unit/` and
`coverage/backend/`; the end-to-end screenshots are
`test-results/e2e-history.png` and `test-results/e2e-import.png` (History and
Import at the default window size), `test-results/e2e-smoke.png` (a failed
retrieval at the minimum size) and `test-results/e2e-mock-*.png` (the mock
binary's progress, review, saved and failed screens). These outputs are
ignored by Git.

### Optional: Windows executable for manual verification

To check behaviour in a native Windows process without a Windows toolchain,
cross-compile from Linux or WSL with `cargo-xwin`. Tauri treats this as
experimental; it is not a release process, and installers and signing remain
milestone 6 work. It was used for the
[native Windows verification](docs/HSR-API-RESEARCH.md#native-windows-verification-2026-09-27).

```sh
sudo apt-get install -y clang lld llvm
rustup target add x86_64-pc-windows-msvc --toolchain nightly-2026-09-28
cargo install cargo-xwin --version 0.23.1 --locked
asdf reshim
npm run tauri -- build --runner cargo-xwin --target x86_64-pc-windows-msvc --no-bundle
```

`cargo-xwin` downloads Microsoft's C runtime and Windows SDK files on first use.
Using it means accepting the
[Microsoft Build Tools license](https://go.microsoft.com/fwlink/?LinkId=2086102);
read it before the first build. The executable is
`src-tauri/target/x86_64-pc-windows-msvc/release/roll-tracker.exe`. Copy it to a
Windows folder and start it from Explorer; it needs the WebView2 runtime, which
Windows 11 includes. Linker warnings about missing `libcmt` debug information are
harmless. Release builds use the Windows GUI subsystem, so no console window opens;
debug builds keep the console for logs.
`src-tauri/icons/icon.ico`, generated from `source.svg` with `npx tauri icon`,
is required for Windows builds.

## Where history is stored

Imported history is kept in one SQLite file, `history.sqlite`, in the app's local
data folder:

| Platform | Folder |
| --- | --- |
| Windows | `%LOCALAPPDATA%\Roll-Tracker` |
| Linux, including a Linux build run in WSL | `~/.local/share/roll-tracker` (or `$XDG_DATA_HOME/roll-tracker`) |

The same folder holds the window's browser profile (cache and similar files):
`EBWebView` on Windows, `webview` on Linux. It holds no roll history.

**Portable mode:** if a folder named `data` sits next to the application
executable, the database and browser profile are kept in that folder instead,
for example `D:\RollTracker\data\history.sqlite` beside
`D:\RollTracker\roll-tracker.exe`.
Create or remove the folder, then restart the app, to switch. If both locations
hold a database, the portable one is used and the other is left untouched.

To move existing history between the two locations:

1. Close Roll Tracker.
2. Copy `history.sqlite` from the old folder to the new one. Keep the original
   until you have checked your history in the new location.
3. Start Roll Tracker.

See [decisions 0009](docs/decisions/0009-local-database-location.md) and
[0010](docs/decisions/0010-portable-mode.md).

## Project context

[AGENTS.md](AGENTS.md) supplies persistent instructions. All code changes require
a short-lived branch from `main`, red-green-refactor and 100% coverage.
[CONTRIBUTING.md](CONTRIBUTING.md) defines these rules and Conventional Commits.
Keep [current status](docs/status/STATUS.md) up to date between tasks.

| Context | Purpose |
| --- | --- |
| [Product brief](docs/product/PROJECT.md) | Scope and user journeys |
| [Architecture](docs/ARCHITECTURE.md) | Boundaries and proposed data model |
| [Import design](docs/IMPORTS.md) | Requirements for the next milestone |
| [Roadmap](docs/product/ROADMAP.md) | Implementation milestones |
| [Testing](docs/TESTING.md) | Coverage scope, gates, TDD evidence and CI |
| [Compact provenance](docs/decisions/0004-compact-import-provenance.md) | Repeated imports, pre-release schema policy and provenance tradeoffs |
| [HSR API contract](docs/HSR-API-CONTRACT.md) | Accepted initial fields, assumptions, pagination and error handling |
| [Storage decision](docs/decisions/0003-sqlite-import-foundations.md) | SQLite migration, identity and transactional import policy |
| [Stack decision](docs/decisions/0001-shell-and-test-stack.md) | Tools, target platform and tradeoffs |

GitHub Actions runs **Tests and 100% coverage** for pull requests, `main` pushes
and merge queues. The user has configured this job as a required check on
protected `main`. Hosted results are available on
[PR #1](https://github.com/shra-ja/roll-tracker/pull/1).
CI reuses npm downloads, Rust dependency builds and pinned Cargo tools through
caches; every run still executes locked installs and the complete validation
pipeline. See [CI caching](docs/TESTING.md#ci-and-handoff) for invalidation and
cold/warm-run verification.

For focused native cache-extraction tests (synthetic data, no network requests):

```sh
cargo test --manifest-path src-tauri/Cargo.toml --offline --lib acquisition
cargo test --manifest-path src-tauri/Cargo.toml --offline --test acquisition
```

This service is not yet connected to the desktop file picker or a history client.


For focused discovery tests (mocked OS APIs and synthetic files/processes):

```sh
cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --lib discovery
cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --test discovery --test system_discovery
```

Current-user discovery is a native service; desktop controls are still pending.
On Windows it uses the Known Folder API. On WSL it requires a nonempty
`WSL_DISTRO_NAME` and working `powershell.exe` and `wslpath` on PATH. Helpers run
only when discovery is explicitly invoked, with time/output limits and safe
failure categories. The intended desktop flow automatically locates `data_2`
and extracts request context, with a user-provided file as the fallback if
discovery fails. No discovered-cache or game-directory selection is required.
Connecting the native helpers into this flow remains pending.
The automated suites substitute synthetic helpers and require neither Windows
interop nor installed games. Native Windows/real-installation verification is
still pending; see [discovery architecture](docs/ARCHITECTURE.md#current-user-system-discovery).

## License

Roll Tracker is released under the [MIT License](LICENSE). Bundled third-party
files keep their own licences. Roll Tracker is not affiliated with or endorsed
by HoYoverse; game names belong to their owners.
