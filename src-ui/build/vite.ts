// The frontend's Vite and Vitest configuration, kept here so it is unit-tested:
// Vitest never measures `vite.config.ts` itself, which only delegates to this module.
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import type { ViteUserConfig } from 'vitest/config'

/** Tauri's dev URL expects this port; live reload uses the next one. */
const DEV_PORT = 1420

/** Where Vite reads its environment files, beside this configuration's project. */
const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Stops the build, dev server or tests when a feature toggle in the mode's
 * environment files is neither `true` nor `false`, rather than letting the app
 * fall back to a default (decision 0026).
 */
function checkToggles(mode: string, envDir: string) {
  for (const [name, value] of Object.entries(loadEnv(mode, envDir, 'VITE_FEATURE_'))) {
    if (value !== 'true' && value !== 'false') {
      throw new Error(`${name} must be true or false in ${mode} mode, not "${value}"`)
    }
  }
}

/**
 * The configuration for the given environment and Vite mode, following Tauri's
 * Vite guide. `TAURI_DEV_HOST` serves the dev server on another device's network;
 * the `TAURI_ENV_*` variables are set by the Tauri CLI during builds.
 */
export function viteConfig(env: NodeJS.ProcessEnv, mode: string, envDir = ROOT): ViteUserConfig {
  checkToggles(mode, envDir)
  const host = env.TAURI_DEV_HOST
  const debug = Boolean(env.TAURI_ENV_DEBUG)
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
    // build test opts into Node with a `@vitest-environment` comment. The setup file
    // keeps the clock from running backwards, which lost triggered events. Reports go
    // to the repository's `coverage/`, beside the backend's, for the root gates.
    test: {
      environment: 'jsdom',
      // In GitHub Actions, annotate failures but write no job summary: CI writes one
      // per job, which the probes' expected failures cannot reach.
      reporters:
        env.GITHUB_ACTIONS === 'true'
          ? ['default', ['github-actions', { jobSummary: { enabled: false } }]]
          : ['default'],
      include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'build/**/*.test.ts'],
      setupFiles: ['tests/setup.ts'],
      coverage: {
        provider: 'v8',
        // During the mutation probes, reports go to the probe run's own folder, as
        // tooling/outputs.ts places them.
        reportsDirectory:
          env.ASTRAL_INDEX_PROBE_RUN === '1'
            ? '../test-results/probe-run/coverage/frontend'
            : '../coverage/frontend',
        include: ['src/**/*.{ts,vue}', 'build/**/*.ts'],
        exclude: ['**/*.test.ts', 'tests/**', '**/*.d.ts'],
        reporter: ['text', 'json', 'json-summary'],
        thresholds: { perFile: true, 100: true },
      },
    },
  }
}
