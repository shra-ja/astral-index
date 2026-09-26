import { globSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { assertCompleteCoverage, type FileCoverage } from '../coverage';

test('every first-party source file has fresh, complete coverage', () => {
  const sources = globSync(['src/**/*.ts', 'scripts/**/*.ts'], { exclude: ['src/tests/**', 'scripts/tests/**'] }).map(file => resolve(file));
  const rust = globSync(['src-tauri/src/**/*.rs', 'src-tauri/build.rs'], { exclude: ['src-tauri/src/**/tests/**'] }).map(file => resolve(file));
  const allExecutable = globSync('**/*.{ts,tsx,js,jsx,mjs,cjs,rs,sh,py}', {
    exclude: ['node_modules/**', 'src-tauri/target/**', 'src-tauri/gen/**', '.git/**', 'dist/**', 'coverage/**', 'tests/**', 'src/tests/**', 'scripts/tests/**', 'src-tauri/tests/**', 'src-tauri/src/**/tests/**'],
  }).map(file => resolve(file));
  expect([...sources, ...rust].sort(), 'New executable source must be included in instrumentation').toEqual(allExecutable.sort());

  const frontendPath = 'coverage/frontend/coverage-summary.json';
  const nativePath = 'coverage/native/coverage.json';
  const unitPath = 'coverage/native-unit/coverage.json';
  const wrappers = ['src-tauri/src/main.rs', 'src-tauri/build.rs'].map(file => resolve(file));
  const unitSources = rust.filter(file => !wrappers.includes(file));
  const frontend = JSON.parse(readFileSync(frontendPath, 'utf8'));
  assertCompleteCoverage(sources, frontend);
  for (const [reportPath, inventory] of [[unitPath, unitSources], [nativePath, wrappers]] as const) {
    const native = JSON.parse(readFileSync(reportPath, 'utf8'));
    expect(native.type).toBe('llvm.coverage.json.export');
    expect(native.data).toHaveLength(1);
    const rustReport: Record<string, FileCoverage> = {};
    for (const file of native.data[0].files) {
      const metrics = {} as FileCoverage;
      for (const [name, nativeName] of [
        ['lines', 'lines'], ['statements', 'regions'], ['functions', 'functions'], ['branches', 'branches'],
      ] as const) {
        metrics[name] = { total: file.summary[nativeName].count, covered: file.summary[nativeName].covered };
      }
      rustReport[resolve(file.filename)] = metrics;
    }
    assertCompleteCoverage(inventory, rustReport);
  }
  for (const [report, files] of [[frontendPath, sources], [unitPath, unitSources], [nativePath, wrappers]] as const) {
    for (const file of files) {
      expect(statSync(report).mtimeMs, `Stale report for ${file}`).toBeGreaterThanOrEqual(statSync(file).mtimeMs);
    }
  }
});

// These are the only unit-coverage exceptions. Any added logic requires an explicit review.
test('startup/build exceptions remain minimal third-party delegates', () => {
  expect(readFileSync('src-tauri/src/main.rs', 'utf8').trim()).toBe(`fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to run Roll Tracker");
}`);
  expect(readFileSync('src-tauri/build.rs', 'utf8').trim()).toBe(`fn main() {
    tauri_build::build();
}`);
});
