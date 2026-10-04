# 2026-09-30: Vue app structure (archived 2026-10-04)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Vue app structure (2026-09-30)

Integrated through PR #44 (`f85158d`), branched from `main` at `3bec652`. The rest of the
page moves to Vue, following decision 0011, in four commits; retrieval behaves
as before.

- **Shell and router:** `vue-router` 5.3.1 (exact; the version `create-vue`
  installs). `main.ts` mounts `App.vue` on `#app`: the header, a `RouterView`
  inside `<main>` and the footer, so the header and footer are now page landmarks
  rather than sitting inside `<main>`. `router/index.ts` has one hash-history
  route, `views/HomeView.vue`; the wordmark is a `RouterLink` to it. At the
  user's choice there is one view for now; retrieval moves to its own route when
  the stored-history mockup settles navigation.
- **Flow:** `composables/useRetrieval.ts` holds the retrieval flow as read-only
  state (phase, source, status, review, cancelling) and actions, and is the only
  frontend caller of the native commands. The failure, progress and save text
  moved unchanged into `messages.ts`.
- **Components:** `GameSelect` (`v-model`), `EmptyState` and `RetrievalStart`
  join `ReviewPanel`, all presentational. The view moves focus when the phase
  changes: to Cancel while acquiring, and back to the starting control, through
  `RetrievalStart`'s exposed `focus`, when the flow returns to idle.
- **Styles:** at the user's choice, base styles are in `assets/main.css` and
  each component carries scoped styles. One rule for the retrieval introduction
  had matched nothing since the start controls gained a wrapper; it now applies,
  giving that paragraph the same 460px centred width as the text below it.
- **Tests:** unit tests beside each new module cover every failure message, the
  cancel races and each component; the integration tests in
  `src-ui/tests/app.test.ts` keep one case per flow, with focus and the wiring
  between components, and now wait for Vue's next render after each interaction.

TDD: the message, composable and component tests each failed first (missing
modules), then passed; the integration tests passed before and after each step.
A mutation that always returned focus to the search button failed the
file-chooser test.

The first full check failed the frontend report gate: V8 counted no statements in
the router module, a single `export default createRouter(...)`, and the gate
rejects a file with nothing measured, since that also describes a file never
loaded. The module now assigns the router to a constant and exports it, as
`create-vue`'s template does, and is measured. Run stage by stage with
`CARGO_BUILD_JOBS=8`, every stage of `npm run check` then passed: 142 Rust unit
tests, 114 frontend and 31 tooling tests, offline native execution under the
production CSP, the probes and six report checks, all at 100% per file, plus the
type check, build, formatting and Clippy. The native screenshot matches `main`'s
apart from the retrieval introduction's narrower width. The JavaScript bundle is
102 KB (39 KB gzipped) and contains no `eval` or `new Function`.
`npm run tauri -- build --no-bundle` passed on Linux, and the `cargo-xwin`
Windows build succeeded.
