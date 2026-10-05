import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  globSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  renameSync,
  statSync,
  utimesSync,
} from 'node:fs'
import { afterAll, expect, test } from 'vitest'
import { refreshProbeCoverage } from '../tooling/backend-coverage'
import type { LlvmCoverageExport } from '../tooling/coverage'

// Per-probe finally blocks restore files; even failed assertions reach this full refresh.
afterAll(refreshProbeCoverage, 600000)

// Scoped probes carry this target; running the full integration suite fails them.
const unrelatedIntegration =
  '#[test] fn unrelated_must_not_run() { panic!("probe ran unrelated integration tests"); }\n'

/**
 * Run a command that must fail, naming `message` in its output. If it does not, save
 * what a rare failure can't show afterwards before asserting: the full output, the
 * machine's processes, load and memory, and Vitest's results caches, which order the
 * next run. Snapshots go to `test-results/probe-failures/`; passing runs write nothing.
 */
function expectCommandFailure(command: string, args: string[], message: string): void {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  const output = result.stdout + result.stderr
  if (result.status === 0 || !output.includes(message)) {
    const folder = `test-results/probe-failures/${new Date().toISOString().replace(/[:.]/g, '-')}`
    mkdirSync(folder, { recursive: true })
    const machine = (file: string, args: string[]) =>
      spawnSync(file, args, { encoding: 'utf8' }).stdout ?? ''
    writeFileSync(
      `${folder}/snapshot.log`,
      [
        `$ ${command} ${args.join(' ')}`,
        `exit ${result.status} signal ${result.signal}; expected a failure naming ${message}`,
        `load ${readFileSync('/proc/loadavg', 'utf8')}`,
        machine('free', ['-m']),
        machine('ps', ['-eo', 'pid,ppid,etime,pcpu,rss,args', '--sort=-pcpu']),
        output,
      ].join('\n'),
    )
    for (const cache of globSync('{,src-ui/}node_modules/.vite/vitest/*/results.json')) {
      copyFileSync(cache, `${folder}/${cache.replaceAll('/', '_')}`)
    }
  }
  expect(result.status).not.toBe(0)
  expect(output).toContain(message)
}

// Run one report check and require it to fail for the expected reason.
function expectReportFailure(name: string, message: string): void {
  expectCommandFailure(
    'npx',
    ['vitest', 'run', 'tests/coverage-reports.test.ts', '-t', name],
    message,
  )
}

test('the unit gate rejects stale evidence', () => {
  const path = 'coverage/backend-unit/coverage.json'
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
    execFileSync('npm', ['run', 'test:e2e-probe'], { stdio: 'pipe' })
    const report = JSON.parse(
      readFileSync('coverage/backend/coverage.json', 'utf8'),
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
  const path = 'coverage/frontend/coverage-summary.json'
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
}, 180000)

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
    execFileSync('npm', ['run', 'test:backend-probe'], { stdio: 'pipe' })
    const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as LlvmCoverageExport
    const unit = read('coverage/backend-unit/coverage.json')
    const combined = read('coverage/backend/coverage.json')
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
  const path = 'coverage/backend-unit/coverage.json'
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
