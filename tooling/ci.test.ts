import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { parse } from 'yaml'

// The workflows and actions as GitHub reads them, so the tests check what each job
// and step does, not how the file is laid out. The text is read only for the pinned
// actions' version comments, which parsing drops, and for what must appear nowhere.
interface Step {
  name?: string
  id?: string
  uses?: string
  run?: string
  if?: string | boolean
  shell?: string
  'continue-on-error'?: boolean | string
  with?: Record<string, unknown>
  env?: Record<string, string>
}
/** A job's or workflow's permissions: each listed, or one grant for all, or none. */
type Permissions = Record<string, string> | 'read-all' | 'write-all' | null
interface Job {
  name: string
  'runs-on': string
  'timeout-minutes': number
  needs?: string | string[]
  if?: string | boolean
  'continue-on-error'?: boolean | string
  permissions?: Permissions
  env?: Record<string, string>
  defaults?: { run: { shell: string } }
  steps: Step[]
}
interface Workflow {
  on: Record<string, unknown>
  permissions: Permissions
  concurrency: Record<string, unknown>
  env?: Record<string, string>
  jobs: Record<string, Job>
}
interface Input {
  description: string
  required?: boolean
  default?: unknown
}
interface Action {
  inputs: Record<string, Input>
  runs: { steps: Step[] }
}

const files = {
  check: '.github/workflows/check.yml',
  release: '.github/workflows/release.yml',
  linuxSetup: '.github/actions/setup-linux/action.yml',
  windowsSetup: '.github/actions/setup-windows/action.yml',
  buildWindows: '.github/actions/build-windows/action.yml',
}
const read = (path: string) => readFileSync(path, 'utf8')
const check = parse(read(files.check)) as Workflow
const release = parse(read(files.release)) as Workflow
const linuxSetup = parse(read(files.linuxSetup)) as Action
const windowsSetup = parse(read(files.windowsSetup)) as Action
const buildWindows = parse(read(files.buildWindows)) as Action
const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts

const workflows = { check, release }
const actions = { linuxSetup, windowsSetup, buildWindows }
type File = keyof typeof files
/** Every job in the workflows, with its file and where in it. */
const everyJob = Object.entries(workflows).flatMap(([file, workflow]) =>
  Object.entries(workflow.jobs).map(([name, job]) => ({
    file: file as File,
    at: `${file} ${name}`,
    job,
  })),
)
/** Every step in the workflows' jobs and the actions, with its file and where in it. */
const everyStep = [
  ...everyJob.flatMap(({ file, at, job }) => job.steps.map((step) => ({ file, at, step }))),
  ...Object.entries(actions).flatMap(([file, action]) =>
    action.runs.steps.map((step) => ({ file: file as File, at: file, step })),
  ),
]

/** The one step matching, so a second copy fails rather than hides. */
function only(steps: Step[], matches: (step: Step) => boolean, what: string) {
  const found = steps.filter(matches)
  expect(found, what).toHaveLength(1)
  return found[0]
}
const using = (steps: Step[], action: string) =>
  only(steps, (step) => step.uses?.startsWith(action) ?? false, action)
const running = (steps: Step[], command: string) =>
  only(steps, (step) => step.run?.includes(command) ?? false, command)
const named = (steps: Step[], name: string) => only(steps, (step) => step.name === name, name)
/** The steps, each in the list once, come in the order given. */
function expectInOrder(steps: Step[], ...each: Step[]) {
  const positions = each.map((step) => steps.indexOf(step))
  expect(positions, 'each step is in the list').not.toContain(-1)
  expect(positions).toEqual([...new Set(positions)].toSorted((a, b) => a - b))
}
/** The permissions listed one by one; none for a blanket grant or a bare `permissions:`. */
const listed = (permissions: Permissions | undefined) =>
  typeof permissions === 'object' && permissions !== null ? permissions : {}
const requiredChecks = () =>
  named(release.jobs.prepare.steps, 'Require every check to have passed on this commit')
/** Each string in a workflow, with its path, to find where an expression is used. */
function* strings(value: unknown, path: string): Generator<[string, string]> {
  if (typeof value === 'string') yield [path, value]
  else if (value && typeof value === 'object') {
    for (const [key, each] of Object.entries(value)) yield* strings(each, `${path}.${key}`)
  }
}
const linuxSetupOf = (job: Job) => using(job.steps, './.github/actions/setup-linux')
const windowsSetupOf = (job: Job) => using(job.steps, './.github/actions/setup-windows')

const fromThisRepository =
  "github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository"

test('checks run on pull requests and pushes to main, with no merge queue', () => {
  expect(check.on).toEqual({ pull_request: null, push: { branches: ['main'] } })
  // A newer push supersedes a pull request's run. On main, which saves the caches,
  // it waits for the run in progress instead.
  expect(check.concurrency).toEqual({
    group: 'checks-${{ github.ref }}',
    'cancel-in-progress': "${{ github.event_name == 'pull_request' }}",
  })
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
    const job = check.jobs[name]
    expect(job['runs-on'], name).toBe('ubuntu-24.04')
    const run = only(job.steps, (step) => step.run === `npm run ${part}`, part)
    expect(run.if, part).toBeUndefined()
    // No other step runs it.
    const runs = everyStep.filter(({ step }) => step.run?.includes(`npm run ${part}`))
    expect(runs.map(({ at }) => at)).toEqual([`check ${name}`])
  }
  // The gates job's reports and screenshots are kept, even when a gate fails.
  const reports = using(check.jobs.gates.steps, 'actions/upload-artifact@')
  expect(reports.if).toBe('always()')
  expect(reports.with).toMatchObject({
    name: 'coverage-and-native-smoke',
    'if-no-files-found': 'error',
  })
  // A failed probe keeps its snapshot; one that stalls until the job's time limit
  // counts as cancelled.
  const snapshots = using(check.jobs.probes.steps, 'actions/upload-artifact@')
  expect(snapshots.if).toBe('failure() || cancelled()')
  expect(snapshots.with).toMatchObject({ path: 'test-results/probe-failures/' })
})

test('the gates and probes share one instrumented Rust cache; the static checks keep their own', () => {
  expect(linuxSetupOf(check.jobs.static).with).toMatchObject({ 'rust-cache': 'static' })
  for (const name of ['gates', 'probes']) {
    expect(linuxSetupOf(check.jobs[name]).with, name).toMatchObject({
      'rust-cache': 'instrumented',
      'native-tests': true,
    })
  }
})

test('only main saves caches, which pull requests restore, keyed by toolchain and lockfiles', () => {
  // v2.9.2 is the first release that keeps hyphenated crates under Cargo's new
  // build-dir layout. Tool versions live in the setup actions, so changing them
  // invalidates the cache.
  for (const [setup, file] of [
    [linuxSetup, files.linuxSetup],
    [windowsSetup, files.windowsSetup],
  ] as const) {
    const rust = using(setup.runs.steps, 'Swatinem/rust-cache@')
    expect(rust.uses).toBe('Swatinem/rust-cache@6323deb102c322ba6fcbdcafc7e3dddab59af2b6')
    expect(rust.with).toMatchObject({
      workspaces: 'src-tauri -> target',
      key: `\${{ hashFiles('.tool-versions', '${file}') }}`,
      'cache-bin': true,
      'cache-workspace-crates': false,
      'save-if': "${{ inputs.save-rust-cache == 'true' && github.ref == 'refs/heads/main' }}",
    })
  }
  for (const setup of [linuxSetup, windowsSetup]) {
    const npm = setup.runs.steps.filter((step) => String(step.with?.key).startsWith('npm-'))
    const restore = using(npm, 'actions/cache/restore@')
    expect(restore.with?.key).toBe(
      "npm-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('.tool-versions', 'package-lock.json') }}",
    )
    // Saved where and as it was restored from.
    const save = using(npm, 'actions/cache/save@')
    expect(save.with).toEqual(restore.with)
    expect(save.if).toBe("inputs.save-npm-cache == 'true' && github.ref == 'refs/heads/main'")
  }
  // A cache hit never skips an install or a check.
  for (const file of Object.values(files)) expect(read(file), file).not.toContain('cache-hit')
})

test('the Rust cache follows the asdf toolchain, where Cargo installs tools and registry sources', () => {
  // asdf keeps Cargo's home inside the toolchain; the cache otherwise saves an unused ~/.cargo.
  const steps = linuxSetup.runs.steps
  expectInOrder(
    steps,
    using(steps, 'asdf-vm/actions/install@'),
    running(steps, 'echo "CARGO_HOME=$(asdf where rust)" >> "$GITHUB_ENV"'),
    using(steps, 'Swatinem/rust-cache@'),
    using(steps, 'taiki-e/install-action@'),
    running(steps, 'cargo install tauri-driver'),
  )
})

/**
 * Run the setup's OS package step with a stand-in sudo, whose first `stalls`
 * commands matching `stall`, if any, time out as a slow mirror's would. Returns its
 * exit status and each command it ran.
 */
function installPackages(nativeTests: boolean, stall?: string, stalls = 1) {
  const packages = named(linuxSetup.runs.steps, 'Install the OS packages')
  expect(packages.env).toEqual({ NATIVE_TESTS: '${{ inputs.native-tests }}' })
  const dir = mkdtempSync(join(tmpdir(), 'apt-'))
  writeFileSync(join(dir, 'stalls'), String(stall ? stalls : 0))
  writeFileSync(
    join(dir, 'sudo'),
    [
      '#!/usr/bin/env bash',
      'echo "$*" >> "$STUB/commands"',
      'left=$(cat "$STUB/stalls")',
      'if [[ -n $STALL && "$*" == *"$STALL"* ]] && (( left > 0 )); then',
      '  echo $((left - 1)) > "$STUB/stalls"; exit 124',
      'fi',
    ].join('\n'),
    { mode: 0o755 },
  )
  const run = spawnSync(
    'bash',
    ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', packages.run!],
    {
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        STUB: dir,
        STALL: stall ?? '',
        NATIVE_TESTS: String(nativeTests),
      },
    },
  )
  const commands = readFileSync(join(dir, 'commands'), 'utf8').trim().split('\n')
  return { status: run.status, commands }
}

test('OS packages come from the cache, then the Azure mirror, then Ubuntu’s own archive', () => {
  const archives = '-o Dir::Cache::Archives=/var/cache/ci-apt-archives'
  // The static checks need the libraries Rust links against, not the native test tools.
  const libraries = installPackages(false)
  expect(libraries.status).toBe(0)
  const [update, download, install, clean] = libraries.commands
  // The first attempt is bounded and killed if it outlasts its limit.
  expect(update).toBe('timeout -k 10 60 apt-get update')
  expect(download).toMatch(
    /^timeout -k 10 240 apt-get -o Dir::Cache::Archives=\/var\/cache\/ci-apt-archives install -y --download-only .*libwebkit2gtk-4\.1-dev/,
  )
  expect(download).not.toContain('xvfb')
  const packages = download.replace(/.*--download-only /, '')
  // Installing uses only what is cached or was downloaded, and the cache keeps only
  // the packages still current.
  expect(install).toBe(`apt-get ${archives} install -y --no-download ${packages}`)
  expect(clean).toBe(`apt-get ${archives} autoclean`)
  expect(libraries.commands).toHaveLength(4)
  // The gates and probes also get the native test tools.
  const testTools = installPackages(true).commands[1]
  for (const tool of ['xvfb', 'webkit2gtk-driver', 'xdotool', 'dbus-x11', 'bubblewrap']) {
    expect(testTools).toContain(tool)
  }
  // apt moves on from a mirror that stops answering, not from one that crawls, so a
  // stalled first attempt drops the Azure mirror and tries again from Ubuntu's own
  // archive, keeping what already arrived, with only the job's time limit.
  const fallback = [
    'sed -i /azure\\.archive\\.ubuntu\\.com/d /etc/apt/apt-mirrors.txt',
    'apt-get update',
    `apt-get ${archives} install -y --download-only ${packages}`,
    install,
    clean,
  ]
  for (const stall of ['--download-only', 'update']) {
    const slow = installPackages(false, stall)
    expect(slow.status, stall).toBe(0)
    expect(slow.commands, stall).toEqual([
      ...(stall === 'update' ? [update] : [update, download]),
      ...fallback,
    ])
  }
  // A stalled fallback fails the job, with nothing installed.
  const stalled = installPackages(false, '--download-only', 2)
  expect(stalled.status).not.toBe(0)
  expect(stalled.commands).toEqual([update, download, ...fallback.slice(0, 3)])
})

test('main saves the downloaded OS packages, which every job restores before installing', () => {
  const steps = linuxSetup.runs.steps
  const path = '/var/cache/ci-apt-archives/*.deb'
  const packageCache = steps.filter((step) => step.with?.path === path)
  // Each runner image and package list has its own key, and starts from the last
  // one's packages, so apt downloads only what changed.
  const prefix = 'apt-${{ runner.os }}-${{ runner.arch }}-${{ inputs.native-tests }}-'
  const key = `${prefix}\${{ hashFiles('${files.linuxSetup}') }}-\${{ steps.image.outputs.version }}`
  const prepare = named(steps, 'Prepare the OS package cache')
  expect(prepare.id).toBe('image')
  // apt's download user can't enter the home folder, so the cache lives outside it.
  expect(prepare.run).toContain('sudo install -d -o "$USER" /var/cache/ci-apt-archives')
  expect(prepare.run).toContain('echo "version=$ImageVersion" >> "$GITHUB_OUTPUT"')
  const restore = using(packageCache, 'actions/cache/restore@')
  expect(restore.with).toEqual({ path, key, 'restore-keys': prefix })
  const save = using(packageCache, 'actions/cache/save@')
  expect(save.with).toEqual({ path, key })
  expect(save.if).toBe("inputs.save-apt-cache == 'true' && github.ref == 'refs/heads/main'")
  expectInOrder(steps, prepare, restore, named(steps, 'Install the OS packages'), save)
})

test('tools install at pinned versions, prebuilt where checksummed releases exist', () => {
  const steps = linuxSetup.runs.steps
  const prebuilt = using(steps, 'taiki-e/install-action@')
  expect(prebuilt.with).toEqual({ tool: 'cargo-llvm-cov@0.9.1,cargo-about@0.9.2' })
  expect(prebuilt.if).toBe("inputs.native-tests == 'true'")
  const driver = running(steps, 'cargo install tauri-driver --version 2.0.6 --locked')
  expect(driver.if).toBe("inputs.native-tests == 'true'")
  expect(using(buildWindows.runs.steps, 'taiki-e/install-action@').with).toEqual({
    tool: 'cargo-about@0.9.2',
  })
  for (const setup of [linuxSetup, windowsSetup]) {
    for (const command of [
      'npm ci --ignore-scripts',
      'cargo fetch --manifest-path src-tauri/Cargo.toml --locked',
    ]) {
      expect(running(setup.runs.steps, command).if, command).toBeUndefined()
    }
  }
})

test('every action outside the repository is pinned to a commit, named by its version', () => {
  const outside = everyStep.filter(({ step }) => step.uses && !step.uses.startsWith('./'))
  expect(outside.length).toBeGreaterThan(0)
  for (const { at, step } of outside) expect(step.uses, at).toMatch(/@[0-9a-f]{40}$/)
  // The version is a comment, which only the text keeps, on every use.
  for (const [file, path] of Object.entries(files)) {
    const pins = read(path).match(/uses: (?!\.\/).*/g) ?? []
    expect(pins, file).toHaveLength(outside.filter((each) => each.file === file).length)
    for (const line of pins) expect(line, file).toMatch(/@[0-9a-f]{40} # v\d/)
  }
  // No job calls a reusable workflow, which would need pinning too.
  for (const { at, job } of everyJob) expect(job, at).not.toHaveProperty('uses')
})

test('the setup actions set the environment their jobs need, so no job repeats it', () => {
  // asdf installs Rust with only the components the checks use.
  expect(using(linuxSetup.runs.steps, 'asdf-vm/actions/install@').env).toEqual({
    ASDF_RUST_PROFILE: 'minimal',
  })
  // npm would otherwise run scripts through cmd.exe; set first, it holds for the job.
  const [shell] = windowsSetup.runs.steps
  expect(shell.shell).toBe('bash')
  expect(shell.run).toContain('npm_config_script_shell=C:\\Program Files\\Git\\bin\\bash.exe')
  expect(shell.run).toContain('>> "$GITHUB_ENV"')
  // Neither a workflow, a job nor a step sets them again.
  const environments = [
    ...Object.entries(workflows).map(([file, workflow]) => ({ at: file, env: workflow.env })),
    ...everyJob.map(({ at, job }) => ({ at, env: job.env })),
    ...everyStep.map(({ at, step }) => ({
      at: `${at} ${step.name ?? step.uses ?? step.run}`,
      env: step.env,
    })),
  ].filter(({ env }) => env !== undefined)
  const repeated = environments.filter(({ env }) =>
    Object.keys(env!).some((name) =>
      ['ASDF_RUST_PROFILE', 'npm_config_script_shell'].includes(name),
    ),
  )
  // Only the asdf step, which alone reads the profile.
  const asdf = using(linuxSetup.runs.steps, 'asdf-vm/actions/install@')
  expect(repeated.map(({ at }) => at)).toEqual([`linuxSetup ${asdf.uses}`])
  // Each Windows job sets up before it runs anything through npm.
  const windows = everyJob.filter(({ job }) => job['runs-on'].startsWith('windows-'))
  expect(windows.map(({ at }) => at)).toEqual([
    'check windows-tests',
    'check windows-release',
    'release build',
  ])
  for (const { at, job } of windows) {
    const npm = job.steps.findIndex(
      (step) => step.run?.includes('npm ') || step.uses === './.github/actions/build-windows',
    )
    expect(job.steps.indexOf(windowsSetupOf(job)), at).toBeLessThan(npm)
  }
})

test('Windows runs the unit tests and the release build as separate jobs', () => {
  // The first release ships for Windows only (decision 0027).
  for (const name of ['windows-tests', 'windows-release']) {
    const job = check.jobs[name]
    expect(job['runs-on'], name).toBe('windows-2025')
    expect(windowsSetupOf(job).uses, name).toBe('./.github/actions/setup-windows')
  }
  // The versions come from .tool-versions, as asdf reads them on Linux.
  const setup = windowsSetup.runs.steps
  only(setup, (step) => step.with?.['node-version-file'] === '.tool-versions', 'Node')
  running(setup, `awk '$1 == "rust" { print $2 }' .tool-versions`)
  running(setup, 'rustup toolchain install "$toolchain" --profile minimal --component clippy')
  // The unit tests embed the built frontend. Backups and restores write, flush and
  // rename real files, which Windows treats differently from Linux, so their
  // real-file tests run there too. Clippy lints the Windows-only code, which the
  // Linux static checks never compile.
  const tests = check.jobs['windows-tests'].steps
  const build = running(tests, 'npm run build --workspace src-ui')
  for (const after of [
    'cargo test --manifest-path src-tauri/Cargo.toml --lib --locked',
    'cargo test --manifest-path src-tauri/Cargo.toml --locked --test backup --test restore',
    'cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets --all-features -- -D warnings',
  ]) {
    expectInOrder(tests, build, running(tests, after))
  }
  // Linux is not a release OS, so only Windows builds a release, in one place.
  const releaseBuilds = everyStep.filter(({ step }) => step.run?.includes('npm run tauri -- build'))
  expect(releaseBuilds.map(({ at }) => at)).toEqual(['buildWindows'])
  expect(releaseBuilds[0].step.if).toBeUndefined()
})

test('Windows smoke-tests the release executable before keeping it', () => {
  // The UI is tested end to end on Linux; Windows checks the native side (decision 0029).
  const steps = buildWindows.runs.steps
  const smoke = running(steps, 'npm run test:windows-smoke')
  expectInOrder(steps, running(steps, 'npm run tauri -- build --no-bundle'), smoke)
  expect(smoke.if).toBeUndefined()
  expect(scripts['test:windows-smoke']).toBe('vitest run --project windows')
  // Both builds go through it before anything keeps the executable.
  const ci = check.jobs['windows-release'].steps
  expectInOrder(
    ci,
    using(ci, './.github/actions/build-windows'),
    using(ci, 'actions/upload-artifact@'),
  )
  const drafted = release.jobs.build.steps
  expectInOrder(
    drafted,
    using(drafted, './.github/actions/build-windows'),
    named(drafted, 'Name the download'),
    using(drafted, 'actions/upload-artifact@'),
  )
})

test('one action builds and smoke-tests the Windows executable, named by its inputs', () => {
  // The version and build identity reach the build and the smoke test alike.
  expect(buildWindows.inputs.version.required).toBe(true)
  expect(buildWindows.inputs.build.required).toBe(true)
  const steps = buildWindows.runs.steps
  for (const command of ['npm run tauri -- build --no-bundle', 'npm run test:windows-smoke']) {
    const each = running(steps, command)
    expect(each.env, command).toEqual({
      TAURI_CONFIG: '{"version":"${{ inputs.version }}"}',
      ASTRAL_INDEX_BUILD: '${{ inputs.build }}',
    })
    expect(each.shell, command).toBe('bash')
  }
  // Only the action names a build: tests build without one, as local builds do.
  for (const name of ['TAURI_CONFIG', 'ASTRAL_INDEX_BUILD']) {
    for (const file of [files.check, files.release]) expect(read(file), name).not.toContain(name)
  }
  // What stays in the two jobs matches, but for the cache CI alone saves and the
  // history CI alone needs, to find the last tag.
  const shared = (job: Job) => ({
    runner: job['runs-on'],
    timeout: job['timeout-minutes'],
    defaults: job.defaults?.run.shell,
    credentials: using(job.steps, 'actions/checkout@').with?.['persist-credentials'],
    cache: windowsSetupOf(job).with?.['rust-cache'],
  })
  expect(shared(release.jobs.build)).toEqual(shared(check.jobs['windows-release']))
  expect(shared(check.jobs['windows-release'])).toEqual({
    runner: 'windows-2025',
    timeout: 30,
    defaults: 'bash',
    credentials: false,
    cache: 'windows-release',
  })
})

test('the Windows build carries the last release’s version and its commit', () => {
  // No manifest declares a version: builds receive it from the tags (decision 0030).
  const steps = check.jobs['windows-release'].steps
  expect(using(steps, 'actions/checkout@').with).toMatchObject({ 'fetch-depth': 0 })
  const identity = named(steps, 'Name the build')
  expect(identity.id).toBe('name')
  // Release tags only, as the release workflow finds them: a tag such as v1.1.0-rc1
  // would give every build a version Tauri refuses.
  expect(identity.run).toContain(
    "git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude 'v*[!0-9.]*'",
  )
  expect(identity.run).toContain('|| echo v0.0.0')
  expect(identity.run).toContain('>> "$GITHUB_OUTPUT"')
  // The commit the artifact is named after, named once: a pull request's head,
  // though its build is that head merged into main (decision 0030).
  expect(check.env).toEqual({
    BUILD_COMMIT: '${{ github.event.pull_request.head.sha || github.sha }}',
  })
  const heads = [...strings(check, 'check')].filter(([, value]) =>
    value.includes('github.event.pull_request.head.sha'),
  )
  expect(heads.map(([path]) => path)).toEqual(['check.env.BUILD_COMMIT'])
  const build = using(steps, './.github/actions/build-windows')
  expect(build.with).toEqual({
    version: '${{ steps.name.outputs.version }}',
    build: '${{ env.BUILD_COMMIT }}',
  })
  expectInOrder(steps, identity, build)
})

test('a Windows build is published only once every check has passed', () => {
  // Built in parallel with the checks, the executable waits under an unverified name.
  const unverified = using(check.jobs['windows-release'].steps, 'actions/upload-artifact@')
  expect(unverified.if).toBe(fromThisRepository)
  expect(unverified.with).toEqual({
    name: 'windows-build-unverified-${{ env.BUILD_COMMIT }}',
    path: 'src-tauri/target/release/astral-index.exe',
    'retention-days': 1,
    'if-no-files-found': 'error',
  })
  const publish = check.jobs.publish
  expect(publish.needs).toEqual(Object.keys(check.jobs).filter((name) => name !== 'publish'))
  // GitHub runs a job only once every job it needs has succeeded, unless its
  // condition names a status function, so this one says only whose builds it keeps.
  expect(publish.if).toBe(fromThisRepository)
  // Least privilege: no job needs to write to the run's artifacts.
  for (const job of Object.values(check.jobs))
    expect(listed(job.permissions).actions).toBeUndefined()
  expect(check.permissions).toEqual({ contents: 'read' })
  // It is republished under its lasting name for 7 days. The unverified build stays
  // until it expires, so a re-run's publish still finds it.
  const merge = using(publish.steps, 'actions/upload-artifact/merge@')
  expect(merge.if).toBeUndefined()
  expect(merge.with).toEqual({
    name: 'astral-index-dev-build-unsigned-${{ env.BUILD_COMMIT }}',
    pattern: 'windows-build-unverified-${{ env.BUILD_COMMIT }}',
    'retention-days': 7,
  })
})

test('only reports and uploads run whatever came before them', () => {
  // A step or job that names a status function, or reads the results of the jobs it
  // needs, overrides GitHub's own rule that it runs only after success. Reporting
  // and saving evidence are the only reasons to.
  // GitHub reads function names in any case.
  const overrides = /\b(always|success|failure|cancelled)\(\)|\bneeds\b[^&|]*\bresult\b/i
  for (const { at, job } of everyJob) expect(String(job.if ?? ''), at).not.toMatch(overrides)
  for (const { at, step } of everyStep.filter(({ step }) =>
    overrides.test(String(step.if ?? '')),
  )) {
    expect(step.if, at).not.toContain('needs.')
    const reports =
      step.uses?.startsWith('actions/upload-artifact@') || step.run === 'npm run ci:summary'
    expect(reports, `${at} ${step.name ?? step.uses ?? step.run}`).toBe(true)
  }
})

test('each Linux job writes its own summary, however its check ended', () => {
  expect(scripts['ci:summary']).toBe(
    "vitest run --project gates tests/job-summary.test.ts -t '^write the job summary$'",
  )
  for (const name of ['static', 'gates', 'probes']) {
    const summary = only(check.jobs[name].steps, (step) => step.run === 'npm run ci:summary', name)
    expect(summary.if).toBe('always()')
    expect(summary.env).toEqual({ CHECK_JOB: name, CHECK_STATUS: '${{ job.status }}' })
  }
})

test('a release starts only by hand, from main, once every check has passed on it', () => {
  // One action releases (decision 0030): nothing starts it on a push or a schedule.
  expect(Object.keys(release.on)).toEqual(['workflow_dispatch'])
  expect(release.concurrency['cancel-in-progress']).toBe(false)
  const prepare = release.jobs.prepare
  expect(using(prepare.steps, 'actions/checkout@').with).toMatchObject({ 'fetch-depth': 0 })
  const fromMain = running(prepare.steps, 'refs/heads/main')
  expect(fromMain.run).toContain('exit 1')
  // Exactly the checks the check workflow runs, other than publishing.
  const required = requiredChecks()
  expect(required.env?.CHECKS.trim().split('\n')).toEqual(
    Object.entries(check.jobs)
      .filter(([name]) => name !== 'publish')
      .map(([, job]) => job.name),
  )
  expect(required.run).toContain('commits/$GITHUB_SHA/check-runs')
  expect(prepare.permissions).toMatchObject({ checks: 'read' })
})

test('a release’s version and notes come from the commits or the inputs, which never reach a script', () => {
  const inputs = (release.on.workflow_dispatch as { inputs: Record<string, Input> }).inputs
  expect(inputs.version.required).toBe(false)
  expect(inputs.notes.required).toBe(false)
  const write = running(release.jobs.prepare.steps, 'npm run release:prepare')
  expect(write.env).toEqual({
    RELEASE_VERSION: '${{ inputs.version }}',
    RELEASE_NOTES: '${{ inputs.notes }}',
  })
  expect(scripts['release:prepare']).toBe(
    "vitest run --project gates tests/release.test.ts -t '^write the release$'",
  )
  // Inputs reach scripts only through the environment, in whatever form they are read.
  // Any expression near the word fails, so a harmless mention fails too, never the
  // other way round.
  const used = [...strings(release, 'release')].filter(
    ([, value]) => value.includes('${{') && /\binputs\b/.test(value),
  )
  expect(used.map(([path]) => path.replace(/\.\d+\./, '.'))).toEqual([
    'release.jobs.prepare.steps.env.RELEASE_VERSION',
    'release.jobs.prepare.steps.env.RELEASE_NOTES',
  ])
})

test('a release builds on Windows as a release, smoke-tested, and only drafts it', () => {
  const build = release.jobs.build
  expect(build['runs-on']).toBe('windows-2025')
  expect(using(build.steps, './.github/actions/build-windows').with).toEqual({
    version: '${{ needs.prepare.outputs.version }}',
    build: 'release',
  })
  // Only the job that creates the draft may write to the repository.
  expect(release.permissions).toEqual({ contents: 'read' })
  const writers = Object.entries(release.jobs).filter(
    ([, job]) => listed(job.permissions).contents === 'write',
  )
  expect(writers.map(([name]) => name)).toEqual(['release'])
  const create = running(release.jobs.release.steps, 'gh release create')
  for (const flag of ['--draft', '--title "$TAG"', '--target "$GITHUB_SHA"', '--notes-file']) {
    expect(create.run).toContain(flag)
  }
})

test('a release refuses a version already drafted or released, and passes its files on intact', () => {
  for (const name of ['prepare', 'build']) {
    expect(using(release.jobs[name].steps, 'actions/checkout@').with, name).toMatchObject({
      'persist-credentials': false,
    })
  }
  // A draft creates no tag, so the drafting job, which can see drafts, checks first.
  const draft = release.jobs.release.steps
  const existing = named(draft, 'Refuse a version already drafted or released')
  for (const part of ['gh release list', 'select(.tagName == env.TAG)', 'exit 1']) {
    expect(existing.run).toContain(part)
  }
  const create = running(draft, 'gh release create')
  expectInOrder(draft, existing, create)
  // The notes and the executable arrive where the release is created from.
  const notes = only(
    release.jobs.prepare.steps,
    (step) => step.with?.name === 'release-notes',
    'notes',
  )
  expect(notes.with).toMatchObject({ path: 'test-results/release/notes.md' })
  expect(using(draft, 'actions/download-artifact@').with).toMatchObject({
    'merge-multiple': true,
  })
  expect(create.run).toContain('--notes-file notes.md')
  expect(create.run).toContain('"Astral-Index-$TAG.exe"')
  // The checks gate fails on anything but a passing run from GitHub Actions itself.
  const required = requiredChecks()
  expect(required.run).toContain('select(.app.slug == "github-actions")')
  expect(required.run).toMatch(/if \[ "\$result" != success \]; then[\s\S]*?exit 1/)
})

test('a release smoke-tests the version it built, and leaves CI’s caches to CI', () => {
  const build = release.jobs.build
  // A release, started by hand, restores the caches main saved but saves none.
  expect(windowsSetupOf(build).with).toMatchObject({ 'save-rust-cache': false })
  // The tag reaches the copy step through the environment.
  const name = named(build.steps, 'Name the download')
  expect(name.env).toEqual({ TAG: '${{ needs.prepare.outputs.tag }}' })
  expect(name.run).toBe('cp src-tauri/target/release/astral-index.exe "Astral-Index-$TAG.exe"')
  // That file, and only it, goes to the job that drafts the release.
  expect(using(build.steps, 'actions/upload-artifact@').with).toEqual({
    name: 'release-executable',
    path: 'Astral-Index-${{ needs.prepare.outputs.tag }}.exe',
    'if-no-files-found': 'error',
  })
})

test('a job saves a cache only when it says so, and every job says', () => {
  // Every choice an action offers defaults to false, so saving is opt-in.
  const choices = {
    linuxSetup: ['native-tests', 'save-rust-cache', 'save-npm-cache', 'save-apt-cache'],
    windowsSetup: ['save-rust-cache', 'save-npm-cache'],
  }
  for (const [name, inputs] of Object.entries(choices)) {
    const setup = actions[name as keyof typeof choices]
    for (const input of inputs) expect(setup.inputs[input].default, `${name} ${input}`).toBe(false)
  }
  // Each job that sets up states its choices, as booleans, never quoted strings.
  const setups = everyStep.filter(({ step }) => step.uses?.startsWith('./.github/actions/setup-'))
  for (const { at, step } of setups) {
    for (const [input, value] of Object.entries(step.with ?? {})) {
      const quoted = typeof value === 'string' && /^(true|false)$/.test(value)
      expect(quoted, `${at} ${input}`).toBe(false)
    }
  }
  const saving = Object.fromEntries(
    setups.map(({ at, step }) => [
      at,
      Object.fromEntries(
        Object.entries(step.with ?? {}).filter(([input]) => input.startsWith('save-')),
      ),
    ]),
  )
  expect(saving).toEqual({
    'check static': { 'save-rust-cache': true, 'save-npm-cache': true, 'save-apt-cache': true },
    'check gates': { 'save-rust-cache': true, 'save-npm-cache': false, 'save-apt-cache': true },
    'check probes': { 'save-rust-cache': true, 'save-npm-cache': false, 'save-apt-cache': false },
    'check windows-tests': { 'save-rust-cache': true, 'save-npm-cache': false },
    'check windows-release': { 'save-rust-cache': true, 'save-npm-cache': true },
    'release build': { 'save-rust-cache': false, 'save-npm-cache': false },
  })
})

test('no check can pass by failing quietly, and no job asks for every permission', () => {
  // A step or job allowed to fail would let a broken check pass the run.
  for (const { at, step } of everyStep) {
    expect(step['continue-on-error'], `${at} ${step.name ?? step.uses ?? step.run}`).toBeUndefined()
  }
  for (const { at, job } of everyJob) {
    expect(job['continue-on-error'], at).toBeUndefined()
  }
  // Permissions are listed one by one, never a blanket grant or a bare `permissions:`;
  // a job may also leave them out and take the workflow's.
  for (const { at, job } of everyJob.filter(({ job }) => job.permissions !== undefined)) {
    expect(listed(job.permissions), at).toBe(job.permissions)
  }
  for (const [file, workflow] of Object.entries(workflows)) {
    expect(listed(workflow.permissions), file).toBe(workflow.permissions)
  }
})
