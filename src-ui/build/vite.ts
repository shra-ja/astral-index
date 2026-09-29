// The frontend's Vite and Vitest configuration, kept here so it is unit-tested:
// Vitest never measures `vite.config.ts` itself, which only delegates to this module.
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import type { ViteUserConfig } from 'vitest/config';

/** Tauri's dev URL expects this port; live reload uses the next one. */
const DEV_PORT = 1420;

/**
 * The configuration for the given environment, following Tauri's Vite guide.
 * `TAURI_DEV_HOST` serves the dev server on another device's network; the
 * `TAURI_ENV_*` variables are set by the Tauri CLI during builds.
 */
export function viteConfig(env: NodeJS.ProcessEnv): ViteUserConfig {
  const host = env.TAURI_DEV_HOST;
  const debug = Boolean(env.TAURI_ENV_DEBUG);
  return {
    // Vue templates compile ahead of time, so the runtime-only build needs no `eval`
    // under the production CSP (decision 0011).
    plugins: [vue()],
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    // Keep Rust compiler errors visible in `tauri dev`.
    clearScreen: false,
    server: {
      host: host || '127.0.0.1',
      port: DEV_PORT,
      strictPort: true,
      hmr: host ? { protocol: 'ws', host, port: DEV_PORT + 1 } : undefined,
      watch: { ignored: ['**/src-tauri/**'] },
    },
    envPrefix: ['VITE_', 'TAURI_ENV_*'],
    build: {
      // WebView2 on Windows; WebKit on macOS and Linux.
      target: env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
      minify: !debug,
      sourcemap: debug,
    },
    // Unit tests sit beside their source and integration tests in `tests/`; the
    // build test opts into Node with a `@vitest-environment` comment. Reports go to
    // the repository's `coverage/`, beside the backend's, for the root gates.
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'build/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        reportsDirectory: '../coverage/frontend',
        include: ['src/**/*.{ts,vue}', 'build/**/*.ts'],
        exclude: ['**/*.test.ts', 'tests/**', '**/*.d.ts'],
        reporter: ['text', 'json', 'json-summary'],
        thresholds: { perFile: true, 100: true },
      },
    },
  };
}
