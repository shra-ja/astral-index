import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const workflow = readFileSync('.github/workflows/check.yml', 'utf8')
const steps = workflow.split(/^ {6}- /m).slice(1)

test('CI caches reusable dependencies with toolchain and lockfile invalidation', () => {
  const npm = steps.find((step) => step.includes('uses: actions/cache@'))
  expect(npm).toBeDefined()
  expect(npm).toContain('path: ~/.npm/_cacache')
  expect(npm).toContain('runner.os')
  expect(npm).toContain('runner.arch')
  expect(npm).toContain("hashFiles('.tool-versions', 'package-lock.json')")

  // v2.9.2 is the first release that keeps hyphenated crates under Cargo's new build-dir layout.
  const rust = steps.find((step) =>
    step.includes('uses: Swatinem/rust-cache@6323deb102c322ba6fcbdcafc7e3dddab59af2b6 # v2.9.2'),
  )
  expect(rust).toBeDefined()
  expect(rust).toContain('workspaces: src-tauri -> target')
  expect(rust).toContain('cache-bin: true')
  // Tool versions live in the workflow; changing them must invalidate this cache.
  expect(rust).toContain("hashFiles('.tool-versions', '.github/workflows/check.yml')")
  expect(rust).toContain('cache-workspace-crates: false')
  expect(rust).not.toContain('cache-directories:')
  expect(workflow.indexOf('asdf-vm/actions/install@')).toBeLessThan(
    workflow.indexOf('Swatinem/rust-cache@'),
  )
  expect(workflow.indexOf('Swatinem/rust-cache@')).toBeLessThan(workflow.indexOf('cargo install'))
})

test('the Rust cache targets the asdf toolchain where Cargo installs tools and registry sources', () => {
  // asdf keeps Cargo's home inside the toolchain; the cache otherwise saves an unused ~/.cargo.
  const home = steps.find((step) =>
    step.includes('echo "CARGO_HOME=$(asdf where rust)" >> "$GITHUB_ENV"'),
  )
  expect(home).toBeDefined()
  expect(workflow.indexOf('asdf-vm/actions/install@')).toBeLessThan(
    workflow.indexOf('CARGO_HOME=$(asdf where rust)'),
  )
  expect(workflow.indexOf('CARGO_HOME=$(asdf where rust)')).toBeLessThan(
    workflow.indexOf('Swatinem/rust-cache@'),
  )
})

test('cache hits cannot bypass locked installs, fresh coverage gates or the release build', () => {
  for (const command of [
    'cargo install cargo-llvm-cov --version 0.9.1 --locked',
    'cargo install tauri-driver --version 2.0.6 --locked',
    'cargo install cargo-about --version 0.9.2 --locked --features cli',
    'npm ci --ignore-scripts',
    'cargo fetch --manifest-path src-tauri/Cargo.toml --locked',
    'npm run check',
    'npm run tauri -- build --no-bundle',
  ]) {
    const step = steps.find((candidate) => candidate.includes(command))
    expect(step, command).toBeDefined()
    expect(step).not.toMatch(/^\s+if:/m)
  }
  expect(workflow).not.toContain('cache-hit')
})

test('a Windows job runs the Rust unit tests and keeps this repository’s release builds', () => {
  // The first release ships for Windows only (decision 0027).
  const start = workflow.indexOf('\n  windows:\n')
  expect(start).toBeGreaterThan(0)
  const job = workflow.slice(start)
  const jobSteps = job.split(/^ {6}- /m).slice(1)
  expect(job).toContain('runs-on: windows-2025')
  // npm would otherwise run the package scripts through cmd.exe.
  expect(job).toContain('npm_config_script_shell: C:\\Program Files\\Git\\bin\\bash.exe')
  // The versions come from .tool-versions, as asdf reads them on Linux.
  expect(job).toContain('node-version-file: .tool-versions')
  expect(job).toContain(`awk '$1 == "rust" { print $2 }' .tool-versions`)
  const rust = jobSteps.find((step) => step.includes('uses: Swatinem/rust-cache@'))
  expect(rust).toContain(
    "key: windows-2025-${{ hashFiles('.tool-versions', '.github/workflows/check.yml') }}",
  )
  for (const command of [
    'cargo install cargo-about --version 0.9.2 --locked --features cli',
    'npm ci --ignore-scripts',
    'cargo fetch --manifest-path src-tauri/Cargo.toml --locked',
    'cargo test --manifest-path src-tauri/Cargo.toml --lib --locked',
    'npm run tauri -- build --no-bundle',
  ]) {
    const step = jobSteps.find((candidate) => candidate.includes(command))
    expect(step, command).toBeDefined()
    expect(step).not.toMatch(/^\s+if:/m)
  }
  // The unit tests embed the built frontend, which the release build makes first.
  expect(job.indexOf('npm run tauri -- build --no-bundle')).toBeLessThan(
    job.indexOf('cargo test --manifest-path src-tauri/Cargo.toml --lib --locked'),
  )
  // Only this repository's builds are kept, for 30 days, named as unsigned builds.
  const upload = jobSteps.find((step) => step.includes('uses: actions/upload-artifact@'))
  expect(upload).toContain(
    "if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository",
  )
  expect(upload).toContain(
    'name: astral-index-dev-build-unsigned-${{ github.event.pull_request.head.sha || github.sha }}',
  )
  expect(upload).toContain('path: src-tauri/target/release/astral-index.exe')
  expect(upload).toContain('retention-days: 30')
  expect(upload).toContain('if-no-files-found: error')
})
