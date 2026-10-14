# 2026-10-14: Windows CI (archived 2026-10-14)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Windows CI (2026-10-14)

Integrated through PR #112.
0038's third PR, `ci/windows`: a `windows-2025` job runs the Rust unit tests and keeps unsigned release builds; the linker embeds the Windows manifest in test binaries too, and 20 Linux-only test assumptions are fixed; red, then green.

## CI pipeline (2026-10-14)

Integrated through PR #113.
`ci/pipeline`: `check` split into static, gates and probes (isolated in `test-results/probe-run/`, no refresh), run as parallel CI jobs with Windows tests and release apart; the Windows build is published only after every check passes; only main saves caches; prebuilt tools; Node 24 actions; one labelled summary per job instead of Vitest's. Red, then green, for each part; the probes' isolation check failed when they leaked; local check passes (static 13 s, gates 234 s, probes 156 s); CI green on GitHub, 8 min 51 s with cold caches.
