# Development

How to set up, run and check Astral Index. The rules every change follows are
in [CONTRIBUTING](../../CONTRIBUTING.md); how the gates work is in
[TESTING](TESTING.md).

## Setup

Development and CI run on **Ubuntu 24.04 x86_64**, including under WSL. Windows
is the initial game-installation target; Windows and macOS are not yet validated
release targets. Use asdf 0.20.0 with its shims on `PATH`; Node.js and Rust are
pinned in [.tool-versions](../../.tool-versions).

Add the plugins if they are missing, then install the project tools:

```sh
asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git
asdf plugin add rust https://github.com/code-lever/asdf-rust.git
ASDF_RUST_PROFILE=minimal asdf install
rustup component add rustfmt clippy llvm-tools-preview
cargo install cargo-llvm-cov --version 0.9.1 --locked
cargo install tauri-driver --version 2.0.6 --locked
cargo install cargo-about --version 0.9.2 --locked --features cli
asdf reshim
```

The dated nightly enables Rust branch coverage. Follow asdf's shims rather than
sourcing the Rust installer's environment; the
[asdf Rust plugin](https://github.com/code-lever/asdf-rust) manages its own
Cargo and Rustup directories.

Tauri's Linux libraries and the native test tools are OS packages:

```sh
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev xvfb webkit2gtk-driver xdotool dbus-x11 bubblewrap python3
npm ci --ignore-scripts
cargo fetch --manifest-path src-tauri/Cargo.toml --locked
```

The Python native-test helper needs only the standard library. Fetch
dependencies before the isolated native tests, which have no network. See
[Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/) for platform
details.

## Running the app

| Command | Runs |
| --- | --- |
| `npm run tauri -- dev` | The desktop app in development; Vite uses loopback port 1420 |
| `npm run tauri:mock` | The same with the mock debug binary, against a synthetic HoYoverse |
| `npm run dev` | A browser preview only; it does not exercise native behaviour |
| `npm run tauri -- build --no-bundle` | The release executable, `src-tauri/target/release/astral-index`; installers come later |

`ASTRAL_INDEX_MOCK_SCENARIO` chooses the mock's behaviour: `history` (the
default), `expired-link`, `network-failure`, `rate-limited`, `no-history`,
`newer-history`, `second-account`, `mixed-accounts` or `large-history` (20,000
Character Event Warp rolls)
([decision 0014](../architecture/decisions/0014-mock-debug-binary.md)). The mock
keeps its history in its own `astral-index-mock` data folder.

Development builds read `ASTRAL_INDEX_ZOOM`, a webview zoom from 0.5 to 3. Under
WSL the app renders at 1×, so to match a Windows display at 125% run
`ASTRAL_INDEX_ZOOM=1.25 npm run tauri:mock`. Release builds ignore it.

`ASTRAL_INDEX_SIZE_OVERLAY=1` makes a development build show the window's size
in CSS pixels in the bottom-right corner, with the zoom when it is not 1,
updating while the window is resized, for finding the sizes where a layout
breaks. Other values, and release builds, show nothing. For example,
`ASTRAL_INDEX_SIZE_OVERLAY=1 ASTRAL_INDEX_ZOOM=1.25 npm run tauri:mock`.

Check where layouts change at zoom 1. Under a development zoom, WebKitGTK
compares container queries with the unzoomed width, so they apply at the
written width divided by the zoom: at 1.25 the sidebar collapses at 720 CSS
pixels rather than 900. Windows display scaling is not a page zoom, so its
container queries apply at their written widths, as at zoom 1.

### Feature toggles

Build-time toggles hide unfinished features from release builds while they stay
in the code and under test
([decision 0026](../architecture/decisions/0026-feature-toggles.md)). Each is
a `VITE_FEATURE_*` variable in the frontend's committed mode files:

| Toggle | `.env.development`, `.env.test` | `.env.production` | Removed by |
| --- | --- | --- | --- |
| `VITE_FEATURE_GENSHIN_IMPACT`: Genshin Impact's link and screens | `true` | `false` | [0031](../product/features/0031-second-game-adapter.md) |

`npm run tauri -- dev` and `npm run tauri:mock` are development builds, so they
show every toggled feature. Release builds and the mock debug binary that the
end-to-end tests build use the production build of `src-ui/dist`, so they show
what a release shows. A variable set in the environment overrides the files for
one build, for example `VITE_FEATURE_GENSHIN_IMPACT=true npm run build`; git
ignores local override files such as `.env.production.local`. A value other
than `true` or `false` stops the build, the dev server and the tests.

## Checks

| Command | Does |
| --- | --- |
| `npm run check` | Every gate: `check:static`, then `check:gates`, then `check:probes` |
| `npm run check:static` | Formatting, lint, the docs, icon, README logo and version checks, the frontend bundle, Rust formatting and Clippy |
| `npm run check:probes` | The build (which generates and checks the third-party notices), then the mutation probes |
| `npm run check:gates` | The build, coverage, the offline native tests and report validation |
| `npm test` | The frontend's tests (in `src-ui/`), then the tooling tests |
| `npm run coverage` / `coverage:json` | Fresh frontend and tooling coverage with per-file 100% thresholds, with or without HTML |
| `npm run typecheck` | `vue-tsc --build` over the app, UI-test and Node projects, templates included |
| `npm run build` | The type check, the third-party notices, then the bundled web assets |
| `npm run format` / `format:check` | Format with Prettier, or only check |
| `npm run lint` / `lint:check` | Fix what ESLint and markdownlint can, or only check, failing on warnings |
| `npm run docs:check` | Check that doc links and anchors resolve, every doc is reachable from `AGENTS.md`, and STATUS stays short |
| `npm run icons` / `icons:check` | Write the app icons in `src-tauri/icons/` from the brand's emblems, or only check that the committed ones match |
| `npm run readme:logo` / `readme:logo:check` | Write the README's logo in `docs/assets/readme/` from the brand files, or only check that the committed ones match |
| `npm run readme:screenshots` | Take the README's screenshots in `docs/assets/readme/` from the mock debug binary's synthetic history, the hero framed as a Windows 11 window; run it again when those screens change |
| `npm run notices` | Write the gitignored third-party notices with cargo-about and the bundle's licence report, failing on a missing or unaccepted licence; `npm run build` runs it first |
| `npm run versions:check` | Check that no manifest declares a version, beyond Cargo's `0.0.0` placeholder: builds receive it from the release tags |
| `npm run test:backend` | Rust unit, integration and end-to-end tests with coverage reports |
| `npm run test:offline` | `test:backend` in a network namespace with no external route |
| `npm run coverage:backend-unit` | Reset backend counters, run Rust unit tests and freeze their report |
| `npm run test:backend-integration` | The instrumented Cargo integration tests, without the desktop |
| `npm run test:e2e-smoke` | Build and drive the desktop app end to end |
| `npm run test:windows-smoke` | On Windows in CI only: smoke-test the release executable's window, icon, data folders and exit |
| `npm run coverage:backend-report` | Render the backend report from the current counters |
| `npm run test:probes` | The mutation probes alone, writing to `test-results/probe-run/` (run `npm run build` first) |
| `npm run coverage:verify` | Validate every report against the source inventories |
| `npm run ci:summary` | Write a CI job's summary (CI sets `CHECK_JOB`, `CHECK_STATUS` and `GITHUB_STEP_SUMMARY`) |
| `npm run release:prepare` | Work out the next release's version and notes from the merged pull requests, writing the notes to `test-results/release/notes.md`; the release workflow runs it |

Run the check serially and do not edit or stage files while it runs: the probes
change source briefly ([recovery](TESTING.md#mutation-probes)). On a machine with
limited memory, run its stages one at a time with `CARGO_BUILD_JOBS` lowered.

Focused Rust tests, all synthetic and offline:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --lib hsr
cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --lib storage
cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --test storage
cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --lib acquisition
cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --test acquisition
cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --lib discovery
cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --test discovery --test system_discovery
```

Plain Cargo builds replace the coverage-instrumented binaries without Cargo
noticing; run `cargo clean -p astral-index` before the native tests after one.

## Outputs

Git ignores all of these:

- `coverage/frontend/`, `coverage/tooling/`, `coverage/backend-unit/` and
  `coverage/backend/`: coverage reports.
- `test-results/`: end-to-end screenshots (`e2e-*.png`), check logs and probe
  failure snapshots; `test-results/probe-run/` holds the mutation probes' own
  coverage reports, screenshots and synthetic data.
- `src-tauri/target/`: builds.

## Windows executable for manual checks

CI keeps a release executable of each of this repository's builds that passes
every check, for 7 days: download `astral-index-dev-build-unsigned-<commit>`
from the run's summary page, or with `gh run download`. A pull request's run
builds GitHub's merge of the pull request into `main`, so its build can include
changes merged into `main` after the named commit. It is a development build, unsigned and
not a release: its About dialog says "dev build" with that commit, after the last
release's version. Builds made anywhere else say "Local build"; to try one with a
version, set `TAURI_CONFIG='{"version":"1.2.0"}'` and, for the build identity,
`ASTRAL_INDEX_BUILD` to `release` or a commit
([decision 0030](../architecture/decisions/0030-tag-versioned-releases.md)).

To try the app in a native Windows process without a Windows toolchain,
cross-compile from Linux or WSL with `cargo-xwin`. Tauri treats this as
experimental; it is not a release process, and installers and signing are
milestone 10 work. It was used for the
[native Windows verification](../games/hsr/api-research.md#native-windows-verification-2026-09-27).

```sh
sudo apt-get install -y clang lld llvm
rustup target add x86_64-pc-windows-msvc --toolchain nightly-2026-09-28
cargo install cargo-xwin --version 0.23.1 --locked
asdf reshim
npm run tauri -- build --runner cargo-xwin --target x86_64-pc-windows-msvc --no-bundle
```

`cargo-xwin` downloads Microsoft's C runtime and Windows SDK on first use, which
means accepting the
[Microsoft Build Tools license](https://go.microsoft.com/fwlink/?LinkId=2086102);
read it first. The executable is
`src-tauri/target/x86_64-pc-windows-msvc/release/astral-index.exe`: copy it to a
Windows folder and start it from Explorer. It needs the WebView2 runtime, which
Windows 11 includes. Linker warnings about missing `libcmt` debug information are
harmless. Release builds use the Windows GUI subsystem, so no console opens;
debug builds keep it for logs. The executable embeds `src-tauri/icons/icon.ico`,
which `npm run icons` generates.

## Releasing

Releases are versioned from git tags and drafted by the Release workflow,
`.github/workflows/release.yml`
([decision 0030](../architecture/decisions/0030-tag-versioned-releases.md)).
The same steps suit a person or an agent; an agent asks before each one, as they
are outward-facing.

1. **Check `main`.** The workflow refuses unless every check passed on `main`'s
   latest commit.
2. **Preview.** Bring `main` and its tags up to date
   (`git switch main && git pull --tags`), then `npm run release:prepare`
   prints the next version and the notes the workflow would write, from the
   pull requests merged since the last tag, and writes the notes to
   `test-results/release/notes.md`. The version follows semantic versioning,
   from each pull request's title: a breaking change (`!` after the type, as in
   `feat!:`) is major, a feature minor, anything else a patch. For the first
   release, which needs notes, give them as it will:
   `RELEASE_NOTES="$(cat notes.md)" npm run release:prepare`.
3. **Write the notes if the generated ones won't do.** Step 2's notes list the
   pull request titles as written. When they don't describe the release well
   for users, such as titles about tooling or tests, or when there is no
   earlier tag, write Markdown that replaces the generated sections: one or two
   sentences summarising the release, then `### Breaking changes`,
   `### Features` and `### Fixes`, as needed and in that order, each entry one
   sentence in the present tense about what the app now does, ending with its
   pull request, such as `(#117)`. Write each paragraph and entry on one
   line: the workflow passes the notes through verbatim, and a release page
   turns every newline into a line break. Preview them as a release page
   renders them with
   `gh api -X POST markdown -f mode=gfm -f text="$(cat notes.md)"`. The
   workflow adds "Usage" itself.
4. **Start the workflow:**
   `gh workflow run release.yml --ref main` with `-f version=1.2.0` to choose
   the version and `-f notes="$(cat notes.md)"` to give the notes, or the "Run
   workflow" button on the Actions page.
5. **Review the draft.** The release appears as a draft titled with its tag,
   with `Astral-Index-v1.2.0.exe` attached. Generated entries are pull request
   titles as written, so check them for anything that should not be published,
   such as an `@mention`. Edit the notes there, or with
   `gh release edit v1.2.0 --notes-file notes.md`. Starting the workflow again
   for the same version is refused while its draft exists: publish or delete
   the draft first.
6. **Publish** the draft, which creates the tag.
