# 2026-10-03: History screen and refresh (archived 2026-10-04)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

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
[Decision 0015](../../decisions/0015-incremental-retrieval.md) and the HSR contract
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
