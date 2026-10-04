# Project status

Updated: 2026-10-04

Milestones 1 and 2 provide the local Tauri shell, HSR response parser, immutable
import previews and transactional SQLite history storage. Repeated imports retain
unique rolls, first-import provenance and compact batch summaries. The
[HSR API contract](../HSR-API-CONTRACT.md) contains the settled acquisition assumptions
and retry policy. Milestone 3 is complete: on the user's request the app
retrieves Honkai: Star Rail warp history from HoYoverse, reviews and saves it
locally, and shows the saved history, which survives restarts.

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
locations. [Decision 0010](../decisions/0010-portable-mode.md) records it.
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
[research](../HSR-API-RESEARCH.md#collaboration-endpoint-2026-09-29)).

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
for the move to Vue ([decision 0011](../decisions/0011-vue-frontend.md)). The user
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

## Vue app structure (2026-09-30)

Integrated through PR #44 (`f85158d`), branched from `main` at `3bec652`. The rest of the
page moves to Vue, following decision 0011, in four commits; retrieval behaves
as before.

- **Shell and router:** `vue-router` 5.3.1 (exact; the version `create-vue`
  installs). `main.ts` mounts `App.vue` on `#app`: the header, a `RouterView`
  inside `<main>` and the footer, so the header and footer are now page landmarks
  rather than sitting inside `<main>`. `router/index.ts` has one hash-history
  route, `views/HomeView.vue`; the wordmark is a `RouterLink` to it. At the
  user's choice there is one view for now; retrieval moves to its own route when
  the stored-history mockup settles navigation.
- **Flow:** `composables/useRetrieval.ts` holds the retrieval flow as read-only
  state (phase, source, status, review, cancelling) and actions, and is the only
  frontend caller of the native commands. The failure, progress and save text
  moved unchanged into `messages.ts`.
- **Components:** `GameSelect` (`v-model`), `EmptyState` and `RetrievalStart`
  join `ReviewPanel`, all presentational. The view moves focus when the phase
  changes: to Cancel while acquiring, and back to the starting control, through
  `RetrievalStart`'s exposed `focus`, when the flow returns to idle.
- **Styles:** at the user's choice, base styles are in `assets/main.css` and
  each component carries scoped styles. One rule for the retrieval introduction
  had matched nothing since the start controls gained a wrapper; it now applies,
  giving that paragraph the same 460px centred width as the text below it.
- **Tests:** unit tests beside each new module cover every failure message, the
  cancel races and each component; the integration tests in
  `src-ui/tests/app.test.ts` keep one case per flow, with focus and the wiring
  between components, and now wait for Vue's next render after each interaction.

TDD: the message, composable and component tests each failed first (missing
modules), then passed; the integration tests passed before and after each step.
A mutation that always returned focus to the search button failed the
file-chooser test.

The first full check failed the frontend report gate: V8 counted no statements in
the router module, a single `export default createRouter(...)`, and the gate
rejects a file with nothing measured, since that also describes a file never
loaded. The module now assigns the router to a constant and exports it, as
`create-vue`'s template does, and is measured. Run stage by stage with
`CARGO_BUILD_JOBS=8`, every stage of `npm run check` then passed: 142 Rust unit
tests, 114 frontend and 31 tooling tests, offline native execution under the
production CSP, the probes and six report checks, all at 100% per file, plus the
type check, build, formatting and Clippy. The native screenshot matches `main`'s
apart from the retrieval introduction's narrower width. The JavaScript bundle is
102 KB (39 KB gzipped) and contains no `eval` or `new Function`.
`npm run tauri -- build --no-bundle` passed on Linux, and the `cargo-xwin`
Windows build succeeded.

## Linting and formatting (2026-10-01)

Work is on `build/lint-format`, branched from `main` at `f85158d`, following
[decision 0012](../decisions/0012-linting-and-formatting.md), in four commits.

- **Tools (exact):** ESLint 10.11.0 in both workspaces with `jiti` 2.7.0 for
  TypeScript configs; in `src-ui`, `eslint-plugin-vue` 10.11.1,
  `vue-eslint-parser` 10.4.1, `@vue/eslint-config-typescript` 14.9.0 and
  `eslint-config-prettier` 10.1.8; at the root, `@eslint/js` 10.0.1 and
  `typescript-eslint` 8.71.0; `@vitest/eslint-plugin` 1.6.27 in both; Prettier
  3.9.9 at the root.
- **Configs:** at the user's choice, each workspace owns its ESLint config,
  with the stricter type-aware rule sets, and one root Prettier config uses
  `create-vue`'s style (no semicolons, single quotes, 100 columns). Both
  `eslint.config.ts` files are guarded delegates to unit-tested modules, pinned
  beside the Vite and Vitest configs. Prettier skips Markdown at the user's
  request, the HSR API fixtures and the agent skills.
- **Reformat:** the second commit only applies Prettier and is listed in
  `.git-blame-ignore-revs`. Vue now keeps a space either side of a button label
  written on its own line, so the integration test's button lookup trims text;
  the guard's pinned delegate bodies lost their semicolons.
- **Findings fixed:** `cancel` and `save` became arrow functions like the other
  composable actions (`unbound-method`); `RetrievalStart`'s `id` attributes
  moved first; tests mark deliberately unawaited calls with `void` and throw
  native failures, which are plain objects, through a `reject` helper; parsed
  coverage JSON and WebDriver responses are typed (`LlvmCoverageExport`, a
  generic request helper) instead of `any`; the report gates use `test.each`;
  the end-to-end network precondition throws instead of asserting in
  `beforeAll`; a regex spells out its six spaces as `{6}`.
- **Gates:** `npm run check` runs `format:check` and `lint:check` (warnings
  fail) first, so CI does too.

TDD: both config tests failed first (missing modules), then passed; the tests
for expectation messages, `expect…` helpers and the stage-runner exemption
failed against the first configs and passed after. A first message fixture used
a string literal, which the rule already allowed, so it passed before the change
and was replaced with a variable. Removing the Prettier override made the
frontend's formatting test fail on six Vue layout rules.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint with no warnings, 142 Rust unit tests, 120 frontend and
36 tooling tests, offline native execution, nine probes and six report checks,
all at 100% per file, plus the type check, build, Rust formatting and Clippy.
`npm run tauri -- build --no-bundle` passed on Linux, and the `cargo-xwin`
Windows build succeeded.

## Visual design review (2026-10-01)

A new visual design replaces the placeholder UI. The mockups live on a design
canvas outside the repository, built with synthetic data. They cover the Warp
and Wish history screens, the empty state, and the import flow: choose a
source (retrieval or a manually chosen `data_2` cache file; history-file import
is shown disabled as coming soon), progress, review, saved, and two failures (expired link, game files not found).
The history list has rarity filters, search, list/grid/icon layouts, a pity
column with soft-pity or 50/50 colouring, and styled tooltips.

Decisions from the review:

- Pity treats each pity group's stored rolls as complete and is recalculated
  when older rolls are imported. It is derived on read, not stored; see
  [architecture](../ARCHITECTURE.md#statistics). `AGENTS.md` now states this rule.
- Soft-pity colour thresholds are per banner category. 50/50 colouring is
  disabled with a tooltip until banner metadata exists.
- Item icons and banner art stay placeholders. Obtaining real art without
  committing game assets is an open decision that may relax the local-only rule.
- Layouts are fluid: screens fill the window, wrap, collapse the sidebar to
  icons at 900px and drop list columns as space shrinks (Type, then Banner, then
  Time). The minimum window is 480×560, which excludes phones in either
  orientation; mobile is out of scope for now.
- The typeface is Hanken Grotesk, chosen over IBM Plex Sans, Manrope, DM Sans
  and Figtree, and will be bundled. Dark theme only for now.

Documentation only: no code changed and no checks were run.

## Font and minimum window (2026-10-02)

Work is on `feat/ui-foundation`. Hanken Grotesk is bundled from the pinned
`@fontsource-variable/hanken-grotesk` 5.3.0 package (Open Font License): Vite
copies its WOFF2 files into the build, and the base style uses it with a system
fallback. No remote font is requested. The main window's minimum size is now
480×560 (decision 0013), up from 360×580. The roadmap now breaks the
stored-history display into three tracked steps (shell, native page command,
History screen) and moves filters, search, the summary strip, the extra layouts
and pity to milestone 4. The completed API-contract item is ticked.

TDD: the native smoke test now shrinks the window to 320×320 through WebDriver
and checks the webview stays 480×560; it failed at 360×580 before the change.
It also checks, offline, that the page's computed font is Hanken Grotesk and
that the face has loaded; that failed before the package was added.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 142 Rust unit tests, 120 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` also passed, including the
backend integration tests and the native smoke test.

## App shell (2026-10-02)

Work is on `feat/app-shell`. The webview now has the design's shell: a sidebar
with game and screen links (current ones marked; icons only below a 900px app
width) beside per-game History and Import screens. The app opens on Star Rail's
Warp History, which shows an empty state linking to Import until stored history
is displayed. The existing retrieval flow moved onto Star Rail's Import screen,
unchanged apart from base styles; Genshin Impact's Import screen says retrieval
is coming soon. The shell owns the flow, so a retrieval and its review survive
switching screens. Base styles use the decision 0013 colour tokens. The old
home screen and game dropdown are gone.

TDD: the new shell, routing, persistence and empty-state tests failed before the
sidebar, routes and views existed; the retrieval tests now reach the flow through
the sidebar. The native smoke test opens Import with Enter on the sidebar link.
Its screenshots showed the Cancel button visible after a failure, because a
display style overrode the `hidden` attribute, and the collapsed sidebar still
showing its storage note; computed-style checks failed for both before the fixes.
A temporary canvas measurement confirmed the bundled font renders. The smoke
test now also saves `test-results/e2e-history.png` at the default window size.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 142 Rust unit tests, 124 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` also passed.

## Import screens (2026-10-02)

Work is on `feat/import-screens`. The Import screen now follows decision 0013,
one step at a time: the sources (retrieval by search or a chosen cache file;
file import shown as coming soon; Genshin Impact's disabled), a progress screen
marking each step with the live status and Cancel, the review (account, summary
strip, server-time period, per-warp table, conflicts, and a fixed footer with
Save, Discard or Done), a Saved screen linking to the history, and a Failed
screen headed by the failure's kind with Try again (device searches), "Choose
cache file…" and Back. Cancels, discards and up-to-date or empty retrievals
return to the sources with a note. The retrieval composable now reports its
stage and outcome instead of a closing status sentence, and failure kinds have
titles. The review's roll preview and per-category progress counts remain their
own roadmap items.

TDD: the composable and message tests failed on the previous code (39 red); the
component tests for the sources, picker, progress, saved and failed screens and
the restyled review failed before the components existed, as did the rewritten
app tests (21 red in total). The native smoke test now reaches the Failed screen
from the automatic search and chooses the cache file there, through WebDriver's
file upload to the visually hidden input. It saves `test-results/e2e-import.png`.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 142 Rust unit tests, 160 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` also passed.

## Mock debug binary (2026-10-02)

Work is on `feat/mock-binary`. A second debug binary, `roll-tracker-mock`, runs
the app against an in-process synthetic HoYoverse
([decision 0014](../decisions/0014-mock-debug-binary.md)); the shipped binary is
unchanged. Commands take their transport from a managed `Network` (HTTPS or the
mock); the mock keeps history in its own `roll-tracker-mock` folder, never in
portable mode. Scenarios cover multi-page history, an expired link, a network
failure partway through, a rate limit and no history. `npm run tauri:mock` runs
it by hand. The native smoke test now drives it through retrieval, review,
saving, a second retrieval that finds everything saved, and a network failure,
with screenshots (`test-results/e2e-mock-*.png`); a shared `tests/app-driver.ts`
drives each app. The screenshots showed focus outlines on announced headings,
now removed, and the raw server ID (`prod_official_asia`), now a roadmap item.
Lucide icons are also on the roadmap.

TDD: the mock transport's tests failed on `todo!()` placeholders, then passed;
the desktop tests for the mock network and its separate data folder failed to
compile before `Network` and `register_mock` existed. The coverage gate now lists
and pins the mock binary as a native delegate. A plain `cargo build` had left
uninstrumented binaries, so the first native run found no coverage data until
`cargo clean -p roll-tracker`; the full suite cleans before building. A first
release build also produced the mock binary, so it now needs the `mock` Cargo
feature (`required-features`), which the native tests, `npm run tauri:mock` and
Clippy (`--all-features`) enable; `npm run tauri -- build --no-bundle` builds
only the real app.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 150 Rust unit tests, 160 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file (the mock
binary and `main.rs` at 100% native coverage), Rust formatting and Clippy.
`npm run test:offline` passed, including all three native tests.

## Saved rarity counts (2026-10-02)

Work is on `feat/rarity-counts`. The import review now counts the new 5★ and
4★ rows (`new_five_star`, `new_four_star`): rows with that rarity among the
rolls being added, not unique items, and never stored or conflicting rows. A
save can only commit the reviewed counts, so the Saved screen shows them in
tiles beside "Existing rolls skipped"; its sentence now names only the account.

TDD: the storage review test, extended with a new 4★ and 3★ beside the stored,
conflicting and new 5★, failed on the missing counts, then passed; the
composable, Saved screen and app tests failed before the counts were carried
through. The end-to-end test checks the mock's 32 five-star and 206 four-star
rows on the Saved screen.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 150 Rust unit tests, 160 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` passed, including all three
end-to-end tests.

## Stored history page command (2026-10-02)

Integrated through PR #53. Work was on `feat/history-page`. A new `history_page` command reads one page of
saved rolls for a banner category, for the account the latest import went into:
newest first by server time, then by numeric roll ID within the same second (the
HSR contract now records why), each with its position number, item, rarity, type
and time, plus the category's total. Requests are checked before the database is
opened; a bad category, page or page size returns the new `invalid_request`
failure. With no import yet it returns no account and no rolls. It never
contacts HoYoverse; the capability allows it for the main window.

TDD: the storage and desktop unit tests failed to compile before `latest_account`,
`page`, `history_into` and `InvalidRequest` existed. A real-SQLite integration test
covers same-second rolls whose IDs differ in length, paging past the end, category
and account separation, and the latest account switching; dropping the length
tiebreak from the query made it fail. The end-to-end tests check that the
capability refuses a bad request and that the mock's saved history reads back
newest first, with the right total, numbers and last page.
The unit coverage gate then caught untested row-reading failures in
`latest_account`, a failing account query, and the generated checks for each
`history_page` argument; tests now cover them.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 157 Rust unit tests, 160 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` passed, including the storage
integration tests and all three end-to-end tests.

## Category totals (2026-10-03)

Integrated through PR #54. Work was on `feat/category-totals`. Each `history_page` result now also counts
the account's rolls in every category, in `Category::ALL` order with zeros for
empty ones, so the History screen's tabs can show their counts from one read.
One grouped query replaces the selected category's count, which is taken from
it. A count for an unknown category is reported as damaged storage. With no
import yet every count is zero.

TDD: with the new types stubbed to return no counts, seven storage and desktop
unit tests failed (the old count query and the missing counts), then passed. The
real-SQLite integration test checks the counts beside empty categories and
another account; the end-to-end test checks the mock's six counts.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 159 Rust unit tests, 160 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` passed, including the storage
integration tests and all three end-to-end tests.

## History screen (2026-10-03)

Integrated through PR #55. Work was on `feat/history-screen`. Star Rail's History screen now shows saved
history, read from this device only, never HoYoverse. The header shows the
account the latest import went into (UID and server, as text until accounts can
be switched). Category tabs carry their counts; the counts drop and then the tabs
become a "Banner category" dropdown when hidden copies of the tab row, measured
against the available width, show they no longer fit. The list shows #, item
(with a rarity-tinted initials placeholder), rarity, type and server time with
the offset in its header, newest first; Type and then Time drop out as the list
narrows. A pager shows the range, page numbers around the current page with the
first and last, and 20, 50 or 100 rows per page. The screen opens on Character
Event Warp, or on the first category with rolls when that has none. An empty
category says so; with nothing saved, and for Genshin Impact, the empty state
still links to Import. A failed read shows an alert with Try again. The
`historyPage` command wrapper and the `invalid_request` failure kind are added.
Filters, search, the summary strip, the other layouts and pity stay in
milestone 4.

With 14 components, `src-ui/src/components/` is now grouped by where each is
used: `layout/` (sidebar, screen header), `history/`, `import/` and `shared/`
(the cache picker), each test still beside its component. The frontend README,
which still described the old home screen, now describes the current layout.

TDD: the command, message and format tests failed before `historyPage`,
`invalid_request`, `historyFailure` and the new format helpers existed (8 red);
the `useHistory` tests and the five component tests failed before their modules
existed, and the four new app tests failed on the old History screen. The
end-to-end test now follows "View warp history" from the Saved screen of the
mock binary, checks the account, the six tab counts, the time offset and the
newest rows, pages forward, and saves `test-results/e2e-mock-history.png`.

The History screen's read opens the database on launch, so an empty database now
appears before the first import (the user accepted this over skipping reads
without a file). The mock network-failure test now checks, through the app, that
no rolls were saved, instead of that no file exists. In the end-to-end
screenshots the tabs show their counts in a 1280px window and become the
dropdown at the 480px minimum, where Type and Time have dropped out
(`e2e-mock-history.png`, `e2e-mock-history-narrow.png`); the first run showed the
counts already dropping at the default window size.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 159 Rust unit tests, 188 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` passed, including all three
end-to-end tests.

## Server names (2026-10-03)

Integrated through PR #56. Work was on `feat/server-names`. Star Rail servers now show as the game names them
wherever the account appears (the History screen's account, the review's account
and the Saved screen's sentence): `prod_official_usa` America,
`prod_official_eur` Europe, `prod_official_asia` Asia, `prod_official_cht`
TW, HK, MO, `prod_gf_cn` China and `prod_qd_cn` China (Bilibili). Any other
server shows as given. Only the display changes; the reported value is stored
and compared as before. The names follow the game's server list; only the mock's
`prod_official_asia` is exercised end to end, and no real response is recorded
for the others.

TDD: the format, message and three component and app tests failed before
`serverName` existed and was used (6 red); existing tests with the unknown
`synthetic-server` cover the fallback. The end-to-end test checks "Asia" in the
review, the Saved sentence and the History screen's account.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 159 Rust unit tests, 190 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` passed, including all three
end-to-end tests.

## Lucide icons (2026-10-03)

Integrated through PR #57. Work was on `feat/lucide-icons`. The hand-drawn inline SVG icons are now Lucide
icons from `@lucide/vue` 1.51.0 (ISC licence), pinned like the other
dependencies; `lucide-vue-next`, named on the roadmap, is deprecated in its
favour. Each icon is its own import, so only the ten used are bundled (the
script grew by 0.8 kB), and each is hidden from assistive technology as before.
The brand mark stays custom; the game monograms are text. Decision 0013 now
names Lucide. No behaviour changes. This completes the stored-history display.
`npm audit` reports four high-severity findings in `braces`, which only the
dev tooling pulls in (through the ESLint TypeScript config); the lockfile change
adds only `@lucide/vue`.

TDD: a new app-test check that every icon on each screen (except the brand
mark) is a decorative Lucide icon, with the expected names, failed on the
hand-drawn icons in 6 tests, then passed.

The end-to-end screenshots show the new icons in the sidebar, the sources,
the pager and the selects.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 159 Rust unit tests, 190 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` passed, including all three
end-to-end tests.

## ESLint test warm-up (2026-10-03)

Integrated through PR #58. Work was on `fix/eslint-test-warmup`. The `main` build after PR #57 (run #128)
failed: the frontend ESLint config test's first case took 6.2 s against
Vitest's 5 s limit. It was the first type-aware lint, which builds the
TypeScript program; over the previous 16 CI runs it took 2.1–4.8 s, and the
tooling config test's first case 2.0–3.8 s, against about 0.6 s locally. Nothing
in PR #57 caused it; the same code passed on the PR. Both tests now build the
program in `beforeAll` by linting a trivial file, under a 60 s hook timeout, so
each test times only its own checks.

Red/green: with `--testTimeout=400` standing in for a slow runner, the first
case of each file timed out before the change (606 ms and 755 ms) and both files
passed after it; locally the frontend's first case fell from about 600 ms to
16 ms.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 159 Rust unit tests, 190 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` passed. Test-only change, so no
release build was needed.

## Last import line (2026-10-03)

Integrated through PR #59. Work was on `feat/last-import`. A new `last_import` command reads the newest
batch summary from storage only: its time (Unix seconds by this device's
clock), source, UID, server and rolls added, or nothing before the first import.
The source crosses IPC as a kind (`hoyoverse`), not the internal adapter name;
a batch from an unknown adapter is reported as damaged storage. The capability
allows it for the main window. Star Rail's Import screen shows it below the
sources as "Last import · 21 Sep 2026, 15:13 · Retrieved from HoYoverse ·
UID … (Asia) · 96 new rolls saved", in the device's time zone. The server
follows the UID as on the Saved screen, which the design's line left out. The
line is read again whenever the sources appear, so it follows each save; a
failed read leaves it out, since the History screen reports storage failures.
Genshin Impact's Import screen shows no line.

TDD: with `last_import` stubbed to find nothing, the storage and desktop unit
tests failed, then passed with the query; an IPC test covers the generated
command wrapper, which fails safely on the worker thread. The real-SQLite test
checks no import, then the first, then another account's newer import. The
command, format and message tests failed before `lastImport`, `localDateTime`
and `lastImportParts` existed (3 red); the composable and component tests
failed before their modules existed, and the app test failed with no line shown.
Existing app tests that list the commands a retrieval makes now leave out the
Import screen's local read. The end-to-end test checks the line after the mock
save and saves `test-results/e2e-mock-last-import.png`.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 161 Rust unit tests, 197 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` passed, including the storage
integration tests and all three end-to-end tests.

## Retrieval progress counts (2026-10-03)

Integrated through PR #60. Work was on `feat/progress-counts`. While downloading, the progress screen now
follows decision 0013: a "Category 3 of 6 · 1,106 rolls so far" row, a bar
counting categories done, and, under "Downloading your rolls", each category by
its full in-game name (Stellar Warp, Departure Warp, Character Event Warp, Light
Cone Event Warp, Character Collaboration Warp, Light Cone Collaboration Warp),
in the order retrieval requests it, with its pages: done ones show how many
pages were requested, the active one its current page, waiting ones "—". It is
derived in the frontend from the existing progress events; no native change.
`useRetrieval` keeps the current category and page, each category's last page,
the rolls so far and whether a retry is due, reset for each retrieval. The
status sentence stays the polite live region, and is shown only before the first
page, during a retry wait and while cancelling. A category passed without any
page shows no count rather than failing. The user chose the fetch order, the
row in place of the visible sentence, and full names here (the short names stay
on the History screen's tabs, where space is tight). The tabs' short
collaboration names now keep the full names' word order: Character Collab and
Light Cone Collab, not Collab Character and Collab Light Cone.

TDD: the composable tests for the download state (2) and the component tests for
the row, bar, list and status visibility (2, then 1 for a skipped category)
failed before the change; the app test failed with no row shown. The component
test caught the row's two parts running together as text ("…of 61,106 rolls"),
now kept apart. The end-to-end test checks the row and the category order in the
mock binary's download.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 161 Rust unit tests, 202 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` passed, including all three
end-to-end tests; `e2e-mock-progress.png` shows the row and the list.

## Incremental retrieval, native side (2026-10-03)

Integrated through PR #61. Work was on `feat/incremental-retrieval`. The roadmap step is no longer optional
and is split into seven tasks; this covers the first four.
[Decision 0015](../decisions/0015-incremental-retrieval.md) and the HSR contract
record the quick-refresh rule: a category ends after the first page holding a
roll already saved for that page's own account (its UID and `region`), keeping
the page; a page without a region never ends it early; only a full retrieval
fills gaps. `Store::saved_rolls` reads the game's saved roll IDs grouped by
account in one query. `fetch_history` takes an optional `StopCheck` and reports
`Progress::UpToDate` (`up_to_date` in the webview) when a category ends at saved
rolls; without one it behaves as before. `retrieve_history` takes a `mode`
(`new` or `full`), checked before anything is taken from the session; `new`
reads the saved rolls first, and a failed read is a storage failure with nothing
sent. The webview passes `full` until the Import screen offers the choice, so
behaviour is unchanged.

TDD: the storage test for saved rolls, the pagination test for the stop check,
the three desktop tests for the mode (refused, stopping, unreadable) and the
frontend command test for `mode: 'full'` failed against stubs or the old code,
then passed. The event's serialization test was added with the variant, so it
had no red run. A real-SQLite integration test saves the fixture history, then
runs a quick refresh that stops at it (6 requests instead of 7, with nothing
new to save). The end-to-end test now sends a mode, and checks the capability
refuses an unknown one.

The unit coverage gate caught two gaps in the new pagination tests: a stop
check that was never called, and a condition that was always true. The no-server
test now has the check run once, for the page that names its server, which also
proves the unnamed page was skipped.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 167 Rust unit tests, 202 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` passed, including the storage and
pagination integration tests and all three end-to-end tests.

## Incremental retrieval, UI side (2026-10-03)

Integrated through PR #62. Work was on `feat/incremental-ui`, completing the step (tasks 5–7). The Retrieve
card has a switch, two real radios shown as a segmented control: "New rolls
only" (the default) or "Full history", with the hint "Select “Full history” to
fill in earlier gaps of missing data." The group's "What to retrieve" name is
for screen readers only, since the options speak for themselves. The screen's
introduction now reads "Choose where to import roll history from." It applies to both the device search and a chosen cache file, and
lasts while the app is open. The card now says it downloads "your roll history". The
webview sends the chosen mode; `up_to_date` progress is announced ("Light Cone
Event Warp is up to date: it reached rolls already saved.") and the progress list
marks such categories "Up to date" with their page counts, including the current
category as soon as its event arrives. `progressText` now handles each progress
kind explicitly, so the new event is not announced as a retry.

TDD: the command, message and composable tests (8), the progress component tests
(the up-to-date row, then the current category), the switch's component tests
(3) and the app test for the mode failed before the change. The coverage gate
caught the switch's "New rolls only" handler going unexercised; the component
test now switches back as well. The end-to-end test, through the mock binary,
saves the history, then runs a quick refresh that skips only each category's
first page (1,792 rolls) and shows "Up to date" rows
(`test-results/e2e-mock-refresh-progress.png`), then a full retrieval that
skips all 2,060.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 167 Rust unit tests, 207 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` passed, including all three
end-to-end tests.

## Fresh webview profile for the mock (2026-10-04)

Integrated through PR #63. Work was on `fix/mock-webview-profile`. Running `npm run tauri:mock` showed
"ENOENT: no such file or directory, open '/src/components/CachePicker.vue'".
The mock's persistent WebKit cache (`roll-tracker-mock/webview/WebKitCache`) still
held `ImportView.vue`, `ImportSources.vue` and `ImportFailed.vue` from 2 October,
before the components moved into subfolders, and the webview reused them,
although the dev server sends `Cache-Control: no-cache` with ETags. The mock now
removes its webview profile (`webview` on Linux, `EBWebView` on Windows, never
the folder that holds the database) before opening its window; the shipped app,
whose built modules have hashed names, keeps its profile. The app keeps nothing
in webview storage. Incognito mode was tried first, but WebKit's WebDriver could
not open a session in it ("session not created"), which failed both mock
end-to-end tests in the full check; decision 0014 records this.

TDD: with the clearing function a no-op, the database test (only the profile
folder is removed) and the mock registration test failed, then passed; the real
app's registration test checks nothing is removed. The end-to-end test seeds a
stale cache file in the mock's profile and checks it is gone once the app runs.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint, build, 168 Rust unit tests, 207 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy. `npm run test:offline` passed, including all three
end-to-end tests.

## Development zoom (2026-10-04)

Integrated through PR #64. Work was on `feat/dev-zoom`. The app looked smaller than the design canvas: under
WSL the Linux build renders at 1× (WSLg gives the Wayland window no scale, and
GTK 3 applies `GDK_SCALE` only to X11, in whole steps), while Windows was at 125%.
Debug builds now read `ROLL_TRACKER_ZOOM` (0.5 to 3) and zoom the webview, so
`ROLL_TRACKER_ZOOM=1.25 npm run tauri:mock` matches a 125% display. Anything else
is ignored. Release builds do not contain the code; on Windows, WebView2 follows
the display scale itself, which still awaits the Windows validation item. The
README documents the variable.

TDD: the parsing test failed against a stub, then passed. A new end-to-end test
launches the mock with `ROLL_TRACKER_ZOOM=1.25` and expects an 800-pixel-wide
page in the 1000-pixel window; with the zoom call disabled it measured 1000 and
failed. The window test passes either way, since the mock runtime cannot show a
zoom.

The unit coverage gate caught the window setup's new error paths, which the mock
runtime never reaches; the zoom is now applied by a function the window build
hands its result to, with a no-op in release builds. The end-to-end screenshot
(`e2e-mock-zoom.png`) shows the app at 125%.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed on the branch rebased onto PR #63: formatting, lint, build, 170 Rust unit tests, 207 frontend and 36
tooling tests, the mutation probes and report checks at 100% per file, Rust
formatting and Clippy (also clean for a release build). `npm run test:offline`
passed, including all four end-to-end tests.

The PR's CI run then failed in the CSP mutation probe, whose end-to-end rerun
broke before reaching the CSP check: the shell test read the History screen's
empty state once, right after launch, but since the History screen (PR #55) that
state appears only after saved history has been read, and on the slow runner it
had not. The two mock tests after it failed as a consequence. The shell test now
waits for the heading and the empty state, as the mock tests already did. The
race never showed locally, so the CI run is the evidence.

## Restart and recovery end to end (2026-10-04)

Integrated through PR #65. Work was on `test/e2e-restart-recovery`, the first of three verification PRs that
close milestone 3; the roadmap now breaks its last items into sub-tasks. Test
only: no product change was needed. The end-to-end test can relaunch the mock
binary on the data folder saved so far, as a restart, and one test now runs three
launches. The `network-failure` scenario fails and saves nothing. Under `history`,
a cancelled retrieval and a discarded review save nothing, and a retrieval
afterwards saves all 2,060 rolls. Relaunched under `network-failure`, the History
screen and the "Last import" line show the saved history straight away
(`e2e-mock-restart.png`), and a failing retrieval leaves every category's count as
it was. Finally no file in the mock's data folder, the database and webview
profile included, holds the synthetic auth key, now distinctive enough to search
for.

Red/green: with every launch wiping the data folder, the test failed at the
restart (no saved history to show), then passed with the folder kept. A key
planted in the webview profile failed the auth-key check, naming the file. The
test reads the stored counts through `history_page`; with nothing saved every
category counts 0. That the restart sends no request rests on the design
(only `retrieve_history` contacts HoYoverse) and its unit tests; the mock does not
count requests.

## Mock account scenarios (2026-10-04)

Integrated through PR #66. Work was on `feat/mock-account-scenarios`, the second of three verification PRs.
The mock binary has three more scenarios (decision 0014): `newer-history` adds 25
newer rolls to every category of the same account; `second-account` serves UID
`100000002` on `prod_official_usa` (UTC−5) with the same roll IDs as `history`;
`mixed-accounts` serves Light Cone Event Warp from that second account. A roll's
fields now depend only on its ID, so each scenario serves a saved roll exactly as
`history` did, and a repeat import finds no conflicts. No product change.

A new end-to-end test runs them in turn on one data folder. After `history` is
saved, a quick refresh under `newer-history` saves only the 150 newer rolls,
skipping 1,762: each category stops at its first page, except the collaboration
warps, whose 20-roll first pages hold only newer rolls. The History screen numbers
them on from 1,275 (`e2e-mock-newer.png`), and a full retrieval then skips all
2,210. Under `second-account` the same cache file saves all 2,060 rolls under UID
100000002 (America), since the account comes from the responses and the stop
check only matches the account's own saved rolls; the History screen follows that
account (`e2e-mock-second-account.png`). `mixed-accounts` fails at Light Cone
Event Warp, page 1, with the mixed-accounts message and saves nothing. Reading the
database file directly, each account's rolls are stored apart, and a digest of
the first account's rows is the same before and after the second account's
imports.

TDD: the three scenarios' unit tests failed against stubs serving `history` (no
newer rolls, the first account, no mixed-accounts error), then passed. The
end-to-end test passed first time against the existing app, as expected for a
verification. To prove it guards the stop rule, a temporary change made the quick
refresh match the first account's saved IDs whatever the page's account: the
second account's review then offered 1,792 rolls instead of 2,060, silently
omitting 268, and the test failed. The change was reverted.

One end-to-end screenshot showed the progress screen although the test had just
read the failure screen: WebDriver captured before WebKit painted. The driver now
waits for two animation frames before each screenshot. The stale frame was
intermittent, so there is no failing run to show for the fix; later screenshots
were checked by eye.

## Milestone 3 complete (2026-10-04)

Integrated through PR #67. Work was on `test/milestone-3-close`, the last of three verification PRs. A new
end-to-end test covers empty and missing context. Under `no-history`, retrieving
and saving through raw IPC are refused before any retrieval (`no_context`,
`no_preview`); the retrieval ends with "HoYoverse returned no warp history for
this account. Nothing was saved.", and the database file then holds no account.
The ended retrieval's link is gone, so the same refusals follow. Relaunched under
`history`, a retrieval saves 2,060 rolls, after which the link and the review are
both used up. The test helper that reads the database now lists accounts from
the `accounts` table, so an account without rolls would show.

TDD: a temporary change that put the link back in the session when a retrieval
ended made the second `retrieve_history` resolve instead of `no_context`, and the
test failed; reverted, it passed. No product change was needed.

The service isolation checks still pass in the staged run: the storage
integration tests for account, server and game isolation, the offline network
namespace, the CSP probe and the command capability. Every milestone 3 roadmap
item is ticked, including the parent "Connect acquisition to import preview,
atomic commit, and history display", whose steps were all done; the STATUS
introduction and AGENTS.md no longer say history is not displayed.

The first staged run failed in the suite-discovery mutation probe: inside it,
three frontend component tests (CategoryTabs, ImportSaved, ReviewPanel) found no
emitted events after a click, and a targeted rerun failed once more in another
CategoryTabs test before passing. Twenty direct runs of the frontend tests and
coverage never failed, this branch changes no frontend code, and the full rerun
passed. The flake is recorded for its own investigation.

## Probe failure snapshots (2026-10-04)

Work is on `fix/frontend-emit-flake`. Twice on 2026-10-04 the suite-discovery
probe failed in its last `coverage:json` run, because frontend component tests
(CategoryTabs, ImportSaved, ReviewPanel) found `wrapper.emitted()` empty after a
click. VTU still recorded the native `click`, so the click reached the DOM but the
components' own events went unrecorded: VTU captures those only through Vue's
devtools hook. The cause is unknown and the failure does not reproduce. Every one of 74 attempts passed:
20 direct test and coverage runs, 12 runs in shuffled file order with fixed seeds, 8
with a Vitest worker's environment variables, 24 replaying the probe's commands
from the shell and 5 real probe runs. Four suites run at once failed only from
starved worker pools, a different error. Ruled out: a second Vue instance (the
components and VTU share one), `NODE_ENV` (`test`), test order, Vue's 3-second
devtools buffer (not used under jsdom) and the renderer resetting the hook (VTU
attaches it after `createApp` on every mount).

Switching the 19 `emitted()` assertions to listener props was considered and
set aside: `emitted()` is the API that Vue Test Utils and Testing Library document
for component events, and nothing showed the change would fix the flake. Instead,
the probes that expect a command to fail share `expectCommandFailure`, which on
an unexpected outcome saves a snapshot to `test-results/probe-failures/`: the
command's full output, the machine's processes, load and memory, and Vitest's
results caches. Passing runs write nothing. Checked by giving the coverage probe a
message its command never prints: the probe failed and left a snapshot with the
output, process list, memory and both results caches; that snapshot was removed.

## Next

If the emit flake recurs, read its snapshot in `test-results/probe-failures/`
before rerunning. Milestone 4: propose its PR split first; its first items are
file imports through the shared pipeline, the second game's adapter, and account
switching with filters on the History screen. Native Windows validation of the
current build remains for milestone 6.

Earlier implementation details, dated measurements and superseded next steps are
in the [historical status log](history/2026-09-25-shell-and-storage-foundations.md).
