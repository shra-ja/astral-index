# Frontend

Status: implemented. See decisions [0011](decisions/0011-vue-frontend.md)
(Vue and its conventions) and [0013](decisions/0013-visual-design.md) (visual
design). [`src-ui/README.md`](../../src-ui/README.md) maps the files.

The webview is a Vue 3 app in the `src-ui/` workspace, built so screens can be
rearranged without rewriting the flows behind them.

## Layers

- **Shell and routes:** `App.vue` places the sidebar beside the current screen.
  Hash routes give each game a History and an Import screen
  (`/:game/history`, `/:game/import`) for each game the build
  shows, which
  `features.ts` lists from the build-time feature toggles
  ([decision 0026](decisions/0026-feature-toggles.md)); release builds hide
  Genshin Impact, and its addresses redirect. Backup & Restore covers every
  game, so it is app-wide at `/backup`, in the sidebar's Data group; while it is
  open no game is current, and the shell keeps the game shown last for the View
  group's links ([decision 0033](decisions/0033-app-wide-and-per-game-screens.md)).
  A history from an older release that couldn't be upgraded opens the app-wide
  History Unavailable screen at `/unavailable` instead: the router's guard asks
  `history_status` before the first screen, any later command that fails with
  `history_not_upgraded` switches the shell there too, and while it shows, the
  game screens redirect to it and the sidebar greys out their links. Its card can
  restore a backup, with the usual confirmation, after which Backup & Restore says
  how it went ([0037](../product/features/0037-backup-and-restore.md)).
  The app opens on Star Rail's history. The
  shell creates the retrieval flow and provides it to the screens, so a running
  retrieval and its review survive switching screens. A restore, by contrast,
  belongs to the Backup & Restore screen: leaving its confirmation asks first,
  then cancels it. It also shows the About
  dialog, a native modal `<dialog>` with no route, over whichever screen is open,
  and returns focus to the sidebar's About button when it closes.
- **Flows (composables):** `useRetrieval` owns retrieval, review and saving;
  `useHistory` reads saved history a page at a time; `useLastImport` reads the
  last import; `useBackup` saves a backup; `useRestore` chooses a backup to
  restore, holds it while its confirmation is shown and restores it, forgetting
  each game's chosen account, and tells its screen when it replaced the
  history; `useRestoreLeaving` asks before leaving a held restore, on both
  screens that restore; `useHistoryAvailability` holds whether the history can
  be used; `useOpenings` asks the native side to open the data folder or issues
  page; `useAbout` builds on it, reads the About dialog's details and loads the
  third-party notices once, when first shown. They are the only callers of the native commands, through the
  typed client in `commands.ts`. They expose read-only state and actions.
- **Views:** wire flows to components and manage focus between steps.
- **Components:** presentational only: props in, events out, no native calls.
  Grouped by where they are used (`layout/`, `history/`, `import/`, `backup/`,
  `unavailable/`, `about/`, `shared/`).
- **Text:** `messages.ts` turns failures, progress and save results into what the
  user reads; `format.ts` holds names, dates, times and other display text.

## Rules

- Only the composables call native commands; saved history is read from this
  device only, never from HoYoverse.
- Only the latest read updates a screen, so a slow earlier read never replaces a
  later one.
- Layouts are fluid: flex and grid relative placement, wrapping, container
  queries and max-width containers; fixed sizes only for content such as icons
  and numeric columns. The window's minimum is 480×560.
- Every flow step is keyboard-operable, moves focus to its heading or main
  control, and has readable empty, failure and success states.
- Everything is bundled: styles, the Hanken Grotesk typeface and Lucide icons.
  Base styles and the colour tokens live in `assets/main.css`; components carry
  scoped styles; the production CSP needs no inline scripts or styles.
