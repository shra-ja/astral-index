import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { PROBE_COMMAND_SECONDS, runBounded, saveFailureSnapshot } from './probe-run'

let folder: string | undefined
afterEach(() => {
  if (folder) rmSync(folder, { recursive: true, force: true })
  folder = undefined
})

test('a bounded command reports its exit status and keeps all its output', () => {
  const run = runBounded('sh', ['-c', 'echo out; echo err >&2; exit 3'])
  expect(run).toEqual({ status: 3, output: 'out\nerr\n', timedOut: false })
  expect(runBounded('true', [])).toEqual({ status: 0, output: '', timedOut: false })
})

test('a command still running at its bound is stopped with everything it started', () => {
  const started = Date.now()
  // The background sleep keeps the output pipe open, as a stray app or X server would.
  const run = runBounded('sh', ['-c', 'echo begun; sleep 30 & sleep 30'], 1)
  expect(Date.now() - started).toBeLessThan(10_000)
  expect(run.timedOut).toBe(true)
  expect(run.output).toBe('begun\n')
  // One stalled command, killed at most 30 s after its bound, still fails within CI's
  // 30-minute job on top of a normal run of about 15 minutes.
  expect(PROBE_COMMAND_SECONDS + 30).toBeLessThanOrEqual(15 * 60)
})

test('a failure snapshot keeps the command, outcome, expectation, machine state and output', () => {
  folder = mkdtempSync(join(tmpdir(), 'probe-snapshot-'))
  const saved = saveFailureSnapshot(
    folder,
    'npm',
    ['run', 'test:e2e-probe'],
    { status: 124, output: 'last line before the stall\n', timedOut: true },
    'a failure naming CSP must block webview connections',
  )
  expect(readdirSync(folder)).toEqual([saved.slice(folder.length + 1)])
  const log = readFileSync(join(saved, 'snapshot.log'), 'utf8')
  expect(log).toContain('$ npm run test:e2e-probe')
  expect(log).toContain(
    `timed out after ${PROBE_COMMAND_SECONDS} s; expected a failure naming CSP must block webview connections`,
  )
  expect(log).toMatch(/^load \d/m)
  expect(log).toContain('Mem:')
  expect(log).toContain('PID')
  expect(log.endsWith('last line before the stall\n')).toBe(true)
  // A command that ended on its own names its exit status instead.
  const ended = saveFailureSnapshot(
    folder,
    'npm',
    ['run', 'coverage:json'],
    { status: 0, output: '', timedOut: false },
    'a failure naming coverage-probe.ts',
  )
  expect(readFileSync(join(ended, 'snapshot.log'), 'utf8')).toContain(
    'exit 0; expected a failure naming coverage-probe.ts',
  )
})
