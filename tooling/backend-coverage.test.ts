import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import {
  backendCargo,
  backendEnvironment,
  backendReport,
  backendUnitCoverage,
  resetBackendCoverage,
} from './backend-coverage'

vi.mock('node:child_process', () => {
  const api = { execFileSync: vi.fn() }
  return { ...api, default: api }
})
vi.mock('node:fs', () => {
  const api = { mkdirSync: vi.fn(), rmSync: vi.fn(), writeFileSync: vi.fn() }
  return { ...api, default: api }
})
beforeEach(() => {
  // The gates' report paths, even when the mutation probes run these tests.
  vi.stubEnv('ASTRAL_INDEX_PROBE_RUN', '')
  vi.resetAllMocks()
  vi.mocked(execFileSync).mockReturnValue(
    "export __CARGO_LLVM_COV_RUSTC_WRAPPER_RUSTFLAGS='existing'\nexport LLVM_PROFILE_FILE='profiles/%p.profraw'\n",
  )
})
afterEach(() => {
  vi.unstubAllEnvs()
})

test('backend stages retain the process environment and enable branch instrumentation', () => {
  expect(backendEnvironment()).toMatchObject({
    PATH: process.env.PATH,
    CARGO_LLVM_COV_TARGET_DIR: resolve('src-tauri/target'),
    GDK_BACKEND: 'x11',
    LLVM_PROFILE_FILE: 'profiles/%p.profraw',
    __CARGO_LLVM_COV_RUSTC_WRAPPER_RUSTFLAGS: 'existing\x1f-Zcoverage-options=branch',
  })
})

test('reset clears execution data with cargo while retaining separately frozen reports', () => {
  resetBackendCoverage()
  expect(writeFileSync).toHaveBeenCalledWith(
    'src-tauri/target/CACHEDIR.TAG',
    expect.stringContaining('8a477f597d28d172789f06886806bc55'),
  )
  expect(execFileSync).toHaveBeenCalledWith(
    'cargo',
    ['llvm-cov', 'clean', '--workspace'],
    expect.any(Object),
  )
  expect(rmSync).not.toHaveBeenCalled()
})

test('cargo stage executes only the requested operation and propagates failures', () => {
  backendCargo(['test', '--lib', '--locked', '--offline'])
  expect(execFileSync).toHaveBeenLastCalledWith(
    'cargo',
    ['test', '--lib', '--locked', '--offline'],
    expect.objectContaining({ cwd: resolve('src-tauri'), stdio: 'inherit' }),
  )
  vi.mocked(execFileSync).mockImplementationOnce(() => {
    throw new Error('environment failed')
  })
  expect(() => backendCargo(['build'])).toThrow('environment failed')
  vi.mocked(execFileSync)
    .mockImplementationOnce(() => "export __CARGO_LLVM_COV_RUSTC_WRAPPER_RUSTFLAGS='flags'\n")
    .mockImplementationOnce(() => {
      throw new Error('cargo failed')
    })
  expect(() => backendCargo(['build'])).toThrow('cargo failed')
})

test.each([false, true])(
  'reports replace prior evidence and generate HTML only when requested: %s',
  (html) => {
    backendReport('coverage/backend-unit', html)
    expect(rmSync).toHaveBeenCalledWith('coverage/backend-unit', { recursive: true, force: true })
    expect(mkdirSync).toHaveBeenCalledWith('coverage/backend-unit', { recursive: true })
    const commands = vi
      .mocked(execFileSync)
      .mock.calls.filter(([, args]) => args?.[1] === 'report')
      .map(([, args]) => args)
    expect(commands).toEqual([
      [
        'llvm-cov',
        'report',
        '--include-build-script',
        '--json',
        '--output-path',
        resolve('coverage/backend-unit/coverage.json'),
      ],
      ...(html
        ? [
            [
              'llvm-cov',
              'report',
              '--include-build-script',
              '--html',
              '--output-dir',
              resolve('coverage/backend-unit'),
            ],
          ]
        : []),
    ])
  },
)

test('unit coverage invalidates its old snapshot before running tests and freezes before integration', () => {
  backendUnitCoverage(false)
  expect(rmSync).toHaveBeenCalledWith('coverage/backend-unit', { recursive: true, force: true })
  const commands = vi
    .mocked(execFileSync)
    .mock.calls.map(([, args]) => args)
    .filter((args) => args?.[1] !== 'show-env')
  expect(commands).toEqual([
    ['llvm-cov', 'clean', '--workspace'],
    ['test', '--lib', '--locked', '--offline'],
    [
      'llvm-cov',
      'report',
      '--include-build-script',
      '--json',
      '--output-path',
      resolve('coverage/backend-unit/coverage.json'),
    ],
  ])
})

test('failed unit execution cannot leave a previous unit report in place', () => {
  vi.mocked(execFileSync).mockImplementation((_file, args) => {
    if (args?.[0] === 'test') throw new Error('unit failure')
    return "export __CARGO_LLVM_COV_RUSTC_WRAPPER_RUSTFLAGS='flags'\n"
  })
  expect(() => backendUnitCoverage(true)).toThrow('unit failure')
  expect(rmSync).toHaveBeenCalledWith('coverage/backend-unit', { recursive: true, force: true })
  const testCall = vi.mocked(execFileSync).mock.calls.findIndex(([, args]) => args?.[0] === 'test')
  expect(vi.mocked(rmSync).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(execFileSync).mock.invocationCallOrder[testCall],
  )
})

test('during the mutation probes, unit evidence goes to the probe run’s folder', () => {
  vi.stubEnv('ASTRAL_INDEX_PROBE_RUN', '1')
  backendUnitCoverage(false)
  expect(rmSync).toHaveBeenCalledWith('test-results/probe-run/coverage/backend-unit', {
    recursive: true,
    force: true,
  })
  expect(mkdirSync).toHaveBeenCalledWith('test-results/probe-run/coverage/backend-unit', {
    recursive: true,
  })
})
