# 2026-09-29: import flow and Vue (archived 2026-10-04)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Portable mode (2026-09-29)

Integrated through PR #33 (`8826c15`), branched from `main` at `b6e279e`, at the user's
request ahead of PR C. A folder named `data` beside the executable switches on
portable mode: `database::location` returns it when it exists as a folder, and the
local app data folder otherwise, and `register` passes it the path from
`std::env::current_exe`. The user chose the `data` folder for detection, silent use
of the portable database when both locations have one, and a documented manual
copy for moving history; an in-app offer to copy on the first portable start is
deferred on the roadmap. A file named `data` does not switch modes, and an
unusable `data` folder fails to open rather than falling back. The README now says
where history is stored, how portable mode works and how to copy history between
locations. [Decision 0010](../../decisions/0010-portable-mode.md) records it.
`desktop::database` is now public for the integration test, and the filesystem
double's metadata gains `is_dir`.

TDD: the location test failed against a stub that always returned the local
folder, then passed. A new integration test creates a real `data` folder beside a
synthetic executable path, opens the database there and checks the local folder is
never created; it passed on its first run.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: 119 Rust unit tests, 37 integration tests, 44 frontend/tooling tests,
offline native execution, nine probes and five report checks, all at 100% per
file, plus TypeScript/build, formatting and Clippy, peaking at about 3.5 GB used.
`npm run tauri -- build --no-bundle` passed on Linux.

## Retrieve history command (2026-09-29)

Integrated through PR #34 (`301956f`), branched from `main` at `8826c15`: PR C of the
acquisition commands. `retrieve_history` takes the validated context and its budget
out of the session, retrieves every category cancellably while continuing the
extraction's budget, streams progress over a Tauri channel, and drops the context
as soon as retrieval ends, clearing the auth key whatever the outcome. With no
records it returns `no_history` without touching the database; otherwise it
previews under the resolved account, keeps the preview in the session unless
cancelled meanwhile, and returns the review. Retrieval failures carry the failing
category and page. Eight failure kinds are added, two of them for commit. The
command is registered and granted; the typed client gains `retrieveHistory`, the
progress and review types, the new kinds and failure locations. No UI changed.

Test support: `spawn_blocking` is replaced in unit tests by an inline double that
catches panics as Tokio does, so the thread-local SQL double stays visible; the
database integration test now checks the real thread hop and panic handling.
Storage's review types gain `Clone`, and its `preview_script` and `preview`
test helpers are crate-visible. The IPC test window runs Tauri's setup hook, so
the database is managed. All retrieval tests share one test transport, `Serving`,
because coverage scores a generic function by its best single instantiation.

TDD: seven retrieval tests (success with a retry, no history, located failure, no
context or client, database failure, cancelling, the carried budget) failed
against a stub, then passed; a further test covers a preview refused after a
late cancel. The mappings, progress events and registration were written with
their tests. Three client tests failed on the missing function and kinds, then
passed. The native smoke test now calls `retrieve_history` from the real
webview and gets `no_context`, showing the real setup hook manages the database.

During development the native unit gate found gaps, all closed without
exclusions: a retry event never passed through retrieval's reporter, a late
cancel never refused a preview inside `retrieve_into`, the command's second and
third arguments never failed over IPC, and some test closures never ran. It also
split `retrieve_into` across three test transport types, which the shared
`Serving` transport fixed. Run stage by stage with `CARGO_BUILD_JOBS=8`, every
stage of `npm run check` passed: 130 Rust unit tests, 37 integration tests, 46
frontend/tooling tests, offline native execution with the new IPC call, nine
probes and five report checks, all at 100% per file, plus TypeScript/build,
formatting and Clippy, peaking at about 3.2 GB used.
`npm run tauri -- build --no-bundle` passed on Linux.

## Commit and discard commands (2026-09-29)

Integrated through PR #35 (`6501c59`), branched from `main` at `301956f`: PR D, the last
of the acquisition commands. `commit_import` takes the held preview and commits it
through the database with the current Unix time, returning the summary of rolls
added, duplicates and conflicts. The preview is used up whatever the outcome, so
after a conflict or `stale_preview` the user retrieves again; a commit is atomic
and quick, so it is not cancellable. `discard_import` drops the held preview
without writing. Without a preview, commit fails with the new `no_preview` kind and
discard does nothing. Both are registered and granted; the typed client gains
`commitImport` and `discardImport`. No UI changed. The storage tests'
`commit_script` is crate-visible, and a `stale_commit_script` helper replaces an
inline stale-commit script.

TDD: three native tests (commit, a refused or failed commit, discard) failed
against stubs, then passed; the IPC checks passed against the stubs, as they only
need the commands registered. Three client tests failed on the missing kind and
functions, then passed. The native smoke test now calls both commands from the
real webview. A permission-check outage interrupted the work between the native
implementation and its test run; nothing was committed in between.

The first staged run failed the native unit gate on `commit_import`'s generated
handling of an unmanaged database; the no-database IPC test now calls
`commit_import` as well as `retrieve_history`. Run stage by stage with
`CARGO_BUILD_JOBS=8`, every stage of `npm run check` then passed: 133 Rust unit
tests, 37 integration tests, 48 frontend/tooling tests, offline native execution
with the new IPC calls, nine probes and five report checks, all at 100% per file,
plus TypeScript/build, formatting and Clippy, peaking at about 3.8 GB used.
`npm run tauri -- build --no-bundle` passed on Linux.

## Retrieval controls (2026-09-29)

Integrated through PR #36 (`b0c4489`), branched from `main` at `6501c59`: PR A of
two for the review and commit controls. Either start action now validates, then
retrieves: the start controls are hidden and a Cancel button takes focus, the
status names the warp, page and rolls so far or a pending retry, and focus returns
to the starting control at the end. Every retrieval failure, `cancelled` and "no
history found" has a message, prefixed with the warp and page where retrieval
stopped unless the user cancelled. Once Cancel is pressed, progress stops showing;
a success that races the cancel is discarded and reported as cancelled, and a
cancel that cannot be sent re-enables the button. Until PR B adds the review, a
retrieved preview is discarded at once and the panel says how many new rolls were
found. The roadmap gains a step to decide on a component framework, and review the
visual design, before the stored-history display.

TDD: eight new UI tests (the chained flow, warp names, no history, retrieval
failures and four cancel cases) and four updated ones failed on the missing
controls and the old "accepted" result, then passed.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: 133 Rust unit tests, 55 frontend/tooling tests, offline native execution
(where the synthetic key fails validation and focus returns to the file chooser),
nine probes and five report checks, all at 100% per file, plus TypeScript/build,
formatting and Clippy, peaking at about 3.0 GB used.
`npm run tauri -- build --no-bundle` passed on Linux. The running and cancelling
states are covered by jsdom tests only; the offline native test cannot reach them.

## Review and save controls (2026-09-29)

Integrated through PR #37 (`975eb1c`), branched from `main` at `b0c4489`: PR B, which
completes the review and commit controls. A retrieved preview now stays held and
the panel shows a review: a heading that takes focus ("Ready to save 412 new
rolls", "Everything here is already saved" or "Some rolls conflict with your saved
history"), the UID, server and server-time date range, and a table of new, already
saved and conflicting rolls for each of the six warps. Save commits and reports
"Saved 412 new rolls to this device. 88 were already saved."; Discard drops the
preview, and Done replaces both when nothing is new. Conflicts are listed by warp,
time and ID, and Save is disabled and described by the explanation, since the
native commit refuses them. Save failures (`conflict`, `stale_preview`,
`no_preview`, `storage`, `context_mismatch`) have messages, and every ending
returns to the start controls with focus on the control that started. The empty
state now says showing saved history is coming next; it still says there are no
rolls after a save until the stored-history display exists. AGENTS.md now says the
acquisition UI exists.

TDD: six new UI tests (review and save, wording, discard, Done, conflicts and save
failures) and five updated ones failed on the missing review, then passed. A
WebKit (MiniBrowser) screenshot of the built page, with a synthetic native mock in
a scratch copy, checked the review and conflict layouts at 1000 and 390 pixels
wide: focus on the heading and no horizontal scrolling.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: 133 Rust unit tests, 60 frontend/tooling tests, offline native execution,
nine probes and five report checks, all at 100% per file, plus TypeScript/build,
formatting and Clippy, peaking at about 2.9 GB used.
`npm run tauri -- build --no-bundle` passed on Linux. The review is covered by
jsdom tests and the mocked screenshot; the offline native test cannot reach it.

## Data folder name (2026-09-29)

Integrated through PR #38 (`351ed8a`), branched from `main` at `975eb1c`, after the user
tested PR B on Windows. Cancel, retrieval, the review, saving, the database under
`%LOCALAPPDATA%` and a repeat retrieval all worked. Two follow-ups came out of it:
both collaboration warps returned no records although the account has some (next
task), and the folder name `com.shra-ja.roll-tracker`, Tauri's default from the
bundle identifier, looked out of place.

The folder is now `Roll-Tracker` in the platform's local data folder
(`roll-tracker` on Linux, at the user's choice). The setup hook now opens the main
window, instead of `tauri.conf.json`, so it can put the webview's profile in the
same folder: WebView2 adds its `EBWebView` folder there on Windows, and WebKitGTK
gets a `webview` subfolder, since it writes its folders straight into the one it
is given. In portable mode the profile moves into `data` with the database, so
the app leaves nothing of its own outside it. History saved in the old folder is
moved by hand. Decision 0009 is amended, and decision 0010, ARCHITECTURE and the
README follow.

TDD: three unit tests (the folder name and webview subfolder, the registration
test now expecting the named folder and an opened window, and a window without a
data folder) failed against stubs, then passed. The IPC test helper now uses the
window the setup hook opens.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: 135 Rust unit tests, 60 frontend/tooling tests, offline native execution
(the window opened from code, with its title, and WebKit created
`~/.local/share/roll-tracker/webview`), nine probes and five report checks, all
at 100% per file, plus TypeScript/build, formatting and Clippy, peaking at about
3.2 GB used. One 320-byte default-named `.profraw` file appeared in `src-tauri/`;
it came from a manual `cargo test --lib` run before the check, not from the gates
(see the rate-limit pacing section), and was deleted. `npm run tauri -- build --no-bundle` passed on Linux, and
the `cargo-xwin` Windows build succeeded.

## Rate-limit pacing (2026-09-29)

Integrated through PR #39 (`e612e25`), branched from `main` at `351ed8a`. While
testing the data folder on Windows, one retrieval stopped at page 2 with "didn't
accept your warp history link (error -110)"; retrying a little later worked. The
key was about an hour old, and several retrievals had just run with no pause
between requests. Other open-source exporters treat `-110` as "visit too
frequently", so the classifier now maps it to `RateLimited`, which shows the
existing "too many requests" message and stops validation instead of trying
further keys. A new `Paced` transport waits 500 ms before every request, between
`Cancellable` and `Retrying`, in validation and retrieval. The API contract
records the observation, marked unconfirmed, and the pacing.

TDD: the classifier test (now expecting `-110` as rate limited), a validation case
for `-110`, two `Paced` tests (the pause before each request, and cancelling during
it) and a desktop test timing validation and retrieval failed, then passed. A
validation test that used `-110` as an arbitrary rejection code now uses `-111`.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: 138 Rust unit tests, 60 frontend/tooling tests, offline native execution,
nine probes and five report checks, all at 100% per file, plus TypeScript/build,
formatting and Clippy, peaking at about 3.7 GB used.
`npm run tauri -- build --no-bundle` passed on Linux, and the `cargo-xwin` Windows
build succeeded. A default-named `.profraw` file again appeared in `src-tauri/`,
written before the check started, during a manual `cargo test --lib` run; the
earlier one matched such a run too. Manual Cargo runs reuse artifacts the
coverage gates instrumented, which then write profiles without a configured path.
It was deleted; the gates themselves leave none.

## Collaboration endpoint (2026-09-29)

Integrated through PR #40 (`e558c81`), branched from `main` at `e612e25`. The
Windows test of PR #37 found no records for either collaboration warp, although
the account has some: the normal endpoint accepts `21` and `22` but returns an
empty list, so those rolls were silently omitted. After the user opened both
collaboration histories in the game, a redacted read-only scan of the cache found
them requested from `getLdGachaLog`, and three user-authorized requests confirmed
that keys work on both endpoints and the response shape is identical (see the
[research](../../HSR-API-RESEARCH.md#collaboration-endpoint-2026-09-29)).

Page requests for `21` and `22` now go to `getLdGachaLog`; extraction accepts
cached requests to either endpoint, so a key found only in a collaboration request
still works; and the HTTP transport's guard allows exactly the two endpoints. The
same key cached from both endpoints is one context. The contract, research notes,
ARCHITECTURE and IMPORTS record the correction. Histories saved before this fix
lack collaboration rolls; retrieving again adds them, as stored rolls are
recognised as duplicates.

TDD: four tests (the endpoint per category, cached collaboration requests
supplying contexts, the transport allowing the collaboration endpoint, and
pagination expecting collaboration URLs) failed, then passed; the refused-URL and
transport-guard cases gained near-miss collaboration spellings.

A Windows retrieval with the endpoint fixed returned exactly 20 records for each
collaboration warp, far fewer than the account has. Fifteen more user-authorized,
paced requests (five pages each at sizes 5, 20 and 1000) showed that
`getLdGachaLog` caps pages at 20, echoing that as `data.size`, and that the
records are identical whatever the size. The short-page rule compared pages with
the requested 1000, so each collaboration warp stopped after its first page.

A first fix compared pages with the echoed size instead; on Windows it rejected
the first Stellar page at once. The saved research responses show `getGachaLog`
always echoes `size` as `"0"`, a fact the synthetic fixtures (echoing `"20"`) had
hidden; it should have been checked before relying on the echo. At the user's
choice, pagination now ends a category only on an empty page and ignores the echo,
at the cost of one request per category with records. A page with more records
than requested is still invalid, and a repeated cursor is still a cycle. Requests
stay at 1000 on both endpoints. The fixtures now echo `"0"`, like real
`getGachaLog` responses, and the contract and research record the evidence.

TDD: the pagination tests were rewritten for the rule, with fixtures echoing
`"0"`: pages of 20, then an echoed `"0"`, then no `size`, continue until an empty
page, and each category with records needs its empty page. Ten failed against the
echoed-size rule, then passed. Desktop, cancellation and integration scripts
gained the empty page after the fixture page.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: 142 Rust unit tests, 60 frontend/tooling tests, offline native execution,
nine probes and five report checks, all at 100% per file, plus TypeScript/build,
formatting and Clippy, peaking at about 3.5 GB used.
`npm run tauri -- build --no-bundle` passed on Linux, and the `cargo-xwin` Windows
build succeeded.

The user's Windows retrieval with this rule brought in all collaboration rolls,
but took noticeably longer. At the user's request, the roadmap gains an optional
incremental-retrieval design step, with separate quick-refresh and
full-retrieval actions at the user's choice; the roadmap's pagination and endpoint items
are corrected.

## Toolchain refresh (2026-09-29)

Integrated through PR #41 (`1f01756`), branched from `main` at `e558c81`, before the
framework port, so any breakage is attributable to the upgrade alone. There were
no major versions to catch up on; TypeScript 7.0.2, the other Rust crates and the
Cargo-installed tools were already current (Tauri 3 is still alpha).

| Tool | From | To |
| --- | --- | --- |
| Node.js | 26.8.1 | 26.10.0 |
| Rust nightly | 2026-09-16 | 2026-09-28 (rustc 1.101.0) |
| `tauri` / `tauri-build` | 2.11.5 / 2.6.3 | 2.12.0 / 2.7.0 |
| `@tauri-apps/cli` / `@tauri-apps/api` | 2.11.4 / 2.11.1 | 2.12.0 / 2.12.0 |
| Vite / Vitest / `@vitest/coverage-v8` | 8.3.0 / 5.0.1 / 5.0.1 | 8.3.1 / 5.0.2 / 5.0.2 |
| jsdom / `@types/node` | 30.1.0 / 26.6.1 | 30.1.1 / 26.6.3 |

Tauri 2.12 moved several of its own dependencies to new major versions (for
example `tao`, `muda` and `brotli`). `cargo-llvm-cov` 0.9.1, `tauri-driver` 2.0.6
and `cargo-xwin` 0.23.1 were reinstalled for the new nightly, whose rustfmt,
clippy, llvm-tools and Windows target were added. Each asdf Rust version keeps its
own rustup home, so components must be added after switching `.tool-versions`;
the first check run failed on this, and a second on crates not yet fetched for the
offline build, before any test ran. Decisions 0001 and 0006 and the README record
the new pins.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed on the new toolchain, including the nightly branch-coverage probe: 142
Rust unit tests, 60 frontend/tooling tests, offline native execution, nine probes
and five report checks, all at 100% per file, plus TypeScript/build, formatting
and Clippy, peaking at about 4.6 GB used during the full rebuild.
`npm run tauri -- build --no-bundle` passed on Linux, and the `cargo-xwin` Windows
build succeeded.

## Vue foundation (2026-09-29)

Integrated through PR #42 (`5424d7c`), branched from `main` at `1f01756`: PR A of two
for the move to Vue ([decision 0011](../../decisions/0011-vue-frontend.md)). The user
chose Vue over Preact and React for its community, ecosystem and recognition,
TypeScript 6 over 7 until Vue's tooling supports 7, and `create-vue` and Tauri
conventions regardless of the app's size, with small presentational components
since the UI is a placeholder that will be reorganised.

- **Dependencies (exact):** `vue` 3.5.43; dev `@vitejs/plugin-vue` 6.0.9,
  `@vue/test-utils` 2.5.1, `vue-tsc` 3.3.11, `@vue/tsconfig` 0.9.1,
  `@tsconfig/node26` 26.0.1; TypeScript 7.0.2 replaced by 6.0.3.
- **Types:** `tsconfig.json` references `tsconfig.app.json` (browser only),
  `tsconfig.vitest.json` and `tsconfig.node.json`; `npm run typecheck` runs
  `vue-tsc --build`, and `npm run build` runs it first. Mutations confirmed that
  Node's `process` in app code and a template type error both fail. The stricter
  Node settings type `fetch().json()` as `unknown`, so the native test's WebDriver
  helper now declares its response shape.
- **Vite and Vitest:** `scripts/vite-config.ts` holds Tauri's recommended
  settings and the `ui` (jsdom), `tooling` (Node) and `gates` (Node) projects with
  the coverage settings, replacing command-line flags; `vite.config.ts` only
  delegates to it. Vitest hard-codes its config file out of coverage, so the
  delegate is a third guarded exception, pinned in `reports.test.ts` and recorded
  in AGENTS, CONTRIBUTING and TESTING. `.vue` files join coverage and the
  inventory; declaration files, which compile to nothing, are left out of both.
- **Review screen:** `src/components/ReviewPanel.vue` replaces the hand-built
  review markup; `main.ts` renders it only while reviewing and keeps the native
  calls. Warp names and plurals moved to `src/format.ts`. Two UI tests now wait
  for Vue's next render or look elements up again, and four check that the review
  is absent rather than hidden; the behaviour they check is unchanged.

TDD: the config test and six `ReviewPanel` tests failed first (missing files, then
against stubs, and the focus test against a first watcher that focused a tick
late), then passed; the config module's five tests, rewritten for the full
settings, failed against a stub and then passed.

The first full check failed one gate: `npm run coverage` appended an HTML
reporter, which with the reporters now in the config replaced them instead of
adding to them, so no JSON summary was written. The script now lists all four
reporters. Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of
`npm run check` then passed: 142 Rust unit tests, 70 frontend/tooling tests,
offline native execution (loading the Vue runtime under the production CSP),
nine probes and five report checks, all at 100% per file, plus the type check,
build, formatting and Clippy, peaking at about 3.4 GB used. The JavaScript bundle
is 75 KB (29 KB gzipped). `npm run tauri -- build --no-bundle` passed on Linux,
and the `cargo-xwin` Windows build succeeded. WebKit screenshots of the built page
with a synthetic native mock show the review and conflict layouts unchanged.

## Frontend workspace (2026-09-29)

Integrated through PR #43 (`3bec652`), branched from `main` at `5424d7c`. At the user's
request the frontend is now self-contained, like `src-tauri/`, with the same test
rule; there is no behaviour change.

- **Layout:** `src/`, `index.html`, `vite.config.ts` and the app and test type
  projects moved into `src-ui/` with `git mv`. `src-ui/package.json`
  (`roll-tracker-ui`) holds Vue, `@tauri-apps/api` and the frontend's tools; the
  root `package.json` is the npm workspace root with the Tauri CLI, Vitest and
  repository tooling. Tauri builds from `src-ui/dist`.
- **Tests:** unit tests are siblings (`src-ui/src/commands.test.ts`,
  `src-ui/src/components/ReviewPanel.test.ts`, `src-ui/build/vite.test.ts`); the
  whole-page test is the integration test `src-ui/tests/app.test.ts`.
- **Tests and coverage:** each half runs its own tests, as the backend does with
  Cargo. `src-ui/build/vite.ts` holds the frontend's Vite and Vitest settings
  (jsdom, with the Vite config test opting into Node per file), and `src-ui`'s
  `npm test` and `npm run coverage` run them, reporting to `coverage/frontend/`.
  A root `vitest.config.ts` delegates to the new `tooling/vitest-config.ts`, with
  the `tooling` and `gates` projects and tooling coverage in `coverage/tooling/`.
  The root commands run the frontend's, then the tooling's. All reports stay in
  the root `coverage/`, where the gates read them, as the Rust reports already
  do. A first attempt ran everything from the root with the frontend projects
  rooted at `./src-ui`; coverage matched its globs relative to that root and
  missed every frontend file, and the user preferred the frontend to own its
  tests anyway.
- **Types:** the root `tsconfig.json` references `src-ui/` (app, UI-test and build
  projects) and a root Node project; `vue-tsc --build` checks all.
- **Config imports:** both delegates import their modules with the `.ts`
  extension (`./build/vite.ts`, `./tooling/vitest-config.ts`), which Vite's
  planned native config loader requires; it warned on every run before. Both Node
  type projects allow `.ts` imports, which is safe as they never emit. The guard's
  pinned text changed first and failed, then passed.
- **Root tooling:** at the user's request, `scripts/` is split in two. The tooling
  modules (`coverage.ts`, `native-coverage.ts`, `vitest-config.ts`) move to
  `tooling/` with their unit tests beside them, including `ci.test.ts`; the report
  checks and probes join the native end-to-end test in root `tests/`, now defined
  as repository-level verification. At the user's choice, its files were then
  renamed: `e2e-smoke.test.ts`, `close-window-helper.py`,
  `coverage-reports.test.ts`, `mutation-probes.test.ts` and
  `backend-coverage-stages.test.ts`; the helper module became
  `tooling/backend-coverage.ts`, with its functions renamed from `native…` to
  `backend…`.
- **Retiring "native":** the report folders became `coverage/backend-unit/` and
  `coverage/backend/`; the npm scripts became `coverage:backend-unit` (and its
  `:json` form), `test:backend-integration`, `test:e2e-smoke`,
  `coverage:backend-report`, `test:e2e-probe` (and `:stages`) and `test:backend`,
  with `test:offline` and `test:backend-probe` unchanged; the stages became
  "backend coverage report", "reset backend probe" and "backend JSON report", the
  gate "backend wrapper coverage", and the screenshot `test-results/e2e-smoke.png`.
  CI uploads the renamed folders. The helper's test changed first and failed.
- **Gates:** separate frontend and tooling coverage checks, each against its own
  source list; the inventory covers `src-ui/src`, `src-ui/build` and `tooling`,
  excludes `*.test.ts` and the test folders, and pins both delegates. The
  discovery probe adds a failing suite in each tested place, one at a time,
  since the frontend's failure stops the commands before the tooling's; the probe
  refresh also clears `coverage/tooling/`, and CI uploads it. A stale root `dist/` from before the
  move was deleted. Docs and `src-ui/README.md` describe the layout.

TDD: the root Vitest config tests and the Vite config test failed against a stub
and the previous settings at each stage, then passed; so did the report helper's
test of the folders it clears.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: 142 Rust unit tests, 41 frontend and 31 tooling tests, offline native
execution (the app built from `src-ui/dist`), nine probes and six report
checks, all at 100% per file, plus the type check, build, formatting and Clippy,
peaking at about 3.4 GB used. `npm run tauri -- build --no-bundle` passed on Linux, the `cargo-xwin`
Windows build succeeded, and `npm run dev` served the app from the workspace on
`127.0.0.1:1420`.
