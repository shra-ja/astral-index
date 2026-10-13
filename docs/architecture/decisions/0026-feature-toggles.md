# 0026 — Build-time feature toggles

Date: 2026-10-13
Status: Accepted

## Context

The first release covers Honkai: Star Rail only
([decision 0018](0018-star-rail-first-release.md)), yet the sidebar offered
Genshin Impact, whose screens say retrieval is coming soon. A release should
show only what works. Development builds keep the Genshin Impact screens so
[feature 0031](../../product/features/0031-second-game-adapter.md) can build on
them, and the code stays under the coverage gates either way.

Vite reads environment files per mode: `.env.development` for the dev server,
`.env.production` for `vite build`, and `.env.test` for Vitest, which runs in
its own mode. It exposes variables with the `VITE_` prefix to the app as
strings on `import.meta.env`, fixed at build time. Variables already set in
the environment take precedence over the files.

## Decision

- **Toggles are build-time only.** Each is a `VITE_FEATURE_*` variable set in
  the frontend's committed mode files: on in `.env.development` and
  `.env.test`, off in `.env.production`. They are not user settings, and no
  runtime configuration file can change them. Release builds and the mock
  debug binary are production builds, so the end-to-end tests see what a
  release shows.
- **A bad value fails closed.** The Vite configuration rejects any
  `VITE_FEATURE_*` value other than `true` or `false`, stopping the build, the
  dev server and the tests. `src-ui/src/features.ts`, the one module that reads
  the toggles, also rejects a missing or malformed value rather than
  defaulting.
- **Toggles exist only for unfinished work.** Each names the feature that
  removes it once the work is done. `VITE_FEATURE_GENSHIN_IMPACT` hides Genshin
  Impact's sidebar link and routes; feature 0031 removes it.
- **The native side is not gated.** It has no Genshin Impact code, so a toggle
  there would guard nothing. A future toggle that needs native code is a new
  decision.

## Alternatives and consequences

- **Deleting the Genshin Impact screens until 0031:** the release shows only
  what works, but the screens, their tests and their design would have to be
  rebuilt later.
- **A runtime setting or configuration file:** lets users turn on unfinished
  work, which the release must not offer, and adds state to test.
- **Vite's `define` with parsed booleans:** avoids string values, but departs
  from Vite's environment-file conventions; the typed module turns the strings
  into booleans in one place.
- A hidden feature's code still ships in the bundle; only its screens are
  unreachable.
- Tests that need the release state turn a toggle off with `vi.stubEnv` and
  reload the app's modules.

## Evidence

- `src-ui/build/vite.test.ts` checks each mode file's values and that a bad
  value stops the configuration; `src-ui/src/features.test.ts` checks the
  module in both states.
- `src-ui/tests/app.test.ts` mounts the app with Genshin Impact off;
  `tests/e2e-smoke.test.ts` checks the mock debug binary, a production build,
  lists Star Rail alone and returns a Genshin Impact address to its history.
