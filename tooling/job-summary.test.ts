import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { isCheckJob, jobSummary } from './job-summary'

// The gates' report paths, even when the mutation probes run these tests.
beforeEach(() => {
  vi.stubEnv('ASTRAL_INDEX_PROBE_RUN', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

const istanbul = (covered: number, total: number) =>
  JSON.stringify({
    total: Object.fromEntries(
      ['lines', 'statements', 'functions', 'branches'].map((metric) => [
        metric,
        { total, covered, pct: (covered / total) * 100 },
      ]),
    ),
  })
const llvm = (files: [number, number][]) =>
  JSON.stringify({
    type: 'llvm.coverage.json.export',
    data: [
      {
        files: files.map(([covered, count], index) => ({
          filename: `src/file${index}.rs`,
          summary: Object.fromEntries(
            ['lines', 'regions', 'functions', 'branches'].map((metric) => [
              metric,
              { count, covered },
            ]),
          ),
        })),
      },
    ],
  })

test('names the three Linux check jobs and nothing else', () => {
  for (const job of ['static', 'gates', 'probes']) expect(isCheckJob(job)).toBe(true)
  for (const job of ['windows-tests', '', undefined]) expect(isCheckJob(job)).toBe(false)
})

test('the static job says what it ran and how it ended', () => {
  expect(jobSummary('static', 'success', () => undefined)).toBe(
    [
      '## Format, lint, docs and Rust lints: passed',
      '',
      'Ran `npm run check:static`: formatting, lint, the docs, icon and version checks, the frontend bundle, Rust formatting and Clippy.',
      '',
    ].join('\n'),
  )
  expect(jobSummary('static', 'failure', () => undefined)).toContain(
    '## Format, lint, docs and Rust lints: failed',
  )
  expect(jobSummary('static', 'cancelled', () => undefined)).toContain(': cancelled')
})

test('the probes job explains the failures its probes cause on purpose', () => {
  const summary = jobSummary('probes', 'success', () => undefined)
  expect(summary).toContain('## Mutation probes: passed')
  expect(summary).toContain('Ran `npm run check:probes`: the build, then the mutation probes.')
  expect(summary).toContain(
    'Each probe runs a gate expecting it to fail, so failures inside a probe are the probe working.',
  )
  expect(summary).toContain('`probe-failures`')
})

test('the gates job reports each coverage report’s totals, or that it is missing', () => {
  const reports: Record<string, string> = {
    'coverage/frontend/coverage-summary.json': istanbul(250, 250),
    'coverage/tooling/coverage-summary.json': istanbul(99, 100),
    'coverage/backend-unit/coverage.json': llvm([
      [10, 10],
      [5, 5],
    ]),
  }
  const summary = jobSummary('gates', 'failure', (path) => reports[path])
  expect(summary).toContain('## Tests and 100% coverage: failed')
  expect(summary).toContain(
    'Ran `npm run check:gates`: the build, coverage, the offline native tests and report validation.',
  )
  expect(summary).toContain(
    [
      '| Report | Lines | Statements or regions | Functions | Branches |',
      '| --- | --- | --- | --- | --- |',
      '| Frontend | 100% (250/250) | 100% (250/250) | 100% (250/250) | 100% (250/250) |',
      '| Tooling | 99% (99/100) | 99% (99/100) | 99% (99/100) | 99% (99/100) |',
      '| Rust, unit tests | 100% (15/15) | 100% (15/15) | 100% (15/15) | 100% (15/15) |',
      '| Rust, all tests | Not produced | | | |',
    ].join('\n'),
  )
})

test('a report with nothing to measure reads as such rather than as a percentage', () => {
  const summary = jobSummary('gates', 'success', (path) =>
    path === 'coverage/backend/coverage.json' ? llvm([[0, 0]]) : undefined,
  )
  expect(summary).toContain('| Rust, all tests | None | None | None | None |')
  // Below 100% shows two decimals, so a near miss is visible.
  expect(
    jobSummary('gates', 'success', (path) =>
      path === 'coverage/tooling/coverage-summary.json' ? istanbul(2998, 3000) : undefined,
    ),
  ).toContain('| Tooling | 99.93% (2998/3000) |')
})
