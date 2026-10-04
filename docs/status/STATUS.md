# Project status

Updated: 2026-10-04

Milestones 1 and 2 provide the local Tauri shell, HSR response parser, immutable
import previews and transactional SQLite history storage. Repeated imports retain
unique rolls, first-import provenance and compact batch summaries. The
[HSR API contract](../HSR-API-CONTRACT.md) contains the settled acquisition assumptions
and retry policy. Milestone 3 is complete: on the user's request the app
retrieves Honkai: Star Rail warp history from HoYoverse, reviews and saves it
locally, and shows the saved history, which survives restarts.

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
