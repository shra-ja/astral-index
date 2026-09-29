import { globSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { assertCompleteCoverage, type FileCoverage } from '../coverage';

// Vitest never measures its own config file, so `vite.config.ts` only delegates to the
// unit-tested `scripts/vite-config.ts`; the guard below pins its source.
const configDelegate = resolve('vite.config.ts');

function frontendSources(): string[] {
  return globSync(['src/**/*.{ts,vue}', 'scripts/**/*.ts'], {
    exclude: ['src/tests/**', 'scripts/tests/**', '**/*.d.ts'],
  }).map(file => resolve(file));
}

test('every executable source is inventoried', () => {
  const sources = frontendSources();
  const rust = globSync(['src-tauri/src/**/*.rs', 'src-tauri/build.rs'], { exclude: ['src-tauri/src/**/tests/**'] }).map(file => resolve(file));
  // Declaration files (`*.d.ts`) hold types only and compile to nothing.
  const allExecutable = globSync('**/*.{ts,tsx,vue,js,jsx,mjs,cjs,rs,sh,py}', {
    exclude: ['**/*.d.ts', 'node_modules/**', 'src-tauri/target/**', 'src-tauri/gen/**', '.git/**', 'dist/**', 'coverage/**', 'tests/**', 'src/tests/**', 'scripts/tests/**', 'src-tauri/tests/**', 'src-tauri/src/**/tests/**'],
  }).map(file => resolve(file));
  expect([...sources, configDelegate, ...rust].sort(), 'New executable source must be included in instrumentation').toEqual(allExecutable.sort());

});

const wrappers = ['src-tauri/src/main.rs', 'src-tauri/build.rs'].map(file => resolve(file));

function assertFresh(report: string, files: string[]): void {
  for (const file of files) {
    expect(statSync(report).mtimeMs, `Stale report for ${file}`).toBeGreaterThanOrEqual(statSync(file).mtimeMs);
  }
}

test('frontend and tooling coverage', () => {
  const sources = frontendSources();
  const report = 'coverage/frontend/coverage-summary.json';
  assertCompleteCoverage(sources, JSON.parse(readFileSync(report, 'utf8')));
  assertFresh(report, sources);
});

for (const [name, reportPath, boundary] of [
  ['backend unit coverage', 'coverage/native-unit/coverage.json', false],
  ['native wrapper coverage', 'coverage/native/coverage.json', true],
] as const) {
  test(name, () => {
    const rust = globSync(['src-tauri/src/**/*.rs', 'src-tauri/build.rs'], { exclude: ['src-tauri/src/**/tests/**'] }).map(file => resolve(file));
    const inventory = boundary ? wrappers : rust.filter(file => !wrappers.includes(file));
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
    assertFresh(reportPath, inventory);
  });
}

// These are the only unit-coverage exceptions. Any added logic requires an explicit review.
test('startup/build exceptions remain minimal third-party delegates', () => {
  // Vitest excludes its config file from coverage; the configuration itself is unit-tested.
  expect(readFileSync(configDelegate, 'utf8').trim()).toBe(`import { defineConfig } from 'vitest/config';
import { viteConfig } from './scripts/vite-config';

export default defineConfig(() => viteConfig(process.env));`);
  // Registration and the command list live in unit-tested library code; these only delegate.
  // The attribute only selects the Windows GUI subsystem for release builds; no code runs.
  expect(readFileSync('src-tauri/src/main.rs', 'utf8').trim()).toBe(`#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    roll_tracker::desktop::register(tauri::Builder::default())
        .run(tauri::generate_context!())
        .expect("failed to run Roll Tracker");
}`);
  expect(readFileSync('src-tauri/build.rs', 'utf8').trim()).toBe(`fn main() {
    let commands = tauri_build::AppManifest::new().commands(include!("src/desktop/commands.in"));
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(commands))
        .expect("failed to build Roll Tracker");
}`);
});
