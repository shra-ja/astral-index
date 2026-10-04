# 2026-10-02: app shell and mock binary (archived 2026-10-04)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

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
([decision 0014](../../architecture/decisions/0014-mock-debug-binary.md)); the shipped binary is
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
