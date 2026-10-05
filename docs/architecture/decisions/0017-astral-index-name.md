# 0017 — Astral Index name

Date: 2026-10-05
Status: Accepted; supersedes the names in decisions
[0006](0006-desktop-extraction-commands.md),
[0009](0009-local-database-location.md),
[0011](0011-vue-frontend.md) and [0014](0014-mock-debug-binary.md).

## Context

Roll Tracker was a placeholder name. It appears in the window, the webview, the
local data folder, the bundle identifier, package, crate, binary and environment
variable names, the docs and the GitHub repository. Earlier decisions record
those names as they were chosen. Nothing has been released, and the only
databases are local test copies that are deleted after use.

## Decision

The app is named Astral Index. Every current name changes with it:

| What | Before | After |
| --- | --- | --- |
| Product name and window title | Roll Tracker | Astral Index |
| Bundle identifier | `com.shra-ja.roll-tracker` | `astral-index` |
| Data folder on Windows and macOS | `Roll-Tracker` | `Astral-Index` |
| Data folder on Linux, including WSL | `roll-tracker` | `astral-index` |
| Mock data folder | `Roll-Tracker-Mock`, `roll-tracker-mock` | `Astral-Index-Mock`, `astral-index-mock` |
| npm packages | `roll-tracker`, `roll-tracker-ui` | `astral-index`, `astral-index-ui` |
| Cargo package, crate and app binary | `roll-tracker`, `roll_tracker` | `astral-index`, `astral_index` |
| Mock binary | `roll-tracker-mock` | `astral-index-mock` |
| Development variables | `ROLL_TRACKER_ZOOM`, `ROLL_TRACKER_MOCK_SCENARIO` | `ASTRAL_INDEX_ZOOM`, `ASTRAL_INDEX_MOCK_SCENARIO` |
| GitHub repository | `shra-ja/roll-tracker` | `shra-ja/astral-index` |

The data folders keep decision 0009's convention: capitalized on Windows and
macOS, lowercase on Linux. The user chose the identifier `astral-index` without
a reverse-domain prefix. Tauri accepts any identifier of letters, digits,
hyphens and periods, and the app names its data and webview folders itself
rather than deriving them from the identifier.

Old data folders are not migrated: no release has shipped, so no player history
lives in them. Archived status history and decision records keep the old name,
as they are never rewritten.

## Alternatives and consequences

- **Keep a reverse-domain identifier (`com.shra-ja.astral-index`):** the usual
  form for macOS bundle IDs, but nothing in the app needs it, and the user
  preferred the shorter one. It can still be changed before the first release,
  since it then becomes part of installed apps' system configuration.
- **Migrate the old data folders:** would add untested-in-practice code for
  databases that do not exist. Anyone holding a test database moves it by hand,
  as decision 0009 already describes.
- GitHub redirects the old repository URLs, so links to earlier PRs in the
  archived history keep working.

## Evidence

The renames land test first, with 100% coverage kept and `npm run check`
passing; feature 0045 records the verification.
