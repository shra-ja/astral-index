# 0021 — Vue frontend

Status: Done · Milestone 6, Desktop UI foundation
Decisions: [0011](../../architecture/decisions/0011-vue-frontend.md)

Adopt Vue for the webview, in its own workspace, with routes, composables and
presentational components.

## Tasks

- [x] Decide whether the webview adopts a component framework, and review the
  visual design, before the stored-history display. Record the choice as a
  decision; weigh 100% branch coverage of compiled templates and dependency size.
- [x] Adopt Vue 3 with TypeScript 6 and `create-vue`/Tauri conventions
  ([decision 0011](../../architecture/decisions/0011-vue-frontend.md)): tooling, split type
  projects, the tested Vite config and the review screen as a component.
- [x] Move the frontend into a self-contained `src-ui/` npm workspace beside
  `src-tauri/`, with sibling `*.test.ts` unit tests and integration tests in
  `src-ui/tests/`; no behaviour change.
- [x] Move the rest of the UI to Vue: `App.vue`, Vue Router with a first
  view, composables for the retrieval flow, small presentational components
  and styles in `assets/`.
