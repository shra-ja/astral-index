# 2026-09-25: review remediation (archived 2026-10-04)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Milestone 2 review remediation

Integrated through PR #3 (`20428aa`). Parser fixes preserve precise JSON
numbers, reject duplicate members and enforce the exact timestamp shape. History
reads verify stored identity and domain invariants. A shared library root separates
HSR and storage modules. Test discovery now covers additional frontend/tooling
suites; native CSP verification checks a policy violation and has a permissive-policy
mutation probe. The shell copy reflects the acquisition-first roadmap.

`npm run check` passed: 46 Rust tests, 17 frontend/tooling tests, native offline
integration, five failure/discovery probes, source/report validation, TypeScript,
formatting and Clippy. All required coverage metrics are 100% per source file.
The regression tests reproduced the four data issues before fixes; the new-suite
probe confirmed the old command omitted tests. See [testing](../../development/TESTING.md) for
red/green and mutation evidence. `npm run tauri -- build --no-bundle` also passed for Linux.
Review fixes are integrated on `main`.
The existing branch history is preserved; subsequent service work should use
smaller reviewed increments and the same-day integration target in CONTRIBUTING.

## From TESTING.md

### Milestone 2 review fixes (2026-09-25)

Work continues on `feat/hsr-response-foundations`; the reviewed history is preserved.
Before implementation, raw synthetic regressions reproduced loss of distinct large
integers/precise decimals, duplicate JSON-member acceptance, corrupt stored
identity/domain values escaping history reads, and signed/extended timestamp years.
The updated acquisition-first UI assertion also failed against the previous copy.
An additional failing frontend suite was initially ignored by `npm test` (exit 0),
proving the runner-discovery gap independently of coverage.

After fixes, `npm run check` passed with 46 Rust tests (32 storage/library tests
and 14 parser tests), 17 frontend/tooling tests, real offline native integration,
five failure/discovery probes, source inventory and fresh-report validation,
TypeScript/build, Rust formatting and Clippy. The sandbox cannot create the
bubblewrap network namespace; the authorized outside-sandbox run retained the
native test's network isolation. No live APIs or real player data were used.

The native test now requires an enforced `connect-src` security-policy violation.
Its mutation probe relaxes that directive, observes failure at the CSP assertion,
restores configuration, and repeats the native run. A rejected fetch alone cannot
pass. Discovery probes add deliberately failing suites beside frontend source, in
`src-ui/tests/`, in `src-ui/build/` and in `tooling/`, verify that both `npm test` and `npm run coverage` fail and
report each suite, then remove them and regenerate clean coverage. Report and
mutation suites remain explicit commands outside unit discovery.

Fresh native coverage (regions are the Rust statement metric):

| File | Lines | Regions | Functions | Branch outcomes |
| --- | ---: | ---: | ---: | ---: |
| `lib.rs` | 40/40 | 41/41 | 5/5 | 10/10 |
| `hsr.rs` | 62/62 | 72/72 | 7/7 | 42/42 |
| `storage.rs` | 200/200 | 268/268 | 23/23 | 38/38 |
| `main.rs` | 6/6 | 4/4 | 2/2 | 0/0 |
| `build.rs` | 3/3 | 3/3 | 1/1 | 0/0 |

Frontend/tooling remains at 100% per file for lines, statements, functions and
branches. No unsupported metrics, new exclusions or ignored paths were introduced.
New cases also cover known/unknown timezone sequences in both directions,
including empty terminal pages; malformed indexed identity; nested duplicate
members; excessive nesting; and lossless numeric persistence after restart.

`npm run tauri -- build --no-bundle` and `git diff --check` also passed. The
production Linux executable builds; Windows/macOS, installer packaging and future
acquisition/native import commands remain outside this verification.
