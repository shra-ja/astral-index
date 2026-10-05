# 0045 — Astral Index rebrand

Status: Planned · Milestone 8, Project cleanup
Decisions: [0009](../../architecture/decisions/0009-local-database-location.md)

Replace the placeholder name Roll Tracker with Astral Index everywhere it
appears: the app window and webview, package, crate, binary and environment
variable names, the local data folder, the docs, CI and the GitHub repository
(`shra-ja/roll-tracker` becomes `shra-ja/astral-index`). Archived status history
and decision records keep the old name, as they are never rewritten.

## Tasks

- [ ] Record the naming as a decision that supersedes the affected parts of
  decision 0009: data folders `Astral-Index` on Windows and macOS and
  `astral-index` on Linux, following 0009's convention, and the bundle
  identifier `astral-index`, without a reverse-domain prefix. No release has
  shipped and no databases need keeping, so the old `Roll-Tracker` and
  `roll-tracker` folders are not migrated.
- [ ] Rename the app, test first: the product name and window title, the
  webview title, the sidebar and import-screen copy, the data folder and mock
  data folder constants, and the `ROLL_TRACKER_ZOOM` development variable.
- [ ] Rename the build identities: the npm packages (`roll-tracker`,
  `roll-tracker-ui`), the Cargo package and library crate (`roll_tracker`), the
  mock binary (`roll-tracker-mock`) and its npm script, the CI AppArmor profile,
  and the test helpers and probes that name them; regenerate the lock files.
  Keep coverage at 100% and the gates' guarded-delegate list in CONTRIBUTING
  matching the renamed files.
- [ ] Update the living docs: README, AGENTS, CONTRIBUTING, DEVELOPMENT,
  TESTING, the architecture docs, the frontend and backend READMEs, the feature
  files and the `uigf` skill. Leave `docs/status/history/` and decision records
  as written.
- [ ] Rename the GitHub repository to `shra-ja/astral-index`, a step the owner
  takes in the repository settings. Point `origin` at the new URL and update
  the remote recorded in CONTRIBUTING. GitHub redirects the old URLs, so links
  to earlier PRs keep working.
- [ ] Verify: `npm run check` passes; searching tracked files for `roll tracker`,
  `roll-tracker`, `roll_tracker` and `rolltracker` in any case finds only
  archived history, decision records and the superseding decision; the mock
  binary opens with the new title and creates its data folder under the new
  name; CI passes on the renamed repository.
