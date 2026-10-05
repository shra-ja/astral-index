# Astral Index — agent instructions

Astral Index is a locally run Tauri desktop app that keeps players' gacha roll
history on their own machine, starting with Honkai: Star Rail and Genshin Impact.
This file is the entry point: follow its rules, and open the linked documents
when the task calls for them rather than reading everything.

## Where to look

Start every task with [STATUS](docs/status/STATUS.md): what works, known
limitations and the next task. Then open what the task needs:

| When you are | Open |
| --- | --- |
| Picking up or planning a feature | [ROADMAP](docs/product/ROADMAP.md), then that feature's file in `docs/product/features/` |
| Checking scope, requirements or acceptance | The [product brief](docs/product/PROJECT.md) |
| Changing code in an area | The [architecture index](docs/architecture/ARCHITECTURE.md), then the area's file and the decisions it links |
| Making or revisiting a consequential choice | The [decision records](docs/architecture/decisions/DECISIONS.md); record new ones there |
| Working on Star Rail acquisition or parsing | The [HSR API contract](docs/games/hsr/api-contract.md); the [research](docs/games/hsr/api-research.md) holds its evidence |
| Adding a game or import source | [GAMES](docs/games/GAMES.md) and [imports](docs/architecture/imports.md) |
| Designing UIGF storage, import or export | The `uigf` skill in `.agents/skills/uigf/` |
| Setting up, running or checking the app | [DEVELOPMENT](docs/development/DEVELOPMENT.md) |
| Working on tests, coverage gates, probes or CI | [TESTING](docs/development/TESTING.md) and [tests/README.md](tests/README.md) |
| Finding files in the frontend or backend | [src-ui/README.md](src-ui/README.md) and [src-tauri/README.md](src-tauri/README.md) |
| Branching, committing, testing first, handing off | [CONTRIBUTING](CONTRIBUTING.md) |
| Looking for why or when something was done | The history index at the end of STATUS |

Documents describe intent and may lag behind; inspect the code before assuming a
feature exists.

## Product constraints

- A locally run desktop app with a web UI hosted by Tauri, with separate game
  adapters per game.
- Support user-provided files and, where technically feasible, read-only local
  installation sources. Do not assume local files hold complete roll history.
- Fetch history from HoYoverse only on an explicit user request; cache files may
  supply authentication context rather than roll records. No startup fetching,
  background polling or scheduled synchronization. Stored-history browsing,
  analysis, file import and export stay local and never trigger requests.
- No user accounts, telemetry, cloud storage, remote assets or
  hidden network dependencies. User-requested HoYoverse acquisition is in scope
  ([decision 0002](docs/architecture/decisions/0002-user-requested-history-acquisition.md)).
- Keep player data local. Never commit real histories, account IDs, credentials,
  auth URLs, game logs, databases or private filesystem paths; use synthetic
  fixtures.

## Implementation conventions

- Vue 3 with TypeScript 6, Vite and npm, in Tauri 2 (decisions 0001 and 0011),
  following `create-vue` and Tauri conventions regardless of app size. Prettier
  and type-aware ESLint (decision 0012): fix findings rather than disabling
  rules. Node.js and Rust come from asdf and `.tool-versions`; SQLite through
  pinned rusqlite with bundled SQLite (decision 0003).
- Keep UI presentation, game rules, parsing, persistence and OS discovery
  separate. Prefer Rust for file access, import validation, persistence and
  authoritative domain logic; the frontend calls a narrow, typed command
  interface. UI components stay small and presentational: props in, events out,
  with native calls and flow logic in composables.
- Keep layouts fluid: place components relative to each other with flex and
  grid, wrapping, `minmax`/auto-fill tracks and max-width containers, never fixed
  pixel positions or sizes, so screens scale to any window size and new features
  slot in without reworking neighbours. Reserve fixed sizes for content that
  needs them, such as icons and numeric columns.
- Treat files as untrusted input: bound sizes, validate formats, give actionable
  errors and keep sensitive source content out of errors and logs.
- Imports are transactional and safe to repeat. Preserve source IDs as strings;
  never deduplicate only by timestamp or localized item name.
- Keep accounts, servers, games and banner/pity groups separate. Calculate pity
  as though each pity group's stored rolls were complete, and recalculate later
  rolls whenever earlier ones are imported. Do not infer guarantees or 50/50
  outcomes without verified banner metadata.
- Never modify game installations. Limit file access to the locations the
  user-selected import needs; no broad filesystem scans.
- Use narrowly scoped Tauri permissions; never expose arbitrary filesystem or
  shell commands to the webview.
- Keep automated tests local and self-contained: mock HoYoverse with synthetic
  responses, failures included; never call live APIs or use player credentials.
- Keep changes focused. Make routine reversible choices independently and record
  your assumptions; ask only when missing information materially blocks the task.
  Record consequential choices as decisions, and update the setup instructions
  when tooling changes.

## Workflow

[CONTRIBUTING](CONTRIBUTING.md) holds the full rules; these are not negotiable:

- **Trunk-based:** create a short-lived task branch from up-to-date `main` before
  any code change, tests, build scripts and CI configuration included; never
  implement on `main`. Keep each branch to one small change, integrate as soon as
  every gate passes (target the same working day) and delete it once merged. No
  long-lived develop, release or feature branches.
- **Conventional Commits** for every commit: `type(optional-scope): description`.
- **Test first:** for every behavior change, write a meaningful test, watch it
  fail for the expected reason, make it pass with the minimum code, then
  refactor. A bug fix starts with a failing regression test.
- **100% coverage,** per file, of all first-party executable code: lines,
  statements, functions and branches wherever they apply, with tooling that
  measures every one of them rather than silently omitting one. Rust reaches it from
  unit tests alone, with mocked filesystem and database APIs; integration tests
  cannot fill unit gaps. Unexecuted files count. No exclusions, ignore
  annotations, rounding or trivial assertions to hide missed code. The only
  exceptions are the guarded delegates listed in CONTRIBUTING; reassess the
  exception before adding behavior to any of them.
- **Gates fail closed:** missing, empty, stale or incomplete reports fail, and CI
  runs the same gates before integration.

## Validation and handoff

- Run focused tests during TDD and `npm run check` before handoff. Test observable
  behavior rather than mirroring the implementation. Keep the setup and check
  commands in DEVELOPMENT exact.
- Prioritize parser failures, repeated and overlapping imports, cross-account
  isolation, migration safety, uncertain timestamps, incomplete histories,
  user-initiated acquisition, network and authentication failures, cancellation,
  and local use without fetching.
- For UI work, check keyboard operation, readable empty and error states, and
  native Tauri behavior where available; browser mocks alone do not validate
  native I/O.
- Update STATUS with the work, its real verification and the next task, and
  archive integrated sections as its "Keeping this file current" section says.
  Update the feature file, architecture and decisions when behavior or
  boundaries change.
- Report the branch, red/green evidence, full test and coverage results, what
  changed and what remains limited. Do not commit, publish or release unless
  asked.

## Code review priorities

Flag data loss, duplicate or silently omitted rolls, account mixing, unjustified
pity calculations, unrequested network activity, overbroad native permissions,
and leakage of player data. Require evidence for claimed import compatibility.
Reject code changes made on the trunk, missing TDD evidence, coverage below 100%,
and exclusions or disabled tests that conceal untested first-party code.
