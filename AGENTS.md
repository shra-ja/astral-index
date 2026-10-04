# Roll Tracker — agent instructions

## Start here

Read `docs/product/PROJECT.md`, `docs/status/STATUS.md`, and the relevant sections of
`docs/architecture/ARCHITECTURE.md` before implementation. Read `CONTRIBUTING.md` for mandatory
TDD, coverage, and branch workflows. Use `docs/product/ROADMAP.md` for planned work
and `docs/architecture/imports.md` for ingestion requirements. These documents describe intent;
inspect actual code before assuming a feature exists.

## Product constraints

- Build a locally run desktop application with a web UI hosted by Tauri.
- Start with Genshin Impact and Honkai: Star Rail, using separate game adapters.
- Support user-provided files and, where technically feasible, read-only local
  installation sources. Do not assume local files contain complete roll history.
- Fetch history from HoYoverse only on an explicit user request. Cache files may
  supply authentication/request context rather than roll records. No automatic
  startup fetching, background polling, or scheduled history synchronization.
- Keep stored-history browsing, analysis, file import, and export local; these
  operations do not trigger history requests.
- No accounts with our service, telemetry, cloud storage, remote assets, or hidden
  network dependencies. User-initiated HoYoverse history acquisition is in scope
  (decision 0002); it requires connectivity and valid authentication.
- Keep player data local. Never commit real histories, account IDs, credentials,
  auth URLs, game logs, databases, or private filesystem paths. Use synthetic fixtures.

## Implementation conventions

- Use Vue 3 with TypeScript 6, Vite, npm, and Tauri 2 (decisions 0001 and 0011).
  Follow `create-vue` and Tauri conventions regardless of app size, and keep UI
  components small and presentational: props in, events out, native calls and
  flow logic outside them. Format with Prettier and lint with type-aware ESLint
  (decision 0012); fix findings rather than disabling rules. Manage Node.js
  and Rust with asdf and `.tool-versions`. Use pinned rusqlite with bundled SQLite (decision 0003). Record consequential choices in
  `docs/architecture/decisions/` and update setup instructions when scaffolding the app.
- Keep UI presentation, game rules, parsing, persistence, and OS discovery separate.
- Keep layouts fluid: place components relative to each other with flex and grid,
  wrapping, `minmax`/auto-fill tracks and max-width containers, not fixed pixel
  positions or sizes, so screens scale to any window size and new features slot
  in without reworking neighbours. Reserve fixed sizes for content that needs
  them, such as icons and numeric columns.
- Prefer Rust for file access, import validation, persistence, and authoritative
  domain logic. The frontend calls a narrow, typed command interface.
- Treat files as untrusted input. Bound input sizes, validate formats, provide
  actionable errors, and avoid exposing sensitive source content in errors/logs.
- Imports must be transactional and safe to repeat. Preserve source IDs as strings;
  never deduplicate only by timestamp or localized item name.
- Keep accounts, servers, games, and banner/pity groups separate. Calculate pity
  as though each pity group's stored rolls were complete, and recalculate it for
  later rolls whenever earlier rolls are imported. Do not infer guarantees or
  50/50 outcomes without verified banner metadata.
- Never modify game installations. Limit file access to the source locations
  needed for the user-selected import; avoid broad filesystem scans.
- Keep automated tests local and self-contained. Mock HoYoverse requests with
  synthetic responses, including failures; never call live APIs or use player
  credentials in tests.
- Use narrowly scoped Tauri permissions. Do not expose arbitrary filesystem or
  shell commands to the webview.
- Keep changes focused. Make routine reversible choices independently, documenting
  assumptions; ask only when missing information materially blocks the task.

## Mandatory development workflow

- Use Conventional Commits for every commit message:
  `type(optional-scope): description`. See `CONTRIBUTING.md` for examples.
- Follow trunk-based development with `main` as the trunk. Before any code change,
  create a separate short-lived task branch from up-to-date `main`. Never implement
  directly on `main`; this includes tests, build scripts, and CI configuration.
- Keep branches focused on one small change, integrate as soon as all gates pass
  (target the same working day), and delete merged branches. No long-lived develop,
  release, or feature branches. See `CONTRIBUTING.md` for bootstrap details.
- Use test-driven development for all behavior changes: write a meaningful test,
  run it and observe the expected failure, implement the minimum to pass, then
  refactor with tests green. Add a failing regression test before fixing a bug.
- Mandate 100% coverage of all first-party executable code, including frontend,
  Rust backend, native glue, and executable tooling. Require 100% lines, statements,
  functions, and branches wherever applicable; select tooling that can enforce
  these metrics rather than silently omitting an unsupported metric.
- Rust backend coverage must reach 100% from unit tests alone, with mocked
  filesystem/database APIs. Integration tests use real boundaries and cannot fill
  unit-coverage gaps. Only `src-tauri/src/main.rs`, the mock debug binary
  `src-tauri/src/bin/roll-tracker-mock.rs` (decision 0014) and `src-tauri/build.rs`
  retain a separate 100% native gate while they remain minimal Tauri delegates, and the
  config files Vitest never measures, `src-ui/vite.config.ts`,
  `src-ui/eslint.config.ts`, `vitest.config.ts` and `eslint.config.ts`, only
  delegate to the unit-tested `src-ui/build/vite.ts`, `src-ui/build/eslint.ts`,
  `tooling/vitest-config.ts` and `tooling/eslint-config.ts`. The source-body guard in `tests/coverage-reports.test.ts`
  must fail if any of them changes. Reassess the exception before adding behavior
  to any of them.
- Include unexecuted source files in coverage. Enforce thresholds per file and per
  language/package; do not round up, rely on changed-lines-only coverage, or hide
  missed paths with exclusions, ignore annotations, or trivial assertions.
- Establish automated test and coverage gates with the first executable code.
  Missing, empty, stale, or incomplete reports must fail. CI must run the same
  gates before integration; a docs-only scaffold is not evidence of 100% coverage.

## Validation and handoff

- The shell, native services, HSR acquisition UI (retrieve, review, save) and the
  stored-history display exist (milestones 3 to 7 are complete). Use `npm test` for UI/tooling
  tests, `npm run check` for all test/coverage/type/lint gates, and
  `npm run tauri -- build --no-bundle` for a production desktop executable.
- Document exact setup/check commands in `README.md`. Run focused
  tests during TDD and the full tests and coverage gates before handoff/integration.
  Test observable behavior rather than mirroring implementation.
- Prioritize parser failures, repeated/overlapping imports, cross-account isolation,
  migration safety, uncertain timestamps, incomplete histories, user-initiated acquisition,
  network/authentication failures, cancellation, and local use without fetching.
- For UI work, check keyboard operation, readable empty/error states, and native
  Tauri behavior where available. Browser mocks alone do not validate native I/O.
- Update `docs/status/STATUS.md` with completed work, actual verification, and the next
  concrete task, and archive integrated sections as its "Keeping this file current"
  section describes. Update architecture/decisions when behavior or boundaries change.
- Report the task branch, red/green evidence, full test and coverage results, what
  changed, and any remaining limitations. Do not
  commit, publish, or release unless requested.

## Code review priorities

Flag data loss, duplicate or silently omitted rolls, account mixing, unjustified
pity calculations, unrequested network activity, overbroad native permissions,
and leakage of player data. Require evidence for claimed import compatibility.
Reject code changes made on the trunk, missing TDD evidence, coverage below 100%,
and exclusions or disabled tests that conceal untested first-party code.
