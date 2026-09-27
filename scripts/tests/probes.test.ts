import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, renameSync } from 'node:fs';
import { expect, test } from 'vitest';

test('the real coverage command rejects an unexecuted file and branch', () => {
  const probe = 'src/coverage-probe.ts';
  expect(existsSync(probe)).toBe(false);
  try {
    writeFileSync(probe, 'export const probe = (value: boolean) => value ? 1 : 0;\n');
    const result = spawnSync('npm', ['run', 'coverage'], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('coverage-probe.ts');
  } finally {
    unlinkSync(probe);
    // Restore fresh coverage for the actual source tree, never reuse probe results.
    execFileSync('npm', ['run', 'coverage'], { stdio: 'inherit' });
  }
}, 30000);

test('Rust instrumentation detects an uncovered branch and inventory rejects an uncompiled source', () => {
  const main = 'src-tauri/src/main.rs';
  const original = readFileSync(main, 'utf8');
  const orphan = 'src-tauri/src/coverage_probe.rs';
  expect(existsSync(orphan)).toBe(false);
  try {
    writeFileSync(main, original.replace('fn main() {', 'fn main() {\n    let _probe = if std::env::var_os("ROLL_TRACKER_UNSET_COVERAGE_PROBE").is_some() { 1 } else { 0 };'));
    execFileSync('npm', ['run', 'test:offline'], { stdio: 'pipe' });
    const report = JSON.parse(readFileSync('coverage/native/coverage.json', 'utf8'));
    const summary = report.data[0].files.find((file: { filename: string }) => file.filename.endsWith('/src/main.rs')).summary;
    expect(summary.branches.count).toBeGreaterThan(summary.branches.covered);
    const missedBranch = spawnSync('npm', ['run', 'coverage:verify'], { encoding: 'utf8' });
    expect(missedBranch.status).not.toBe(0);
    expect(missedBranch.stdout + missedBranch.stderr).toContain('Uncovered');
  } finally {
    writeFileSync(main, original);
    execFileSync('npm', ['run', 'test:offline'], { stdio: 'pipe' });
  }
  try {
    writeFileSync(orphan, 'pub fn uncompiled() {}\n');
    const missingFile = spawnSync('npm', ['run', 'coverage:verify'], { encoding: 'utf8' });
    expect(missingFile.status).not.toBe(0);
    expect(missingFile.stdout + missingFile.stderr).toContain('Missing coverage');
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
    const missing = spawnSync('npm', ['run', 'coverage:verify'], { encoding: 'utf8' });
    expect(missing.status).not.toBe(0);
    expect(missing.stdout + missing.stderr).toContain('ENOENT');
    writeFileSync(path, '{}');
    const incomplete = spawnSync('npm', ['run', 'coverage:verify'], { encoding: 'utf8' });
    expect(incomplete.status).not.toBe(0);
    expect(incomplete.stdout + incomplete.stderr).toContain('Missing coverage');
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
    for (const command of ['test', 'coverage']) {
      const result = spawnSync('npm', ['run', command], { encoding: 'utf8' });
      expect(result.status).not.toBe(0);
      for (const path of paths) expect(result.stdout + result.stderr).toContain(path);
    }
  } finally {
    for (const path of paths) unlinkSync(path);
    execFileSync('npm', ['run', 'coverage'], { stdio: 'inherit' });
  }
}, 30000);

// A network failure alone must not satisfy the native CSP assertion.
test('the native CSP test rejects a permissive connection policy', () => {
  const path = 'src-tauri/tauri.conf.json';
  const original = readFileSync(path, 'utf8');
  const policy = 'connect-src ipc: http://ipc.localhost';
  expect(original).toContain(policy);
  try {
    writeFileSync(path, original.replace(policy, 'connect-src *'));
    const result = spawnSync('npm', ['run', 'test:offline'], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('CSP must block webview connections');
  } finally {
    writeFileSync(path, original);
    execFileSync('npm', ['run', 'test:offline'], { stdio: 'pipe' });
  }
}, 180000);

// Integration execution must never fill a unit-test coverage gap.
test('backend coverage requires unit execution even when integration tests cover the code', () => {
  const library = 'src-tauri/src/lib.rs';
  const integration = 'src-tauri/tests/unit_coverage_probe.rs';
  const original = readFileSync(library, 'utf8');
  expect(existsSync(integration)).toBe(false);
  try {
    writeFileSync(library, `${original}\npub fn unit_coverage_probe(value: bool) -> u8 { if value { 1 } else { 0 } }\n`);
    writeFileSync(integration, '#[test]\nfn covers_only_in_integration() { assert_eq!(roll_tracker::unit_coverage_probe(true), 1); assert_eq!(roll_tracker::unit_coverage_probe(false), 0); }\n');
    execFileSync('npm', ['run', 'test:offline'], { stdio: 'pipe' });
    const unit = JSON.parse(readFileSync('coverage/native-unit/coverage.json', 'utf8'));
    const combined = JSON.parse(readFileSync('coverage/native/coverage.json', 'utf8'));
    const metric = (report: typeof unit) => report.data[0].files.find((file: { filename: string }) => file.filename.endsWith('/src/lib.rs')).summary.functions;
    expect(metric(unit).covered).toBeLessThan(metric(unit).count);
    expect(metric(combined).covered).toBe(metric(combined).count);
    const result = spawnSync('npm', ['run', 'coverage:verify'], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('Uncovered');
  } finally {
    writeFileSync(library, original);
    unlinkSync(integration);
    execFileSync('npm', ['run', 'test:offline'], { stdio: 'pipe' });
  }
}, 180000);

test('the unit-only report is mandatory and cannot be replaced by boundary coverage', () => {
  const path = 'coverage/native-unit/coverage.json';
  const backup = `${path}.probe-backup`;
  const original = readFileSync(path, 'utf8');
  expect(existsSync(backup)).toBe(false);
  try {
    renameSync(path, backup);
    const missing = spawnSync('npm', ['run', 'coverage:verify'], { encoding: 'utf8' });
    expect(missing.status).not.toBe(0);
    expect(missing.stdout + missing.stderr).toContain('ENOENT');
    const incomplete = JSON.parse(original);
    incomplete.data[0].files = [];
    writeFileSync(path, JSON.stringify(incomplete));
    const result = spawnSync('npm', ['run', 'coverage:verify'], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('Missing coverage');
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
    const result = spawnSync('npx', ['vitest', 'run', 'scripts/tests/reports.test.ts', '-t', 'startup/build exceptions'], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('startup/build exceptions');
  } finally {
    writeFileSync(path, original);
    // Refresh the boundary report after restoring the source timestamp.
    execFileSync('npm', ['run', 'test:offline'], { stdio: 'pipe' });
  }
}, 120000);
