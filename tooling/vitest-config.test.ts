import { expect, test } from 'vitest'
import { vitestConfig } from './vitest-config'

test('repository tooling and gate tests run in Node; the frontend runs its own tests', () => {
  expect(vitestConfig({}).test?.projects).toEqual([
    { test: { name: 'tooling', environment: 'node', include: ['tooling/**/*.test.ts'] } },
    { test: { name: 'gates', environment: 'node', include: ['tests/**/*.test.ts'] } },
  ])
})

test('tooling coverage is 100% per file, excluding tests', () => {
  expect(vitestConfig({}).test?.coverage).toEqual({
    provider: 'v8',
    reportsDirectory: 'coverage/tooling',
    include: ['tooling/**/*.ts'],
    exclude: ['**/*.test.ts', '**/*.d.ts'],
    reporter: ['text', 'json', 'json-summary'],
    thresholds: { perFile: true, 100: true },
  })
})

test('outside GitHub Actions, tests report to the terminal alone', () => {
  expect(vitestConfig({}).test?.reporters).toEqual(['default'])
  // The delegate passes the process environment.
  expect(vitestConfig().test?.reporters).toEqual(
    process.env.GITHUB_ACTIONS === 'true'
      ? ['default', ['github-actions', { jobSummary: { enabled: false } }]]
      : ['default'],
  )
})

test('in GitHub Actions, failures are annotated but no job summary is written', () => {
  // Every Vitest run would add an untitled summary, the probes' expected failures too;
  // CI writes one summary per job instead.
  expect(vitestConfig({ GITHUB_ACTIONS: 'true' }).test?.reporters).toEqual([
    'default',
    ['github-actions', { jobSummary: { enabled: false } }],
  ])
})

test('during the mutation probes, tooling coverage goes to the probe run’s folder', () => {
  expect(vitestConfig({ ASTRAL_INDEX_PROBE_RUN: '1' }).test?.coverage?.reportsDirectory).toBe(
    'test-results/probe-run/coverage/tooling',
  )
})
