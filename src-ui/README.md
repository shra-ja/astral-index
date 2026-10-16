# Frontend

The Vue webview app, as the `astral-index-ui` npm workspace. See
[decision 0011](../docs/architecture/decisions/0011-vue-frontend.md) for the conventions.

- `src/main.ts` mounts `App.vue`, the shell with the sidebar beside the current
  screen and the About dialog over it; `src/router/` maps each game's History, Import and Backup & Restore
  routes to views, with hash history.
- `src/views/` holds screens: `HistoryView.vue` shows saved history,
  `ImportView.vue` the retrieval flow and `BackupView.vue` Backup & Restore. Views wire composables to components and
  move focus.
- `src/components/` holds presentational components, which take props and emit
  events and never make native calls, grouped by where they are used:
  `layout/` for the shell and screen frame (`AppSidebar`, `ScreenHeader`,
  and `SizeOverlay`, the development window size overlay),
  `history/` for the History screen, `import/` for the Import screen, `backup/`
  for Backup & Restore (`BackupCard`, `DataLocation`), `about/`
  for the About dialog (`AboutDialog`, the modal and its views, `AboutSummary`,
  its main view, and `NoticesList`, the third-party notices), and `shared/` for pieces any screen may use
  (`AppTooltip`, `CachePicker`, `AstralEmblem`, the small brand emblem without a
  tile, and `OpenLockup`, the regular emblem beside the wordmark).
- `src/composables/` holds flow logic and is the only caller of the native
  commands: `useRetrieval.ts` runs retrieval, review and saving, and
  `useAbout.ts` reads the About dialog's details and opens the data folder or
  issues page, and `useHistory.ts` reads the saved accounts and saved history a
  page at a time, keeping each game's account chosen in the switcher until the
  app restarts or a save into that game. `useBackup.ts` saves a backup and
  tracks how it went. `useWindowSize.ts` follows the window's size for the
  size overlay.
- `src/commands.ts` is the typed client for the native commands. Results carry
  failure categories only, never request contexts, paths or native detail. Keep
  native I/O behind typed backend commands rather than adding it here.
- `src/dev-options.ts` reads the development options a debug build asks for
  with a page script, such as the size overlay; release builds never add one.
- `src/features.ts` reads the build-time feature toggles from Vite's
  environment files (`.env.development`, `.env.test`, `.env.production`) and
  lists the games the build shows, which the sidebar and routes offer
  ([decision 0026](../docs/architecture/decisions/0026-feature-toggles.md)).
  `build/vite.ts` stops the build on a toggle that is neither `true` nor `false`.
- `src/input-modality.ts` tracks whether the latest press came from the
  keyboard, so tooltips show at once on keyboard focus.
- `src/notices.ts` loads the third-party notices that every build generates,
  in their own chunk, only when the About dialog shows them, and finds none in
  a development run that never built them.
- `src/messages.ts` says what the app tells the user about failures, progress
  and saving; `src/format.ts` holds other shared display text such as warp, game
  and tab names, dates and times.
- `src/assets/main.css` holds the base styles; each component carries scoped
  styles. `src/assets/brand/` holds the brand's emblem and wordmark, kept as
  supplied ([decision 0023](../docs/architecture/decisions/0023-astral-brand.md)). Everything is bundled (no remote fonts or assets).
- `build/vite.ts` holds the Vite configuration, to which `vite.config.ts` only
  delegates.

Unit tests sit beside the code they test as `*.test.ts`. Integration tests, which
mount the app with native commands mocked, live in `tests/`, beside `setup.ts`,
which keeps the tests' clock from running backwards (see
[TESTING](../docs/development/TESTING.md#frontend-test-clock)). Native end-to-end
tests live in the repository-root `tests/`. `npm test` and `npm run coverage` run
the frontend's own tests and coverage here, or with the tooling's from the
repository root, where `npm run typecheck` checks everything.
