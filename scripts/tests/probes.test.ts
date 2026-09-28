import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, renameSync, statSync, utimesSync } from 'node:fs';
import { afterAll, expect, test } from 'vitest';
import { refreshProbeCoverage } from '../native-coverage';

// Per-probe finally blocks restore files; even failed assertions reach this full refresh.
afterAll(refreshProbeCoverage, 600000);

// Scoped probes carry this target; running the full integration suite fails them.
const unrelatedIntegration = '#[test] fn unrelated_must_not_run() { panic!("probe ran unrelated integration tests"); }\n';

// Run one report check and require it to fail for the expected reason.
function expectReportFailure(name: string, message: string): void {
  const result = spawnSync('npx', ['vitest', 'run', 'scripts/tests/reports.test.ts', '-t', name], { encoding: 'utf8' });
  expect(result.status).not.toBe(0);
  expect(result.stdout + result.stderr).toContain(message);
}

test('the unit gate rejects stale evidence', () => {
  const path = 'coverage/native-unit/coverage.json';
  const original = statSync(path);
  try {
    utimesSync(path, original.atime, new Date(0));
    expectReportFailure('^backend unit coverage$', 'Stale report');
  } finally {
    utimesSync(path, original.atime, original.mtime);
  }
}, 30000);

test('the real coverage command rejects an unexecuted file and branch', () => {
  const probe = 'src/coverage-probe.ts';
  expect(existsSync(probe)).toBe(false);
  try {
    writeFileSync(probe, 'export const probe = (value: boolean) => value ? 1 : 0;\n');
    const result = spawnSync('npm', ['run', 'coverage:json'], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('coverage-probe.ts');
  } finally {
    unlinkSync(probe);
  }
}, 30000);

test('Rust instrumentation detects an uncovered branch and inventory rejects an uncompiled source', () => {
  const main = 'src-tauri/src/main.rs';
  const original = readFileSync(main, 'utf8');
  const orphan = 'src-tauri/src/coverage_probe.rs';
  expect(existsSync(orphan)).toBe(false);
  const unrelated = 'src-tauri/tests/unrelated_native_probe.rs';
  expect(existsSync(unrelated)).toBe(false);
  try {
    writeFileSync(unrelated, unrelatedIntegration);
    writeFileSync(main, original.replace('fn main() {', 'fn main() {\n    let _probe = if std::env::var_os("ROLL_TRACKER_UNSET_COVERAGE_PROBE").is_some() { 1 } else { 0 };'));
    execFileSync('npm', ['run', 'test:native-probe'], { stdio: 'pipe' });
    const report = JSON.parse(readFileSync('coverage/native/coverage.json', 'utf8'));
    const summary = report.data[0].files.find((file: { filename: string }) => file.filename.endsWith('/src/main.rs')).summary;
    expect(summary.branches.count).toBeGreaterThan(summary.branches.covered);
    expectReportFailure('^native wrapper coverage$', 'Uncovered');
  } finally {
    unlinkSync(unrelated);
    writeFileSync(main, original);
  }
  try {
    writeFileSync(orphan, 'pub fn uncompiled() {}\n');
    expectReportFailure('^backend unit coverage$', 'Missing coverage');
  } finally {
    unlinkSync(orphan);
  }
}, 180000);

test('the report gate fails closed when a required report is missing or incomplete', () => {
  const path = 'coverage/frontend/coverage-summary.json';
  const backup = `${path}.probe-backup`;
  expect(existsSync(backup)).toBe(false);
  const original = readFileSync(path, 'utf8');
  renameSync(path, backup);
  try {
    expectReportFailure('^frontend and tooling coverage$', 'ENOENT');
    writeFileSync(path, '{}');
    expectReportFailure('^frontend and tooling coverage$', 'Missing coverage');
  } finally {
    writeFileSync(path, original);
    unlinkSync(backup);
  }
}, 30000);

// Exercise the public commands so adding a suite cannot silently bypass either gate.
test('test and coverage commands discover additional frontend and tooling suites', () => {
  const paths = ['src/tests/discovery-probe.test.ts', 'scripts/tests/unit/discovery-probe.test.ts'];
  for (const path of paths) expect(existsSync(path)).toBe(false);
  try {
    for (const path of paths) {
      writeFileSync(path, `import { test, expect } from 'vitest';\ntest('${path}', () => expect('discovery probe').toBe('must fail'));\n`);
    }
    for (const command of ['test', 'coverage:json']) {
      const result = spawnSync('npm', ['run', command], { encoding: 'utf8' });
      expect(result.status).not.toBe(0);
      for (const path of paths) expect(result.stdout + result.stderr).toContain(path);
    }
  } finally {
    for (const path of paths) unlinkSync(path);
  }
}, 30000);

// A network failure alone must not satisfy the native CSP assertion.
test('the native CSP test rejects a permissive connection policy', () => {
  const path = 'src-tauri/tauri.conf.json';
  const original = readFileSync(path, 'utf8');
  const policy = 'connect-src ipc: http://ipc.localhost';
  expect(original).toContain(policy);
  const unrelated = 'src-tauri/tests/unrelated_native_probe.rs';
  expect(existsSync(unrelated)).toBe(false);
  try {
    writeFileSync(unrelated, unrelatedIntegration);
    writeFileSync(path, original.replace(policy, 'connect-src *'));
    const result = spawnSync('npm', ['run', 'test:native-probe'], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('CSP must block webview connections');
  } finally {
    unlinkSync(unrelated);
    writeFileSync(path, original);
  }
}, 180000);

// Integration execution must never fill a unit-test coverage gap.
test('backend coverage requires unit execution even when integration tests cover the code', () => {
  const library = 'src-tauri/src/lib.rs';
  const integration = 'src-tauri/tests/unit_coverage_probe.rs';
  const unrelated = 'src-tauri/tests/unrelated_scope_probe.rs';
  const original = readFileSync(library, 'utf8');
  expect(existsSync(unrelated)).toBe(false);
  expect(existsSync(integration)).toBe(false);
  try {
    writeFileSync(unrelated, unrelatedIntegration);
    writeFileSync(library, `${original}\npub fn unit_coverage_probe(value: bool) -> u8 { if value { 1 } else { 0 } }\n`);
    writeFileSync(integration, '#[test]\nfn covers_only_in_integration() { assert_eq!(roll_tracker::unit_coverage_probe(true), 1); assert_eq!(roll_tracker::unit_coverage_probe(false), 0); }\n');
    execFileSync('npm', ['run', 'test:backend-probe'], { stdio: 'pipe' });
    const unit = JSON.parse(readFileSync('coverage/native-unit/coverage.json', 'utf8'));
    const combined = JSON.parse(readFileSync('coverage/native/coverage.json', 'utf8'));
    const metric = (report: typeof unit) => report.data[0].files.find((file: { filename: string }) => file.filename.endsWith('/src/lib.rs')).summary.functions;
    expect(metric(unit).covered).toBeLessThan(metric(unit).count);
    expect(metric(combined).covered).toBe(metric(combined).count);
    expectReportFailure('^backend unit coverage$', 'Uncovered');
  } finally {
    writeFileSync(library, original);
    unlinkSync(integration);
    unlinkSync(unrelated);
  }
}, 180000);

test('the unit-only report is mandatory and cannot be replaced by boundary coverage', () => {
  const path = 'coverage/native-unit/coverage.json';
  const backup = `${path}.probe-backup`;
  const original = readFileSync(path, 'utf8');
  expect(existsSync(backup)).toBe(false);
  try {
    renameSync(path, backup);
    expectReportFailure('^backend unit coverage$', 'ENOENT');
    const incomplete = JSON.parse(original);
    incomplete.data[0].files = [];
    writeFileSync(path, JSON.stringify(incomplete));
    expectReportFailure('^backend unit coverage$', 'Missing coverage');
  } finally {
    if (existsSync(backup)) unlinkSync(backup);
    writeFileSync(path, original);
  }
}, 30000);

test('the wrapper exception guard rejects added startup behavior', () => {
  const path = 'src-tauri/src/main.rs';
  const original = readFileSync(path, 'utf8');
  try {
    writeFileSync(path, original.replace('fn main() {', 'fn main() {\n    println!("unexpected extra startup behavior");'));
    expectReportFailure('startup/build exceptions', 'startup/build exceptions');
  } finally {
    writeFileSync(path, original);
  }
}, 120000);
