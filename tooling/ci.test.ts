import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')
const workflow = read('.github/workflows/check.yml')
const linuxSetup = read('.github/actions/setup-linux/action.yml')
const windowsSetup = read('.github/actions/setup-windows/action.yml')
const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts

/** A job's block in the workflow, from its key to the next job's. */
function job(name: string) {
  const start = workflow.indexOf(`\n  ${name}:\n`)
  expect(start, name).toBeGreaterThan(0)
  const next = workflow.slice(start + 1).search(/\n {2}[a-z-]+:\n/)
  return next < 0 ? workflow.slice(start) : workflow.slice(start, start + 1 + next)
}
/** The steps of a workflow job or a composite action, split at their list items. */
const stepsOf = (text: string) => text.split(/^ {4,6}- /m).slice(1)
const step = (text: string, needle: string) => stepsOf(text).find((each) => each.includes(needle))

test('checks run on pull requests and pushes to main, with no merge queue', () => {
  expect(workflow).toMatch(/^on:\n {2}pull_request:\n {2}push:\n {4}branches: \[main\]\n/m)
  expect(workflow).not.toContain('merge_group')
})

test('the full check runs the static checks, then the gates, then the isolated probes', () => {
  // Unit tests and coverage fail fastest; the probes write to their own folder.
  expect(scripts.check).toBe('npm run check:static && npm run check:gates && npm run check:probes')
  expect(scripts['check:static']).toBe(
    [
      'npm run format:check',
      'npm run lint:check',
      'npm run docs:check',
      'npm run icons:check',
      'npm run versions:check',
      // Clippy compiles the unit tests, which embed the bundled frontend.
      'npm run build --workspace src-ui',
      'cargo fmt --manifest-path src-tauri/Cargo.toml --check',
      'cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets --all-features -- -D warnings',
    ].join(' && '),
  )
  // The probes need the bundled frontend, and make their own baseline reports.
  expect(scripts['check:probes']).toBe('npm run build && npm run test:probes')
  expect(scripts['test:probes']).toBe('vitest run tests/mutation-probes.test.ts')
  expect(scripts['check:gates']).toBe(
    'npm run build && npm run coverage && npm run test:offline && npm run coverage:verify',
  )
})

test('CI runs each part of the full check as its own Linux job, so none is skipped', () => {
  for (const [name, part] of [
    ['static', 'check:static'],
    ['gates', 'check:gates'],
    ['probes', 'check:probes'],
  ]) {
    const run = step(job(name), `run: npm run ${part}`)
    expect(run, part).toBeDefined()
    expect(run).not.toMatch(/^\s+if:/m)
    expect(job(name)).toContain('runs-on: ubuntu-24.04')
    expect(workflow.split(`npm run ${part}`)).toHaveLength(2)
  }
  // The gates job's reports and screenshots are kept, even when a gate fails.
  const reports = step(job('gates'), 'uses: actions/upload-artifact@')
  expect(reports).toContain('if: always()')
  expect(reports).toContain('name: coverage-and-native-smoke')
  expect(reports).toContain('if-no-files-found: error')
  // A failed probe keeps its snapshot.
  const snapshots = step(job('probes'), 'uses: actions/upload-artifact@')
  expect(snapshots).toContain('if: failure()')
  expect(snapshots).toContain('path: test-results/probe-failures/')
})

test('the gates and probes share one instrumented Rust cache; the static checks keep their own', () => {
  expect(step(job('static'), 'uses: ./.github/actions/setup-linux')).toContain('rust-cache: static')
  for (const name of ['gates', 'probes']) {
    const setup = step(job(name), 'uses: ./.github/actions/setup-linux')
    expect(setup).toContain('rust-cache: instrumented')
    expect(setup).toContain('native-tests: true')
  }
})

test('only main saves caches, which pull requests restore, keyed by toolchain and lockfiles', () => {
  // v2.9.2 is the first release that keeps hyphenated crates under Cargo's new build-dir layout.
  for (const setup of [linuxSetup, windowsSetup]) {
    const rust = step(setup, 'uses: Swatinem/rust-cache@6323deb102c322ba6fcbdcafc7e3dddab59af2b6')
    expect(rust).toBeDefined()
    expect(rust).toContain('workspaces: src-tauri -> target')
    expect(rust).toContain('cache-bin: true')
    expect(rust).toContain('cache-workspace-crates: false')
    expect(rust).toContain("save-if: ${{ github.ref == 'refs/heads/main' }}")
  }
  // Tool versions live in the setup actions; changing them must invalidate the cache.
  expect(step(linuxSetup, 'uses: Swatinem/rust-cache@')).toContain(
    "key: ${{ hashFiles('.tool-versions', '.github/actions/setup-linux/action.yml') }}",
  )
  expect(step(windowsSetup, 'uses: Swatinem/rust-cache@')).toContain(
    "key: ${{ hashFiles('.tool-versions', '.github/actions/setup-windows/action.yml') }}",
  )
  const restore = step(linuxSetup, 'uses: actions/cache/restore@')
  expect(restore).toContain('path: ~/.npm/_cacache')
  expect(restore).toContain("hashFiles('.tool-versions', 'package-lock.json')")
  const save = step(linuxSetup, 'uses: actions/cache/save@')
  expect(save).toContain("if: inputs.save-npm-cache == 'true' && github.ref == 'refs/heads/main'")
  expect(step(job('static'), 'uses: ./.github/actions/setup-linux')).toContain(
    'save-npm-cache: true',
  )
  // A cache hit never skips an install or a check.
  for (const text of [workflow, linuxSetup, windowsSetup]) expect(text).not.toContain('cache-hit')
})

test('the Rust cache follows the asdf toolchain, where Cargo installs tools and registry sources', () => {
  // asdf keeps Cargo's home inside the toolchain; the cache otherwise saves an unused ~/.cargo.
  const order = [
    'asdf-vm/actions/install@',
    'echo "CARGO_HOME=$(asdf where rust)" >> "$GITHUB_ENV"',
    'Swatinem/rust-cache@',
    'taiki-e/install-action@',
    'cargo install tauri-driver',
  ].map((needle) => linuxSetup.indexOf(needle))
  expect(order.every((index) => index >= 0)).toBe(true)
  expect(order).toEqual(order.toSorted((a, b) => a - b))
})

test('tools install at pinned versions, prebuilt where checksummed releases exist', () => {
  const prebuilt = step(linuxSetup, 'uses: taiki-e/install-action@')
  expect(prebuilt).toContain('tool: cargo-llvm-cov@0.9.1,cargo-about@0.9.2')
  expect(prebuilt).toContain("if: inputs.native-tests == 'true'")
  const driver = step(linuxSetup, 'cargo install tauri-driver --version 2.0.6 --locked')
  expect(driver).toContain("if: inputs.native-tests == 'true'")
  expect(step(job('windows-release'), 'uses: taiki-e/install-action@')).toContain(
    'tool: cargo-about@0.9.2',
  )
  for (const setup of [linuxSetup, windowsSetup]) {
    for (const command of [
      'npm ci --ignore-scripts',
      'cargo fetch --manifest-path src-tauri/Cargo.toml --locked',
    ]) {
      const install = step(setup, command)
      expect(install, command).toBeDefined()
      expect(install).not.toMatch(/^\s+if:/m)
    }
  }
})

test('every action outside the repository is pinned to a commit, named by its version', () => {
  for (const text of [workflow, linuxSetup, windowsSetup]) {
    for (const [, target] of text.matchAll(/uses: (\S+)/g)) {
      if (target.startsWith('./')) continue
      expect(text, target).toMatch(
        new RegExp(`uses: ${target.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')} # v\\d`),
      )
      expect(target, target).toMatch(/@[0-9a-f]{40}$/)
    }
  }
})

test('Windows runs the unit tests and the release build as separate jobs', () => {
  // The first release ships for Windows only (decision 0027).
  for (const name of ['windows-tests', 'windows-release']) {
    const windows = job(name)
    expect(windows).toContain('runs-on: windows-2025')
    // npm would otherwise run the package scripts through cmd.exe.
    expect(windows).toContain('npm_config_script_shell: C:\\Program Files\\Git\\bin\\bash.exe')
    expect(step(windows, 'uses: ./.github/actions/setup-windows')).toBeDefined()
  }
  // The versions come from .tool-versions, as asdf reads them on Linux.
  expect(windowsSetup).toContain('node-version-file: .tool-versions')
  expect(windowsSetup).toContain(`awk '$1 == "rust" { print $2 }' .tool-versions`)
  // The unit tests embed the built frontend.
  const tests = job('windows-tests')
  const build = tests.indexOf('run: npm run build --workspace src-ui')
  expect(build).toBeGreaterThan(0)
  expect(build).toBeLessThan(
    tests.indexOf('run: cargo test --manifest-path src-tauri/Cargo.toml --lib --locked'),
  )
  expect(step(job('windows-release'), 'run: npm run tauri -- build --no-bundle')).not.toMatch(
    /^\s+if:/m,
  )
  // Linux is not a release OS, so only Windows builds a release.
  expect(workflow.split('npm run tauri -- build --no-bundle')).toHaveLength(2)
})

test('a Windows build is published only once every check has passed', () => {
  const fromThisRepository =
    "github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository"
  // Built in parallel with the checks, the executable waits under an unverified name.
  const build = step(job('windows-release'), 'uses: actions/upload-artifact@')
  expect(build).toContain(`if: ${fromThisRepository}`)
  expect(build).toContain(
    'name: windows-build-unverified-${{ github.event.pull_request.head.sha || github.sha }}',
  )
  expect(build).toContain('path: src-tauri/target/release/astral-index.exe')
  expect(build).toContain('retention-days: 1')
  expect(build).toContain('if-no-files-found: error')
  const publish = job('publish')
  expect(publish).toContain('needs: [static, gates, probes, windows-tests, windows-release]')
  expect(publish).toContain(`if: always() && (${fromThisRepository})`)
  // Only this job may delete artifacts; the workflow grants read access alone.
  expect(publish).toContain('permissions:\n      actions: write')
  expect(workflow.match(/actions: write/g)).toHaveLength(1)
  const passed =
    "!contains(needs.*.result, 'failure') && !contains(needs.*.result, 'cancelled') && !contains(needs.*.result, 'skipped')"
  // After every check passes, it is republished under its lasting name for 30 days.
  const merge = step(publish, 'uses: actions/upload-artifact/merge@')
  expect(merge).toContain(`if: \${{ ${passed} }}`)
  expect(merge).toContain(
    'name: astral-index-dev-build-unsigned-${{ github.event.pull_request.head.sha || github.sha }}',
  )
  expect(merge).toContain(
    'pattern: windows-build-unverified-${{ github.event.pull_request.head.sha || github.sha }}',
  )
  expect(merge).toContain('retention-days: 30')
  expect(merge).toContain('delete-merged: true')
  // Otherwise the unverified build is deleted.
  const discard = step(publish, 'name: Delete the unverified build')
  expect(discard).toContain(`if: \${{ !(${passed}) }}`)
  expect(discard).toContain('select(.name | startswith("windows-build-unverified-"))')
  expect(discard).toContain('gh api -X DELETE')
})

test('each Linux job writes its own summary, however its check ended', () => {
  expect(scripts['ci:summary']).toBe(
    "vitest run --project gates tests/job-summary.test.ts -t '^write the job summary$'",
  )
  for (const name of ['static', 'gates', 'probes']) {
    const summary = step(job(name), 'run: npm run ci:summary')
    expect(summary, name).toBeDefined()
    expect(summary).toContain('if: always()')
    expect(summary).toContain(`CHECK_JOB: ${name}`)
    expect(summary).toContain('CHECK_STATUS: ${{ job.status }}')
  }
})
