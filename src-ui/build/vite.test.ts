// @vitest-environment node
// The config runs in Node, so its test does too.
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { viteConfig } from './vite'

const src = fileURLToPath(new URL('../src', import.meta.url))

test('the build compiles Vue single-file components and resolves @ to src', () => {
  const config = viteConfig({})
  const names = (config.plugins ?? [])
    .flat()
    .map((plugin) => (plugin && 'name' in plugin ? plugin.name : undefined))
  expect(names).toContain('vite:vue')
  expect(config.resolve?.alias).toEqual({ '@': src })
})

test('the dev server stays on loopback at the port Tauri expects, and ignores the Rust app', () => {
  const config = viteConfig({})
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
  const server = viteConfig({ TAURI_DEV_HOST: '192.0.2.10' }).server
  expect(server?.host).toBe('192.0.2.10')
  expect(server?.hmr).toEqual({ protocol: 'ws', host: '192.0.2.10', port: 1421 })
})

test('builds target each platform webview, with source maps only for debug builds', () => {
  expect(viteConfig({}).build).toEqual({ target: 'safari13', minify: true, sourcemap: false })
  expect(viteConfig({ TAURI_ENV_PLATFORM: 'windows' }).build?.target).toBe('chrome105')
  expect(viteConfig({ TAURI_ENV_DEBUG: 'true' }).build).toEqual({
    target: 'safari13',
    minify: false,
    sourcemap: true,
  })
})

test('frontend tests run in jsdom, with 100% per-file coverage reported to the repository', () => {
  expect(viteConfig({}).test).toEqual({
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
  })
})
