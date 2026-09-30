import { globSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { assertCompleteCoverage, type FileCoverage } from '../tooling/coverage';

// Vitest never measures config files, so each only delegates to a unit-tested module
// (`src-ui/build/vite.ts`, `src-ui/build/eslint.ts`, `tooling/vitest-config.ts`,
// `tooling/eslint-config.ts`); the guard below pins them.
const configDelegates = ['src-ui/vite.config.ts', 'src-ui/eslint.config.ts', 'vitest.config.ts', 'eslint.config.ts']
  .map(file => resolve(file));

// Unit tests sit beside their source as `*.test.ts`; the rest live in test folders.
const testFiles = ['**/*.test.ts', 'src-ui/tests/**', 'tests/**'];

// The frontend and the repository tooling each have their own Vitest run and report.
const typeScriptReports = [
  ['frontend coverage', 'coverage/frontend/coverage-summary.json', ['src-ui/src/**/*.{ts,vue}', 'src-ui/build/**/*.ts']],
  ['tooling coverage', 'coverage/tooling/coverage-summary.json', ['tooling/**/*.ts']],
] as const;

function sources(globs: readonly string[]): string[] {
  return globSync([...globs], { exclude: [...testFiles, '**/*.d.ts'] }).map(file => resolve(file));
}

test('every executable source is inventoried', () => {
  const typeScript = typeScriptReports.flatMap(([, , globs]) => sources(globs));
  const rust = globSync(['src-tauri/src/**/*.rs', 'src-tauri/build.rs'], { exclude: ['src-tauri/src/**/tests/**'] }).map(file => resolve(file));
  // Declaration files (`*.d.ts`) hold types only and compile to nothing.
  const allExecutable = globSync('**/*.{ts,tsx,vue,js,jsx,mjs,cjs,rs,sh,py}', {
    exclude: [...testFiles, '**/*.d.ts', '**/node_modules/**', 'src-tauri/target/**', 'src-tauri/gen/**', '.git/**', 'src-ui/dist/**', 'coverage/**', 'src-tauri/tests/**', 'src-tauri/src/**/tests/**'],
  }).map(file => resolve(file));
  expect([...typeScript, ...configDelegates, ...rust].sort(), 'New executable source must be included in instrumentation').toEqual(allExecutable.sort());

});

const wrappers = ['src-tauri/src/main.rs', 'src-tauri/build.rs'].map(file => resolve(file));

function assertFresh(report: string, files: string[]): void {
  for (const file of files) {
    expect(statSync(report).mtimeMs, `Stale report for ${file}`).toBeGreaterThanOrEqual(statSync(file).mtimeMs);
  }
}

for (const [name, report, globs] of typeScriptReports) {
  test(name, () => {
    const inventory = sources(globs);
    assertCompleteCoverage(inventory, JSON.parse(readFileSync(report, 'utf8')));
    assertFresh(report, inventory);
  });
}

for (const [name, reportPath, boundary] of [
  ['backend unit coverage', 'coverage/backend-unit/coverage.json', false],
  ['backend wrapper coverage', 'coverage/backend/coverage.json', true],
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
  // Vitest excludes config files from coverage; the configurations themselves are unit-tested.
  expect(readFileSync('src-ui/vite.config.ts', 'utf8').trim()).toBe(`import { defineConfig } from 'vitest/config';
import { viteConfig } from './build/vite.ts';

export default defineConfig(() => viteConfig(process.env));`);
  expect(readFileSync('vitest.config.ts', 'utf8').trim()).toBe(`import { defineConfig } from 'vitest/config';
import { vitestConfig } from './tooling/vitest-config.ts';

export default defineConfig(vitestConfig());`);
  expect(readFileSync('src-ui/eslint.config.ts', 'utf8').trim()).toBe(`import { eslintConfig } from './build/eslint.ts'

export default eslintConfig()`);
  expect(readFileSync('eslint.config.ts', 'utf8').trim()).toBe(`import { eslintConfig } from './tooling/eslint-config.ts'

export default eslintConfig()`);
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
