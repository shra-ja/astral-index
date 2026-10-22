import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')
const workflow = read('.github/workflows/check.yml')
const release = read('.github/workflows/release.yml')
const linuxSetup = read('.github/actions/setup-linux/action.yml')
const windowsSetup = read('.github/actions/setup-windows/action.yml')
const buildWindows = read('.github/actions/build-windows/action.yml')
const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts

/** A job's block in a workflow, from its key to the next job's. */
function job(name: string, text = workflow) {
  const start = text.indexOf(`\n  ${name}:\n`)
  expect(start, name).toBeGreaterThan(0)
  const next = text.slice(start + 1).search(/\n {2}[a-z-]+:\n/)
  return next < 0 ? text.slice(start) : text.slice(start, start + 1 + next)
}
/** The steps of a workflow job or a composite action, split at their list items. */
const stepsOf = (text: string) => text.split(/^ {4,6}- /m).slice(1)
const step = (text: string, needle: string) => stepsOf(text).find((each) => each.includes(needle))

test('checks run on pull requests and pushes to main, with no merge queue', () => {
  expect(workflow).toMatch(/^on:\n {2}pull_request:\n {2}push:\n {4}branches: \[main\]\n/m)
  expect(workflow).not.toContain('merge_group')
  // A newer push supersedes a pull request's run. On main, which saves the caches,
  // it waits for the run in progress instead.
  expect(workflow).toContain(
    "concurrency:\n  group: checks-${{ github.ref }}\n  cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
  )
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
      'npm run readme:logo:check',
      'npm run versions:check',
      // Clippy compiles the unit tests, which embed the bundled frontend.
      'npm run build --workspace src-ui',
      'cargo fmt --manifest-path src-tauri/Cargo.toml --check',
      'cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets --all-features -- -D warnings',
    ].join(' && '),
  )
  // The README's logo is built from the brand files, as the app icons are.
  expect(scripts['readme:logo']).toBe(
    "vitest run --project gates tests/readme-logo.test.ts -t '^write the README logo$'",
  )
  expect(scripts['readme:logo:check']).toBe(
    "vitest run --project gates tests/readme-logo.test.ts -t '^the README logo matches the brand$'",
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
  // A probe that stalls until the job's time limit counts as cancelled.
  expect(snapshots).toContain('if: failure() || cancelled()')
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
    expect(rust).toMatch(/save-if: \$\{\{ .*github\.ref == 'refs\/heads\/main' \}\}/)
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
  const windowsSave = step(windowsSetup, 'uses: actions/cache/save@')
  expect(windowsSave).toContain(
    "if: inputs.save-npm-cache == 'true' && github.ref == 'refs/heads/main'",
  )
  expect(step(job('windows-release'), 'uses: ./.github/actions/setup-windows')).toContain(
    'save-npm-cache: true',
  )
  expect(step(job('windows-tests'), 'uses: ./.github/actions/setup-windows')).toContain(
    'save-npm-cache: false',
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

/**
 * Run the setup's OS package step with a stand-in sudo, whose first `failures`
 * downloads time out as a stalled mirror's would, and a stand-in sleep. Returns its
 * exit status and each command it ran.
 */
function installPackages(nativeTests: boolean, failures: number) {
  const packages = step(linuxSetup, 'name: Install the OS packages')!
  expect(packages).toContain('NATIVE_TESTS: ${{ inputs.native-tests }}')
  const script = /run: \|\n((?: {8}.*\n|\n)+)/.exec(packages)![1].replace(/^ {8}/gm, '')
  const dir = mkdtempSync(join(tmpdir(), 'apt-'))
  writeFileSync(join(dir, 'failures'), String(failures))
  writeFileSync(
    join(dir, 'sudo'),
    [
      '#!/usr/bin/env bash',
      'echo "$*" >> "$STUB/commands"',
      'left=$(cat "$STUB/failures")',
      'if [[ "$*" == *--download-only* ]] && (( left > 0 )); then',
      '  echo $((left - 1)) > "$STUB/failures"; exit 124',
      'fi',
    ].join('\n'),
    { mode: 0o755 },
  )
  writeFileSync(join(dir, 'sleep'), '#!/usr/bin/env bash\necho "sleep $*" >> "$STUB/commands"', {
    mode: 0o755,
  })
  const run = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      STUB: dir,
      NATIVE_TESTS: String(nativeTests),
    },
  })
  const commands = readFileSync(join(dir, 'commands'), 'utf8').trim().split('\n')
  return { status: run.status, commands }
}

test('OS packages download in bounded, retried attempts, so a slow mirror cannot stall a job', () => {
  // The static checks need the libraries Rust links against, not the native test tools.
  const libraries = installPackages(false, 0)
  expect(libraries.status).toBe(0)
  const [update, download, install] = libraries.commands
  // Each part of an attempt is killed if it outlasts its limit: at most about 12
  // minutes in all, inside every job's time limit.
  expect(update).toBe('timeout -k 10 60 apt-get update')
  expect(download).toMatch(
    /^timeout -k 10 180 apt-get install -y --download-only .*libwebkit2gtk-4\.1-dev/,
  )
  expect(download).not.toContain('xvfb')
  // Installing uses only what was downloaded, so it needs no time limit.
  expect(install).toBe(
    download.replace('timeout -k 10 180 ', '').replace('--download-only', '--no-download'),
  )
  expect(libraries.commands).toHaveLength(3)
  // The gates and probes also get the native test tools.
  const testTools = installPackages(true, 0).commands[1]
  for (const tool of ['xvfb', 'webkit2gtk-driver', 'xdotool', 'dbus-x11', 'bubblewrap']) {
    expect(testTools).toContain(tool)
  }
  // A stalled download is tried again after a pause, keeping what already arrived.
  const retried = installPackages(false, 2)
  expect(retried.status).toBe(0)
  const attempt: unknown[] = [update, expect.stringContaining('--download-only')]
  expect(retried.commands).toEqual([
    ...attempt,
    'sleep 10',
    ...attempt,
    'sleep 10',
    ...attempt,
    install,
  ])
  // Three stalls fail the job early, with nothing installed and no last pause.
  const stalled = installPackages(false, 3)
  expect(stalled.status).not.toBe(0)
  expect(stalled.commands).toEqual([...attempt, 'sleep 10', ...attempt, 'sleep 10', ...attempt])
})

test('tools install at pinned versions, prebuilt where checksummed releases exist', () => {
  const prebuilt = step(linuxSetup, 'uses: taiki-e/install-action@')
  expect(prebuilt).toContain('tool: cargo-llvm-cov@0.9.1,cargo-about@0.9.2')
  expect(prebuilt).toContain("if: inputs.native-tests == 'true'")
  const driver = step(linuxSetup, 'cargo install tauri-driver --version 2.0.6 --locked')
  expect(driver).toContain("if: inputs.native-tests == 'true'")
  expect(step(buildWindows, 'uses: taiki-e/install-action@')).toContain('tool: cargo-about@0.9.2')
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
  for (const text of [workflow, release, linuxSetup, windowsSetup, buildWindows]) {
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
  // Backups and restores write, flush and rename real files, which Windows treats
  // differently from Linux, so their real-file tests run there too.
  expect(
    tests.indexOf(
      'run: cargo test --manifest-path src-tauri/Cargo.toml --locked --test backup --test restore',
    ),
  ).toBeGreaterThan(build)
  // Clippy lints the Windows-only code too, which the Linux static checks never compile.
  const clippy = tests.indexOf(
    'run: cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets --all-features -- -D warnings',
  )
  expect(clippy).toBeGreaterThan(build)
  expect(windowsSetup).toContain(
    'rustup toolchain install "$toolchain" --profile minimal --component clippy',
  )
  // Linux is not a release OS, so only Windows builds a release, in one place.
  expect(step(buildWindows, 'run: npm run tauri -- build --no-bundle')).not.toMatch(/^\s+if:/m)
  expect(buildWindows.split('npm run tauri -- build')).toHaveLength(2)
  expect(workflow + release).not.toContain('npm run tauri -- build')
})

test('Windows smoke-tests the release executable before keeping it', () => {
  // The UI is tested end to end on Linux; Windows checks the native side (decision 0029).
  const build = buildWindows.indexOf('run: npm run tauri -- build --no-bundle')
  expect(buildWindows.indexOf('run: npm run test:windows-smoke')).toBeGreaterThan(build)
  expect(step(buildWindows, 'run: npm run test:windows-smoke')).not.toMatch(/^\s+if:/m)
  expect(scripts['test:windows-smoke']).toBe('vitest run --project windows')
  // Both builds go through it before anything keeps the executable.
  const ci = job('windows-release')
  expect(ci.indexOf('uses: ./.github/actions/build-windows')).toBeLessThan(
    ci.indexOf('uses: actions/upload-artifact@'),
  )
  const drafted = job('build', release)
  expect(drafted.indexOf('uses: ./.github/actions/build-windows')).toBeLessThan(
    drafted.indexOf('name: Name the download'),
  )
})

test('one action builds and smoke-tests the Windows executable, named by its inputs', () => {
  // The version and build identity reach the build and the smoke test alike.
  expect(buildWindows).toMatch(/inputs:\n {2}version:\n[\s\S]*?required: true/)
  expect(buildWindows).toMatch(/ {2}build:\n[\s\S]*?required: true/)
  for (const command of [
    'run: npm run tauri -- build --no-bundle',
    'run: npm run test:windows-smoke',
  ]) {
    const each = step(buildWindows, command)!
    expect(each, command).toContain('TAURI_CONFIG: \'{"version":"${{ inputs.version }}"}\'')
    expect(each, command).toContain('ASTRAL_INDEX_BUILD: ${{ inputs.build }}')
    expect(each, command).toContain('shell: bash')
  }
  // Only the action names a build: tests build without one, as local builds do.
  for (const name of ['TAURI_CONFIG', 'ASTRAL_INDEX_BUILD']) {
    expect(workflow + release, name).not.toContain(name)
  }
  // What stays in the two jobs matches, but for the cache CI alone saves and the
  // history CI alone needs, to find the last tag.
  const kept = (text: string) => ({
    runner: /runs-on: (.+)/.exec(text)?.[1],
    timeout: /timeout-minutes: (\d+)/.exec(text)?.[1],
    shell: /npm_config_script_shell: (.+)/.exec(text)?.[1],
    defaults: /defaults:\n {6}run:\n {8}shell: (\w+)/.exec(text)?.[1],
    credentials: /persist-credentials: (\w+)/.exec(text)?.[1],
    cache: /rust-cache: ([\w-]+)/.exec(text)?.[1],
  })
  expect(kept(job('build', release))).toEqual(kept(job('windows-release')))
  expect(kept(job('windows-release'))).toEqual({
    runner: 'windows-2025',
    timeout: '30',
    shell: 'C:\\Program Files\\Git\\bin\\bash.exe',
    defaults: 'bash',
    credentials: 'false',
    cache: 'windows-release',
  })
})

test('the Windows build carries the last release’s version and its commit', () => {
  // No manifest declares a version: builds receive it from the tags (decision 0030).
  const release = job('windows-release')
  expect(step(release, 'uses: actions/checkout@')).toContain('fetch-depth: 0')
  const identity = step(release, 'name: Name the build')!
  expect(identity).toBeDefined()
  expect(identity).toContain('id: name')
  // Release tags only, as the release workflow finds them: a tag such as v1.1.0-rc1
  // would give every build a version Tauri refuses.
  expect(identity).toContain(
    "git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude 'v*[!0-9.]*'",
  )
  expect(identity).toContain('|| echo v0.0.0')
  expect(identity).toContain('>> "$GITHUB_OUTPUT"')
  const build = step(release, 'uses: ./.github/actions/build-windows')!
  expect(build).toContain('version: ${{ steps.name.outputs.version }}')
  // The commit the artifact is named after: a pull request's head, though its build
  // is that head merged into main (decision 0030).
  expect(workflow).toContain(
    'env:\n  BUILD_COMMIT: ${{ github.event.pull_request.head.sha || github.sha }}\n',
  )
  expect(workflow.split('github.event.pull_request.head.sha')).toHaveLength(2)
  expect(build).toContain('build: ${{ env.BUILD_COMMIT }}')
  expect(release.indexOf('name: Name the build')).toBeLessThan(
    release.indexOf('uses: ./.github/actions/build-windows'),
  )
})

test('a Windows build is published only once every check has passed', () => {
  const fromThisRepository =
    "github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository"
  // Built in parallel with the checks, the executable waits under an unverified name.
  const build = step(job('windows-release'), 'uses: actions/upload-artifact@')
  expect(build).toContain(`if: ${fromThisRepository}`)
  expect(build).toContain('name: windows-build-unverified-${{ env.BUILD_COMMIT }}')
  expect(build).toContain('path: src-tauri/target/release/astral-index.exe')
  expect(build).toContain('retention-days: 1')
  expect(build).toContain('if-no-files-found: error')
  const publish = job('publish')
  expect(publish).toContain('needs: [static, gates, probes, windows-tests, windows-release]')
  // GitHub runs a job only once every job it needs has succeeded, unless its
  // condition names a status function, so this one says only whose builds it keeps.
  expect(publish).toContain(`\n    if: ${fromThisRepository}\n`)
  // Least privilege: no job needs to write to the run's artifacts.
  expect(workflow).not.toContain('actions: write')
  // It is republished under its lasting name for 7 days.
  const merge = step(publish, 'uses: actions/upload-artifact/merge@')
  expect(merge).not.toMatch(/^\s+if:/m)
  expect(merge).toContain('name: astral-index-dev-build-unsigned-${{ env.BUILD_COMMIT }}')
  expect(merge).toContain('pattern: windows-build-unverified-${{ env.BUILD_COMMIT }}')
  expect(merge).toContain('retention-days: 7')
  // The unverified build stays until it expires, so a re-run's publish still finds it.
  expect(merge).not.toContain('delete-merged')
})

test('only reports and uploads run whatever came before them', () => {
  // A step or job that names a status function, or reads the results of the jobs it
  // needs, overrides GitHub's own rule that it runs only after success. Reporting
  // and saving evidence are the only reasons to.
  for (const [name, text] of [
    ['check', workflow],
    ['release', release],
    ['setup-linux', linuxSetup],
    ['setup-windows', windowsSetup],
    ['build-windows', buildWindows],
  ]) {
    expect(text, name).not.toContain('needs.*.result')
    // Only a step's own one-line condition, never a job's.
    for (const line of text
      .split('\n')
      .filter((one) => /\b(always|success|failure|cancelled)\(\)/.test(one))) {
      expect(line, name).toMatch(/^ {8}if: /)
    }
    for (const each of stepsOf(text).filter((one) =>
      /\b(always|failure|cancelled)\(\)/.test(one),
    )) {
      expect(each, name).toMatch(/uses: actions\/upload-artifact@|run: npm run ci:summary/)
    }
  }
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

test('a release starts only by hand, from main, once every check has passed on it', () => {
  // One action releases (decision 0030): nothing starts it on a push or a schedule.
  const triggers = release.slice(release.indexOf('\non:\n'), release.indexOf('\npermissions:'))
  expect(triggers).toMatch(/^ {2}workflow_dispatch:$/m)
  expect(triggers).not.toMatch(/^ {2}(push|pull_request|schedule|release|workflow_run):/m)
  expect(release).toContain('cancel-in-progress: false')
  const prepare = job('prepare', release)
  expect(step(prepare, 'uses: actions/checkout@')).toContain('fetch-depth: 0')
  expect(step(prepare, 'refs/heads/main')).toContain('exit 1')
  // Exactly the checks the check workflow runs, other than publishing.
  const required = step(prepare, 'name: Require every check to have passed')!
  const checks = [...workflow.matchAll(/^ {4}name: (.+)$/gm)]
    .map(([, name]) => name)
    .filter((name) => name !== 'Publish the Windows build')
  expect(checks).toHaveLength(5)
  for (const name of checks) expect(required).toContain(`\n            ${name}\n`)
  expect(required).toContain('commits/$GITHUB_SHA/check-runs')
  expect(prepare).toContain('checks: read')
})

test('a release’s version and notes come from the commits or the inputs, which never reach a script', () => {
  const prepare = job('prepare', release)
  expect(release).toMatch(/inputs:\n {6}version:\n[\s\S]*?required: false/)
  expect(release).toMatch(/ {6}notes:\n[\s\S]*?required: false/)
  const write = step(prepare, 'run: npm run release:prepare')!
  expect(write).toContain('RELEASE_VERSION: ${{ inputs.version }}')
  expect(write).toContain('RELEASE_NOTES: ${{ inputs.notes }}')
  expect(scripts['release:prepare']).toBe(
    "vitest run --project gates tests/release.test.ts -t '^write the release$'",
  )
  // Inputs reach scripts only through the environment.
  for (const line of release.split('\n').filter((each) => each.includes('${{ inputs.'))) {
    expect(line, line).toMatch(/^\s+RELEASE_(VERSION|NOTES): \$\{\{ inputs\.(version|notes) \}\}$/)
  }
})

test('a release builds on Windows as a release, smoke-tested, and only drafts it', () => {
  const build = job('build', release)
  expect(build).toContain('runs-on: windows-2025')
  const built = step(build, 'uses: ./.github/actions/build-windows')!
  expect(built).toContain('version: ${{ needs.prepare.outputs.version }}')
  expect(built).toContain('build: release')
  expect(build).toContain('Astral-Index-${{ needs.prepare.outputs.tag }}.exe')
  // Only the job that creates the draft may write to the repository.
  expect(release).toMatch(/^permissions:\n {2}contents: read\n/m)
  expect(release.split('contents: write')).toHaveLength(2)
  const draft = job('release', release)
  expect(draft).toContain('contents: write')
  const create = step(draft, 'gh release create')!
  expect(create).toContain('--draft')
  expect(create).toContain('--title "$TAG"')
  expect(create).toContain('--target "$GITHUB_SHA"')
  expect(create).toContain('--notes-file')
})

test('a release refuses a version already drafted or released, and passes its files on intact', () => {
  for (const name of ['prepare', 'build']) {
    expect(step(job(name, release), 'uses: actions/checkout@'), name).toContain(
      'persist-credentials: false',
    )
  }
  // A draft creates no tag, so the drafting job, which can see drafts, checks first.
  const draft = job('release', release)
  const existing = step(draft, 'name: Refuse a version already drafted or released')!
  expect(existing).toContain('gh release list')
  expect(existing).toContain('select(.tagName == env.TAG)')
  expect(existing).toContain('exit 1')
  expect(draft.indexOf('name: Refuse a version already drafted or released')).toBeLessThan(
    draft.indexOf('gh release create'),
  )
  // The notes and the executable arrive where the release is created from.
  expect(step(job('prepare', release), 'name: release-notes')).toContain(
    'path: test-results/release/notes.md',
  )
  expect(step(draft, 'uses: actions/download-artifact@')).toContain('merge-multiple: true')
  expect(step(draft, 'gh release create')).toContain('--notes-file notes.md')
  expect(step(draft, 'gh release create')).toContain('"Astral-Index-$TAG.exe"')
  // The checks gate fails on anything but a passing run from GitHub Actions itself.
  const required = step(job('prepare', release), 'name: Require every check to have passed')!
  expect(required).toContain('select(.app.slug == "github-actions")')
  expect(required).toMatch(/if \[ "\$result" != success \]; then[\s\S]*?exit 1/)
})

test('a release smoke-tests the version it built, and leaves CI’s caches to CI', () => {
  const build = job('build', release)
  // A release, started by hand, restores the caches main saved but saves none.
  expect(step(build, 'uses: ./.github/actions/setup-windows')).toContain('save-rust-cache: false')
  // The tag reaches the copy step through the environment.
  const name = step(build, 'name: Name the download')!
  expect(name).toContain('TAG: ${{ needs.prepare.outputs.tag }}')
  expect(name).toContain(
    'run: cp src-tauri/target/release/astral-index.exe "Astral-Index-$TAG.exe"',
  )
})

test('a job saves a cache only when it says so, and every job says', () => {
  // Every boolean input defaults to false, so saving is opt-in.
  for (const [name, setup] of [
    ['setup-linux', linuxSetup],
    ['setup-windows', windowsSetup],
  ] as const) {
    for (const input of ['save-rust-cache', 'save-npm-cache']) {
      expect(setup, `${name} ${input}`).toMatch(
        new RegExp(`${input}:\\n[^\\n]*\\n {4}default: false\\n`),
      )
    }
    expect(setup, name).toContain(
      "save-if: ${{ inputs.save-rust-cache == 'true' && github.ref == 'refs/heads/main' }}",
    )
    expect(setup, name).not.toMatch(/default: '/)
  }
  expect(linuxSetup).toMatch(/native-tests:\n[^\n]*\n {4}default: false\n/)
  // Each job that sets up states both choices, as plain booleans.
  const uses = [
    ...(workflow + release).matchAll(
      /uses: \.\/\.github\/actions\/setup-\w+\n {8}with:\n((?: {10}.+\n)+)/g,
    ),
  ]
  expect(uses).toHaveLength(6)
  const saving = uses.map(([, inputs]) => ({
    rust: /save-rust-cache: (true|false)\n/.exec(inputs)?.[1],
    npm: /save-npm-cache: (true|false)\n/.exec(inputs)?.[1],
  }))
  expect(saving).toEqual([
    { rust: 'true', npm: 'true' },
    { rust: 'true', npm: 'false' },
    { rust: 'true', npm: 'false' },
    { rust: 'true', npm: 'false' },
    { rust: 'true', npm: 'true' },
    { rust: 'false', npm: 'false' },
  ])
  // Booleans are never quoted in the workflows.
  expect(workflow + release).not.toMatch(/: '(true|false)'$/m)
})
