# 2026-10-14: Windows CI (archived 2026-10-14)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Windows CI (2026-10-14)

Integrated through PR #112.
0038's third PR, `ci/windows`: a `windows-2025` job runs the Rust unit tests and keeps unsigned release builds; the linker embeds the Windows manifest in test binaries too, and 20 Linux-only test assumptions are fixed; red, then green.
