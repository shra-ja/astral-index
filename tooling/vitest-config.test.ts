import { expect, test } from 'vitest'
import { vitestConfig } from './vitest-config'

test('repository tooling and gate tests run in Node; the frontend runs its own tests', () => {
  expect(vitestConfig().test?.projects).toEqual([
    { test: { name: 'tooling', environment: 'node', include: ['tooling/**/*.test.ts'] } },
    { test: { name: 'gates', environment: 'node', include: ['tests/**/*.test.ts'] } },
  ])
})

test('tooling coverage is 100% per file, excluding tests', () => {
  expect(vitestConfig().test?.coverage).toEqual({
    provider: 'v8',
    reportsDirectory: 'coverage/tooling',
    include: ['tooling/**/*.ts'],
    exclude: ['**/*.test.ts', '**/*.d.ts'],
    reporter: ['text', 'json', 'json-summary'],
    thresholds: { perFile: true, 100: true },
  })
})
