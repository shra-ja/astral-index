# Frontend

The Vue webview app, as the `roll-tracker-ui` npm workspace. See
[decision 0011](../docs/decisions/0011-vue-frontend.md) for the conventions.

- `src/main.ts` renders the page: the local-app empty state and game selector
  and, for Honkai: Star Rail, the retrieval panel ("Start retrieval", with a
  `data_2` file chooser always available below it), its progress and Cancel
  control, and the review.
- `src/components/` holds presentational Vue components, which take props and
  emit events; `ReviewPanel.vue` shows what saving would change.
- `src/commands.ts` is the typed client for the native commands. Results carry
  failure categories only, never request contexts, paths or native detail. Keep
  native I/O behind typed backend commands rather than adding it here.
- `src/format.ts` holds shared display text; `src/style.css` the bundled styles
  (no remote fonts or assets).
- `build/vite.ts` holds the Vite configuration, to which `vite.config.ts` only
  delegates.

Unit tests sit beside the code they test as `*.test.ts`. Integration tests, which
mount the app with native commands mocked, live in `tests/`. Native end-to-end
tests live in the repository-root `tests/`. `npm test` and `npm run coverage` run
the frontend's own tests and coverage here, or with the tooling's from the
repository root, where `npm run typecheck` checks everything.
