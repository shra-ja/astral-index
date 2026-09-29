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

  // v2.9.2 is the first release that keeps hyphenated crates under Cargo's new build-dir layout.
  const rust = steps.find(step => step.includes('uses: Swatinem/rust-cache@6323deb102c322ba6fcbdcafc7e3dddab59af2b6 # v2.9.2'));
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

test('the Rust cache targets the asdf toolchain where Cargo installs tools and registry sources', () => {
  // asdf keeps Cargo's home inside the toolchain; the cache otherwise saves an unused ~/.cargo.
  const home = steps.find(step => step.includes('echo "CARGO_HOME=$(asdf where rust)" >> "$GITHUB_ENV"'));
  expect(home).toBeDefined();
  expect(workflow.indexOf('asdf-vm/actions/install@')).toBeLessThan(workflow.indexOf('CARGO_HOME=$(asdf where rust)'));
  expect(workflow.indexOf('CARGO_HOME=$(asdf where rust)')).toBeLessThan(workflow.indexOf('Swatinem/rust-cache@'));
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
