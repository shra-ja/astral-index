# Frontend

Status: implemented. See decisions [0011](decisions/0011-vue-frontend.md)
(Vue and its conventions) and [0013](decisions/0013-visual-design.md) (visual
design). [`src-ui/README.md`](../../src-ui/README.md) maps the files.

The webview is a Vue 3 app in the `src-ui/` workspace, built so screens can be
rearranged without rewriting the flows behind them.

## Layers

- **Shell and routes:** `App.vue` places the sidebar beside the current screen.
  Hash routes give each game a History and an Import screen
  (`/:game/history`, `/:game/import`); the app opens on Star Rail's history. The
  shell creates the retrieval flow and provides it to the screens, so a running
  retrieval and its review survive switching screens.
- **Flows (composables):** `useRetrieval` owns retrieval, review and saving;
  `useHistory` reads saved history a page at a time; `useLastImport` reads the
  last import. They are the only callers of the native commands, through the
  typed client in `commands.ts`. They expose read-only state and actions.
- **Views:** wire flows to components and manage focus between steps.
- **Components:** presentational only: props in, events out, no native calls.
  Grouped by where they are used (`layout/`, `history/`, `import/`, `shared/`).
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
