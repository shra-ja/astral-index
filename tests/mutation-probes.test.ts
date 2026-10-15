import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  unlinkSync,
  renameSync,
  statSync,
  utimesSync,
} from 'node:fs'
import { join } from 'node:path'
import { beforeAll, expect, test } from 'vitest'
import { runBounded, saveFailureSnapshot } from '../tooling/probe-run'
import type { LlvmCoverageExport } from '../tooling/coverage'
import { outputs, PROBE_RUN, probeOutputs } from '../tooling/outputs'

// Per-probe finally blocks restore files. The probes break gates on purpose, so every
// command they run writes its reports and results to the probe run's own folder
// (tooling/outputs.ts): the gates' reports stay as the gates left them.
process.env[PROBE_RUN] = '1'
const { coverage } = outputs()

/**
 * Each file under `folder`, with its size and modification time, leaving out the
 * probes' own folders and logs, which whoever runs the check may be writing.
 */
function contents(folder: string) {
  if (!existsSync(folder)) return {}
  return Object.fromEntries(
    readdirSync(folder, { recursive: true, encoding: 'utf8' })
      .filter((file) => !/^(probe-run|probe-failures)(\/|$)/.test(file) && !file.endsWith('.log'))
      .flatMap((file) => {
        const entry = statSync(join(folder, file))
        return entry.isFile() ? [[file, { size: entry.size, mtimeMs: entry.mtimeMs }]] : []
      }),
  )
}
// What the gates left: their reports, screenshots and other results.
const gateOutputs = { coverage: contents('coverage'), results: contents('test-results') }

// Scoped probes carry this target; running the full integration suite fails them.
const unrelatedIntegration =
  '#[test] fn unrelated_must_not_run() { panic!("probe ran unrelated integration tests"); }\n'

// Snapshots of unexpected probe outcomes; passing runs write nothing.
const failures = 'test-results/probe-failures'

/**
 * Run a command that must fail, naming `message` in its output, within the probe
 * bound. If it does not, save a failure snapshot before asserting, since a rare
 * failure can't be seen afterwards.
 */
function expectCommandFailure(command: string, args: string[], message: string): void {
  const run = runBounded(command, args)
  if (run.status === 0 || run.timedOut || !run.output.includes(message)) {
    saveFailureSnapshot(failures, command, args, run, `a failure naming ${message}`)
  }
  expect(run.timedOut).toBe(false)
  expect(run.status).not.toBe(0)
  expect(run.output).toContain(message)
}

/** Run a command that must succeed within the probe bound, saving a snapshot if not. */
function expectCommandSuccess(command: string, args: string[]): void {
  const run = runBounded(command, args)
  if (run.status !== 0) saveFailureSnapshot(failures, command, args, run, 'success')
  expect(run.timedOut).toBe(false)
  expect(run.status).toBe(0)
}

// The probes tamper with a fresh baseline of their own.
beforeAll(() => {
  // Clear the probe run's folder by name, never wherever results go.
  rmSync(probeOutputs.results, { recursive: true, force: true })
  expectCommandSuccess('npm', ['run', 'coverage:json'])
  expectCommandSuccess('npm', ['run', 'coverage:backend-unit:json'])
}, 1200000)

// Runs first: the probes' commands wrote their baseline to the probe run's folder.
test('the probes work on a baseline of their own', () => {
  for (const report of [
    'frontend/coverage-summary.json',
    'tooling/coverage-summary.json',
    'backend-unit/coverage.json',
  ]) {
    expect(existsSync(`${probeOutputs.coverage}/${report}`), report).toBe(true)
  }
})

// Run one report check and require it to fail for the expected reason.
function expectReportFailure(name: string, message: string): void {
  expectCommandFailure(
    'npx',
    ['vitest', 'run', 'tests/coverage-reports.test.ts', '-t', name],
    message,
  )
}

test('the unit gate rejects stale evidence', () => {
  const path = `${coverage}/backend-unit/coverage.json`
  const original = statSync(path)
  try {
    utimesSync(path, original.atime, new Date(0))
    expectReportFailure('^backend unit coverage$', 'Stale report')
  } finally {
    utimesSync(path, original.atime, original.mtime)
  }
}, 30000)

test('the real coverage command rejects an unexecuted file and branch', () => {
  const probe = 'src-ui/src/coverage-probe.ts'
  expect(existsSync(probe)).toBe(false)
  try {
    writeFileSync(probe, 'export const probe = (value: boolean) => value ? 1 : 0;\n')
    expectCommandFailure('npm', ['run', 'coverage:json'], 'coverage-probe.ts')
  } finally {
    unlinkSync(probe)
  }
}, 30000)

test('Rust instrumentation detects an uncovered branch and inventory rejects an uncompiled source', () => {
  const main = 'src-tauri/src/main.rs'
  const original = readFileSync(main, 'utf8')
  const orphan = 'src-tauri/src/coverage_probe.rs'
  expect(existsSync(orphan)).toBe(false)
  const unrelated = 'src-tauri/tests/unrelated_native_probe.rs'
  expect(existsSync(unrelated)).toBe(false)
  try {
    writeFileSync(unrelated, unrelatedIntegration)
    writeFileSync(
      main,
      original.replace(
        'fn main() {',
        'fn main() {\n    let _probe = if std::env::var_os("ASTRAL_INDEX_UNSET_COVERAGE_PROBE").is_some() { 1 } else { 0 };',
      ),
    )
    expectCommandSuccess('npm', ['run', 'test:e2e-probe'])
    const report = JSON.parse(
      readFileSync(`${coverage}/backend/coverage.json`, 'utf8'),
    ) as LlvmCoverageExport
    const summary = report.data[0].files.find((file) =>
      file.filename.endsWith('/src/main.rs'),
    )!.summary
    expect(summary.branches.count).toBeGreaterThan(summary.branches.covered)
    expectReportFailure('^backend wrapper coverage$', 'Uncovered')
  } finally {
    unlinkSync(unrelated)
    writeFileSync(main, original)
  }
  try {
    writeFileSync(orphan, 'pub fn uncompiled() {}\n')
    expectReportFailure('^backend unit coverage$', 'Missing coverage')
  } finally {
    unlinkSync(orphan)
  }
}, 180000)

test('the report gate fails closed when a required report is missing or incomplete', () => {
  const path = `${coverage}/frontend/coverage-summary.json`
  const backup = `${path}.probe-backup`
  expect(existsSync(backup)).toBe(false)
  const original = readFileSync(path, 'utf8')
  renameSync(path, backup)
  try {
    expectReportFailure('^frontend coverage$', 'ENOENT')
    writeFileSync(path, '{}')
    expectReportFailure('^frontend coverage$', 'Missing coverage')
  } finally {
    writeFileSync(path, original)
    unlinkSync(backup)
  }
}, 30000)

// Exercise the public commands so adding a suite cannot silently bypass either gate.
// It runs the frontend and tooling suites eight times: 103–180 s on CI runners in
// October 2026, so it allows 6 minutes, well within CI's 30-minute job.
test('the test and coverage commands discover additional frontend and tooling suites', () => {
  // Sibling unit tests, frontend integration tests, build tests and tooling tests.
  const paths = [
    'src-ui/src/discovery-probe.test.ts',
    'src-ui/tests/discovery-probe.test.ts',
    'src-ui/build/discovery-probe.test.ts',
    'tooling/discovery-probe.test.ts',
  ]
  for (const path of paths) expect(existsSync(path)).toBe(false)
  // One suite at a time: the frontend's run stops the commands before tooling's.
  for (const path of paths) {
    try {
      writeFileSync(
        path,
        `import { test, expect } from 'vitest';\ntest('${path}', () => expect('discovery probe').toBe('must fail'));\n`,
      )
      for (const command of ['test', 'coverage:json']) {
        expectCommandFailure('npm', ['run', command], path.replace(/^src-ui\//, ''))
      }
    } finally {
      unlinkSync(path)
    }
  }
}, 360000)

// A network failure alone must not satisfy the native CSP assertion.
test('the native CSP test rejects a permissive connection policy', () => {
  const path = 'src-tauri/tauri.conf.json'
  const original = readFileSync(path, 'utf8')
  const policy = 'connect-src ipc: http://ipc.localhost'
  expect(original).toContain(policy)
  const unrelated = 'src-tauri/tests/unrelated_native_probe.rs'
  expect(existsSync(unrelated)).toBe(false)
  try {
    writeFileSync(unrelated, unrelatedIntegration)
    writeFileSync(path, original.replace(policy, 'connect-src *'))
    expectCommandFailure('npm', ['run', 'test:e2e-probe'], 'CSP must block webview connections')
  } finally {
    unlinkSync(unrelated)
    writeFileSync(path, original)
  }
}, 180000)

// Integration execution must never fill a unit-test coverage gap.
test('backend coverage requires unit execution even when integration tests cover the code', () => {
  const library = 'src-tauri/src/lib.rs'
  const integration = 'src-tauri/tests/unit_coverage_probe.rs'
  const unrelated = 'src-tauri/tests/unrelated_scope_probe.rs'
  const original = readFileSync(library, 'utf8')
  expect(existsSync(unrelated)).toBe(false)
  expect(existsSync(integration)).toBe(false)
  try {
    writeFileSync(unrelated, unrelatedIntegration)
    writeFileSync(
      library,
      `${original}\npub fn unit_coverage_probe(value: bool) -> u8 { if value { 1 } else { 0 } }\n`,
    )
    writeFileSync(
      integration,
      '#[test]\nfn covers_only_in_integration() { assert_eq!(astral_index::unit_coverage_probe(true), 1); assert_eq!(astral_index::unit_coverage_probe(false), 0); }\n',
    )
    expectCommandSuccess('npm', ['run', 'test:backend-probe'])
    const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as LlvmCoverageExport
    const unit = read(`${coverage}/backend-unit/coverage.json`)
    const combined = read(`${coverage}/backend/coverage.json`)
    const metric = (report: LlvmCoverageExport) =>
      report.data[0].files.find((file) => file.filename.endsWith('/src/lib.rs'))!.summary.functions
    expect(metric(unit).covered).toBeLessThan(metric(unit).count)
    expect(metric(combined).covered).toBe(metric(combined).count)
    expectReportFailure('^backend unit coverage$', 'Uncovered')
  } finally {
    writeFileSync(library, original)
    unlinkSync(integration)
    unlinkSync(unrelated)
  }
}, 180000)

test('the unit-only report is mandatory and cannot be replaced by boundary coverage', () => {
  const path = `${coverage}/backend-unit/coverage.json`
  const backup = `${path}.probe-backup`
  const original = readFileSync(path, 'utf8')
  expect(existsSync(backup)).toBe(false)
  try {
    renameSync(path, backup)
    expectReportFailure('^backend unit coverage$', 'ENOENT')
    const incomplete = JSON.parse(original) as LlvmCoverageExport
    incomplete.data[0].files = []
    writeFileSync(path, JSON.stringify(incomplete))
    expectReportFailure('^backend unit coverage$', 'Missing coverage')
  } finally {
    if (existsSync(backup)) unlinkSync(backup)
    writeFileSync(path, original)
  }
}, 30000)

// Agents rely on the docs: a broken link or a doc nothing links to must fail the check.
test('the docs gate rejects a broken link and an unreachable doc', () => {
  const probe = 'docs/docs-probe.md'
  expect(existsSync(probe)).toBe(false)
  try {
    writeFileSync(probe, '# Probe\n\n[gone](missing-probe-target.md)\n')
    expectCommandFailure(
      'npm',
      ['run', 'docs:check'],
      'docs/docs-probe.md:3: missing-probe-target.md does not exist',
    )
    expectCommandFailure(
      'npm',
      ['run', 'docs:check'],
      'docs/docs-probe.md is not reachable by links from AGENTS.md',
    )
  } finally {
    unlinkSync(probe)
  }
}, 30000)

// The committed app icons must stay what the brand's emblems produce.
test('the icons gate rejects a changed icon and a missing one', () => {
  const [changed, missing] = ['src-tauri/icons/64x64.png', 'src-tauri/icons/icon.ico']
  const original = readFileSync(changed)
  try {
    writeFileSync(changed, Buffer.concat([original, Buffer.from('probe')]))
    renameSync(missing, `${missing}.probe`)
    expectCommandFailure('npm', ['run', 'icons:check'], "[ 'icon.ico', '64x64.png' ]")
  } finally {
    writeFileSync(changed, original)
    if (existsSync(`${missing}.probe`)) renameSync(`${missing}.probe`, missing)
  }
  expectCommandSuccess('npm', ['run', 'icons:check'])
}, 60000)

// Release tags carry the version (decision 0030), so no manifest may declare one.
test('the versions gate rejects a manifest that declares a version', () => {
  const manifest = 'src-ui/package.json'
  const original = readFileSync(manifest, 'utf8')
  try {
    writeFileSync(
      manifest,
      original.replace(
        '"name": "astral-index-ui",',
        '"name": "astral-index-ui",\n  "version": "9.9.9",',
      ),
    )
    expectCommandFailure(
      'npm',
      ['run', 'versions:check'],
      'src-ui/package.json declares version 9.9.9, not the 0.0.0 placeholder',
    )
  } finally {
    writeFileSync(manifest, original)
  }
  expectCommandSuccess('npm', ['run', 'versions:check'])
}, 30000)

// Every shipped component's licence must be accepted, or the build fails (decision 0025).
test('generating the notices rejects a licence outside the accepted list', () => {
  const settings = 'src-tauri/about.toml'
  const accepted = readFileSync(settings, 'utf8')
  try {
    writeFileSync(settings, accepted.replace('    "MIT",\n', ''))
    expectCommandFailure('npm', ['run', 'notices'], 'failed to satisfy license requirements')
  } finally {
    writeFileSync(settings, accepted)
  }
  expectCommandSuccess('npm', ['run', 'notices'])
}, 120000)

test('the wrapper exception guard rejects added startup behavior', () => {
  const path = 'src-tauri/src/main.rs'
  const original = readFileSync(path, 'utf8')
  try {
    writeFileSync(
      path,
      original.replace(
        'fn main() {',
        'fn main() {\n    println!("unexpected extra startup behavior");',
      ),
    )
    expectReportFailure('startup/build exceptions', 'startup/build exceptions')
  } finally {
    writeFileSync(path, original)
  }
}, 120000)

// Runs last: no probe may have touched what the gates wrote.
test('the probes leave the gates’ reports and results untouched', () => {
  expect({ coverage: contents('coverage'), results: contents('test-results') }).toEqual(gateOutputs)
})
