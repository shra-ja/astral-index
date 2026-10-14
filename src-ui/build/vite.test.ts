// @vitest-environment node
// The config runs in Node, so its test does too.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { afterEach, expect, test, vi } from 'vitest'
import { viteConfig } from './vite'

const src = fileURLToPath(new URL('../src', import.meta.url))
const root = fileURLToPath(new URL('..', import.meta.url))

test('the build compiles Vue single-file components and resolves @ to src', () => {
  const config = viteConfig({}, 'production')
  const names = (config.plugins ?? [])
    .flat()
    .map((plugin) => (plugin && 'name' in plugin ? plugin.name : undefined))
  expect(names).toContain('vite:vue')
  expect(config.resolve?.alias).toEqual({ '@': src })
})

test('the dev server stays on loopback at the port Tauri expects, and ignores the Rust app', () => {
  const config = viteConfig({}, 'production')
  expect(config.clearScreen).toBe(false)
  expect(config.server).toEqual({
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    hmr: undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  })
  expect(config.envPrefix).toEqual(['VITE_', 'TAURI_ENV_*'])
})

test('a Tauri dev host serves the dev server and live reload there instead', () => {
  const server = viteConfig({ TAURI_DEV_HOST: '192.0.2.10' }, 'production').server
  expect(server?.host).toBe('192.0.2.10')
  expect(server?.hmr).toEqual({ protocol: 'ws', host: '192.0.2.10', port: 1421 })
})

test('builds target each platform webview, with source maps only for debug builds', () => {
  expect(viteConfig({}, 'production').build).toEqual({
    target: 'safari13',
    minify: true,
    sourcemap: false,
  })
  expect(viteConfig({ TAURI_ENV_PLATFORM: 'windows' }, 'production').build?.target).toBe(
    'chrome105',
  )
  expect(viteConfig({ TAURI_ENV_DEBUG: 'true' }, 'production').build).toEqual({
    target: 'safari13',
    minify: false,
    sourcemap: true,
  })
})

test('frontend tests run in jsdom on a clock that never runs backwards, with 100% per-file coverage reported to the repository', () => {
  expect(viteConfig({}, 'production').test).toEqual({
    environment: 'jsdom',
    reporters: ['default'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'build/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../coverage/frontend',
      include: ['src/**/*.{ts,vue}', 'build/**/*.ts'],
      exclude: ['**/*.test.ts', 'tests/**', '**/*.d.ts'],
      reporter: ['text', 'json', 'json-summary'],
      thresholds: { perFile: true, 100: true },
    },
  })
})

// The environment overrides the files, and Vitest sets it from `.env.test`.
const withoutToggles = () => vi.stubEnv('VITE_FEATURE_GENSHIN_IMPACT', undefined)
afterEach(() => {
  vi.unstubAllEnvs()
})

test('unfinished features are on in development and tests, and off in releases', () => {
  withoutToggles()
  const toggles = (mode: string) => loadEnv(mode, root, 'VITE_FEATURE_')
  expect(toggles('development')).toEqual({ VITE_FEATURE_GENSHIN_IMPACT: 'true' })
  expect(toggles('test')).toEqual({ VITE_FEATURE_GENSHIN_IMPACT: 'true' })
  expect(toggles('production')).toEqual({ VITE_FEATURE_GENSHIN_IMPACT: 'false' })
})

test('a toggle other than true or false fails the build', () => {
  withoutToggles()
  const envDir = mkdtempSync(join(tmpdir(), 'astral-index-env-'))
  try {
    writeFileSync(join(envDir, '.env.production'), 'VITE_FEATURE_GENSHIN_IMPACT=false\n')
    expect(viteConfig({}, 'production', envDir).build?.target).toBe('safari13')
    for (const value of ['yes', 'TRUE', '']) {
      writeFileSync(join(envDir, '.env.production'), `VITE_FEATURE_GENSHIN_IMPACT=${value}\n`)
      expect(() => viteConfig({}, 'production', envDir)).toThrow(
        `VITE_FEATURE_GENSHIN_IMPACT must be true or false in production mode, not "${value}"`,
      )
    }
  } finally {
    rmSync(envDir, { recursive: true })
  }
})

test('in GitHub Actions, failures are annotated but no job summary is written', () => {
  // Every Vitest run would add an untitled summary, the probes' expected failures too;
  // CI writes one summary per job instead.
  expect(viteConfig({ GITHUB_ACTIONS: 'true' }, 'production').test?.reporters).toEqual([
    'default',
    ['github-actions', { jobSummary: { enabled: false } }],
  ])
})

test('during the mutation probes, frontend coverage goes to the probe run’s folder', () => {
  // As tooling/outputs.ts places it, which this separate project cannot import.
  expect(
    viteConfig({ ASTRAL_INDEX_PROBE_RUN: '1' }, 'production').test?.coverage?.reportsDirectory,
  ).toBe('../test-results/probe-run/coverage/frontend')
})
