# 0011 — Vue frontend

Date: 2026-09-29
Status: Accepted; supersedes the "no runtime UI framework" and TypeScript version
parts of [decision 0001](0001-shell-and-test-stack.md).

## Context

The webview was vanilla TypeScript: one template string and hand-written DOM
updates in `src/main.ts`. That suited an empty state, but the stored-history
display needs lists that change by account and warp, and milestone 4 adds filters,
totals and highlights. The user treats the current UI as a placeholder: the import
and retrieval flow will move to its own screen, apart from the full history.

Constraints: 100% per-file coverage through V8, including branches; the production
CSP (`script-src 'self'`, so no `eval`); exact dependency pins; offline use with no
remote assets.

## Decision

Adopt Vue 3 with single-file components, Vue Router, Vue Test Utils and
TypeScript 6, following the official `create-vue` and Tauri Vue template
conventions regardless of the app's current size, so the structure guides growth:

- **Components:** small and presentational, taking props and emitting events.
  Native calls stay in the flow code that uses them; flow logic moves into
  composables; shared display text lives in modules such as `src/format.ts`.
- **Structure:** the frontend moves into a self-contained `src-ui/` npm
  workspace beside `src-tauri/`, so each half of the app is self-contained; the
  user chose the name to mirror `src-tauri/`. Inside it: `components/`, `App.vue`, `views/` behind Vue Router
  with hash history (no server fallback is needed under Tauri's custom protocol,
  and no one sees the URL), `composables/` and `assets/`.
- **Test layout, mirroring the Rust side:** unit tests are sibling `*.test.ts`
  files beside the code they test (the user preferred them to `__tests__/` for
  findability, and because they encourage grouping source into folders);
  integration tests, which mount the app with native calls mocked, live in
  `src-ui/tests/` with shared fixtures in `src-ui/tests/fixtures/`, like
  `src-tauri/tests/`; end-to-end tests of the real native app stay in root
  `tests/`.
- **Build:** `vite.config.ts` only delegates to `scripts/vite-config.ts`, which
  holds Tauri's recommended settings (loopback dev server on port 1420,
  `clearScreen: false`, `TAURI_DEV_HOST` live reload, `envPrefix`, a WebView2 or
  WebKit build target, source maps only for debug builds) and the Vitest projects
  and coverage settings. Vitest always excludes its own config file from coverage
  (hard-coded, "cannot be overridden by user config"), so the file is a third
  guarded delegate beside `main.rs` and `build.rs`, pinned by an exact source
  check; unlike those, it has no coverage of its own.
- **Tests:** Vitest projects `ui` (jsdom), `tooling` (Node) and `gates` (Node)
  replace command-line flags.
- **Types:** TypeScript 6.0.3 throughout, split by `create-vue`'s project
  references: `tsconfig.app.json` (browser only, from `@vue/tsconfig`),
  `tsconfig.vitest.json` and `tsconfig.node.json` (from `@tsconfig/node26`).
  `vue-tsc --build` checks all three, including templates.

## Alternatives and consequences

- **Preact** is small and uses plain JSX, but the user preferred Vue's larger
  community, official ecosystem and recognition. Bundle size barely matters for a
  desktop app loaded from disk.
- **React** has the largest ecosystem and plain JSX, but its render-scoped state
  needs parallel refs for long async flows such as cancellable retrieval, where
  Vue's refs stay live.
- **Svelte** compiles templates like Vue, with the same kind of coverage risk and
  a smaller ecosystem.
- **Staying vanilla** would mean hand-built list updates for every history view.
- **TypeScript 7** checks roughly ten times faster, but its native compiler has no
  JavaScript API. `vue-tsc`, the Vue language server and tools such as
  `typescript-eslint` need that API, so keeping 7 meant running a second compiler
  through `@typescript/typescript6`. Revisit when Vue's official tooling supports
  TypeScript 7.
- The JavaScript bundle grows from about 10 KB to about 80 KB, which does not
  matter for a local app.

## Evidence

A trial (2026-09-29) ported the review screen to a Vue component:

- With one of four paths tested, V8 coverage reported the untested `v-if`
  branches, list and handlers as uncovered (56% of branches), so the false 100%
  of [vitest#4993](https://github.com/vitest-dev/vitest/issues/4993) does not
  occur with Vitest 5, Vue 3.5.43 and `@vitejs/plugin-vue` 6.0.9. With every path
  tested it reached 100% of statements, branches and functions without
  workarounds; the compiler's own branches were covered by ordinary rendering.
- The runtime-only bundle contains no `eval` or `new Function`, and the offline
  native test rendered the component in the real window under the production CSP.
- `vue-tsc` failed to start with TypeScript 7 and caught script and template type
  errors on TypeScript 6. In this step, mutations confirmed the app project
  rejects Node's `process` and a template type error.
- `tsc -b` with project references works on both TypeScript 6 and 7.
