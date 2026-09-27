import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const workflow = readFileSync('.github/workflows/check.yml', 'utf8');
const steps = workflow.split(/^      - /m).slice(1);

test('CI caches reusable dependencies with toolchain and lockfile invalidation', () => {
  const npm = steps.find(step => step.includes('uses: actions/cache@'));
  expect(npm).toBeDefined();
  expect(npm).toContain('path: ~/.npm/_cacache');
  expect(npm).toContain('runner.os');
  expect(npm).toContain('runner.arch');
  expect(npm).toContain("hashFiles('.tool-versions', 'package-lock.json')");

  const rust = steps.find(step => step.includes('uses: Swatinem/rust-cache@'));
  expect(rust).toBeDefined();
  expect(rust).toContain('workspaces: src-tauri -> target');
  expect(rust).toContain('cache-bin: true');
  // Tool versions live in the workflow; changing them must invalidate this cache.
  expect(rust).toContain("hashFiles('.tool-versions', '.github/workflows/check.yml')");
  expect(rust).toContain('cache-workspace-crates: false');
  expect(rust).not.toContain('cache-directories:');
  expect(workflow.indexOf('asdf-vm/actions/install@')).toBeLessThan(workflow.indexOf('Swatinem/rust-cache@'));
  expect(workflow.indexOf('Swatinem/rust-cache@')).toBeLessThan(workflow.indexOf('cargo install'));
});

test('cache hits cannot bypass locked installs, fresh coverage gates or the release build', () => {
  for (const command of [
    'cargo install cargo-llvm-cov --version 0.9.1 --locked',
    'cargo install tauri-driver --version 2.0.6 --locked',
    'npm ci --ignore-scripts',
    'cargo fetch --manifest-path src-tauri/Cargo.toml --locked',
    'npm run check',
    'npm run tauri -- build --no-bundle',
  ]) {
    const step = steps.find(candidate => candidate.includes(command));
    expect(step, command).toBeDefined();
    expect(step).not.toMatch(/^\s+if:/m);
  }
  expect(workflow).not.toContain('cache-hit');
});
