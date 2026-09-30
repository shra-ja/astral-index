# Frontend

The Vue webview app, as the `roll-tracker-ui` npm workspace. See
[decision 0011](../docs/decisions/0011-vue-frontend.md) for the conventions.

- `src/main.ts` mounts `App.vue`, the shell with the header and footer around
  the current view; `src/router/` maps routes to views, with hash history.
- `src/views/` holds screens. `HomeView.vue` shows the game selector and empty
  state and, for Honkai: Star Rail, retrieval: "Start retrieval", with a `data_2`
  file chooser always available below it, its progress and Cancel control, and
  the review. Views wire composables to components and move focus.
- `src/components/` holds presentational components, which take props and emit
  events and never make native calls: `GameSelect.vue`, `EmptyState.vue`,
  `RetrievalStart.vue` and `ReviewPanel.vue`.
- `src/composables/` holds flow logic: `useRetrieval.ts` runs retrieval, review
  and saving, and is the only caller of the native commands.
- `src/commands.ts` is the typed client for the native commands. Results carry
  failure categories only, never request contexts, paths or native detail. Keep
  native I/O behind typed backend commands rather than adding it here.
- `src/messages.ts` says what the retrieval flow tells the user; `src/format.ts`
  holds other shared display text such as warp and game names.
- `src/assets/main.css` holds the base styles; each component carries scoped
  styles. Everything is bundled (no remote fonts or assets).
- `build/vite.ts` holds the Vite configuration, to which `vite.config.ts` only
  delegates.

Unit tests sit beside the code they test as `*.test.ts`. Integration tests, which
mount the app with native commands mocked, live in `tests/`. Native end-to-end
tests live in the repository-root `tests/`. `npm test` and `npm run coverage` run
the frontend's own tests and coverage here, or with the tooling's from the
repository root, where `npm run typecheck` checks everything.
