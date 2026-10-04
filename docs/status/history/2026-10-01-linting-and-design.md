# 2026-10-01: linting and design (archived 2026-10-04)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Linting and formatting (2026-10-01)

Work is on `build/lint-format`, branched from `main` at `f85158d`, following
[decision 0012](../../decisions/0012-linting-and-formatting.md), in four commits.

- **Tools (exact):** ESLint 10.11.0 in both workspaces with `jiti` 2.7.0 for
  TypeScript configs; in `src-ui`, `eslint-plugin-vue` 10.11.1,
  `vue-eslint-parser` 10.4.1, `@vue/eslint-config-typescript` 14.9.0 and
  `eslint-config-prettier` 10.1.8; at the root, `@eslint/js` 10.0.1 and
  `typescript-eslint` 8.71.0; `@vitest/eslint-plugin` 1.6.27 in both; Prettier
  3.9.9 at the root.
- **Configs:** at the user's choice, each workspace owns its ESLint config,
  with the stricter type-aware rule sets, and one root Prettier config uses
  `create-vue`'s style (no semicolons, single quotes, 100 columns). Both
  `eslint.config.ts` files are guarded delegates to unit-tested modules, pinned
  beside the Vite and Vitest configs. Prettier skips Markdown at the user's
  request, the HSR API fixtures and the agent skills.
- **Reformat:** the second commit only applies Prettier and is listed in
  `.git-blame-ignore-revs`. Vue now keeps a space either side of a button label
  written on its own line, so the integration test's button lookup trims text;
  the guard's pinned delegate bodies lost their semicolons.
- **Findings fixed:** `cancel` and `save` became arrow functions like the other
  composable actions (`unbound-method`); `RetrievalStart`'s `id` attributes
  moved first; tests mark deliberately unawaited calls with `void` and throw
  native failures, which are plain objects, through a `reject` helper; parsed
  coverage JSON and WebDriver responses are typed (`LlvmCoverageExport`, a
  generic request helper) instead of `any`; the report gates use `test.each`;
  the end-to-end network precondition throws instead of asserting in
  `beforeAll`; a regex spells out its six spaces as `{6}`.
- **Gates:** `npm run check` runs `format:check` and `lint:check` (warnings
  fail) first, so CI does too.

TDD: both config tests failed first (missing modules), then passed; the tests
for expectation messages, `expect…` helpers and the stage-runner exemption
failed against the first configs and passed after. A first message fixture used
a string literal, which the rule already allowed, so it passed before the change
and was replaced with a variable. Removing the Prettier override made the
frontend's formatting test fail on six Vue layout rules.

Run stage by stage with `CARGO_BUILD_JOBS=8`, every stage of `npm run check`
passed: formatting, lint with no warnings, 142 Rust unit tests, 120 frontend and
36 tooling tests, offline native execution, nine probes and six report checks,
all at 100% per file, plus the type check, build, Rust formatting and Clippy.
`npm run tauri -- build --no-bundle` passed on Linux, and the `cargo-xwin`
Windows build succeeded.

## Visual design review (2026-10-01)

A new visual design replaces the placeholder UI. The mockups live on a design
canvas outside the repository, built with synthetic data. They cover the Warp
and Wish history screens, the empty state, and the import flow: choose a
source (retrieval or a manually chosen `data_2` cache file; history-file import
is shown disabled as coming soon), progress, review, saved, and two failures (expired link, game files not found).
The history list has rarity filters, search, list/grid/icon layouts, a pity
column with soft-pity or 50/50 colouring, and styled tooltips.

Decisions from the review:

- Pity treats each pity group's stored rolls as complete and is recalculated
  when older rolls are imported. It is derived on read, not stored; see
  [architecture](../../architecture/ARCHITECTURE.md#statistics). `AGENTS.md` now states this rule.
- Soft-pity colour thresholds are per banner category. 50/50 colouring is
  disabled with a tooltip until banner metadata exists.
- Item icons and banner art stay placeholders. Obtaining real art without
  committing game assets is an open decision that may relax the local-only rule.
- Layouts are fluid: screens fill the window, wrap, collapse the sidebar to
  icons at 900px and drop list columns as space shrinks (Type, then Banner, then
  Time). The minimum window is 480×560, which excludes phones in either
  orientation; mobile is out of scope for now.
- The typeface is Hanken Grotesk, chosen over IBM Plex Sans, Manrope, DM Sans
  and Figtree, and will be bundled. Dark theme only for now.

Documentation only: no code changed and no checks were run.
