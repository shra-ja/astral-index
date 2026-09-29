import { beforeEach, expect, test, vi } from 'vitest';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { nativeCargo, nativeEnvironment, nativeReport, nativeUnitCoverage, refreshProbeCoverage, resetNativeCoverage } from './native-coverage';

vi.mock('node:child_process', () => {
  const api = { execFileSync: vi.fn() };
  return { ...api, default: api };
});
vi.mock('node:fs', () => {
  const api = { mkdirSync: vi.fn(), rmSync: vi.fn(), writeFileSync: vi.fn() };
  return { ...api, default: api };
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(execFileSync).mockReturnValue("export __CARGO_LLVM_COV_RUSTC_WRAPPER_RUSTFLAGS='existing'\nexport LLVM_PROFILE_FILE='profiles/%p.profraw'\n");
});

test('native stages retain the process environment and enable branch instrumentation', () => {
  expect(nativeEnvironment()).toMatchObject({
    PATH: process.env.PATH,
    CARGO_LLVM_COV_TARGET_DIR: resolve('src-tauri/target'),
    GDK_BACKEND: 'x11',
    LLVM_PROFILE_FILE: 'profiles/%p.profraw',
    __CARGO_LLVM_COV_RUSTC_WRAPPER_RUSTFLAGS: 'existing\x1f-Zcoverage-options=branch',
  });
});

test('reset clears execution data with cargo while retaining separately frozen reports', () => {
  resetNativeCoverage();
  expect(writeFileSync).toHaveBeenCalledWith('src-tauri/target/CACHEDIR.TAG', expect.stringContaining('8a477f597d28d172789f06886806bc55'));
  expect(execFileSync).toHaveBeenCalledWith('cargo', ['llvm-cov', 'clean', '--workspace'], expect.any(Object));
  expect(rmSync).not.toHaveBeenCalled();
});

test('cargo stage executes only the requested operation and propagates failures', () => {
  nativeCargo(['test', '--lib', '--locked', '--offline']);
  expect(execFileSync).toHaveBeenLastCalledWith('cargo', ['test', '--lib', '--locked', '--offline'], expect.objectContaining({ cwd: resolve('src-tauri'), stdio: 'inherit' }));
  vi.mocked(execFileSync).mockImplementationOnce(() => { throw new Error('environment failed'); });
  expect(() => nativeCargo(['build'])).toThrow('environment failed');
  vi.mocked(execFileSync).mockImplementationOnce(() => "export __CARGO_LLVM_COV_RUSTC_WRAPPER_RUSTFLAGS='flags'\n").mockImplementationOnce(() => { throw new Error('cargo failed'); });
  expect(() => nativeCargo(['build'])).toThrow('cargo failed');
});

test.each([false, true])('reports replace prior evidence and generate HTML only when requested: %s', html => {
  nativeReport('coverage/native-unit', html);
  expect(rmSync).toHaveBeenCalledWith('coverage/native-unit', { recursive: true, force: true });
  expect(mkdirSync).toHaveBeenCalledWith('coverage/native-unit', { recursive: true });
  const commands = vi.mocked(execFileSync).mock.calls.filter(([, args]) => args?.[1] === 'report').map(([, args]) => args);
  expect(commands).toEqual([
    ['llvm-cov', 'report', '--include-build-script', '--json', '--output-path', resolve('coverage/native-unit/coverage.json')],
    ...(html ? [['llvm-cov', 'report', '--include-build-script', '--html', '--output-dir', resolve('coverage/native-unit')]] : []),
  ]);
});

test('unit coverage invalidates its old snapshot before running tests and freezes before integration', () => {
  nativeUnitCoverage(false);
  expect(rmSync).toHaveBeenCalledWith('coverage/native-unit', { recursive: true, force: true });
  const commands = vi.mocked(execFileSync).mock.calls.map(([, args]) => args).filter(args => args?.[1] !== 'show-env');
  expect(commands).toEqual([
    ['llvm-cov', 'clean', '--workspace'],
    ['test', '--lib', '--locked', '--offline'],
    ['llvm-cov', 'report', '--include-build-script', '--json', '--output-path', resolve('coverage/native-unit/coverage.json')],
  ]);
});

test('failed unit execution cannot leave a previous unit report in place', () => {
  vi.mocked(execFileSync).mockImplementation((_file, args) => {
    if (args?.[0] === 'test') throw new Error('unit failure');
    return "export __CARGO_LLVM_COV_RUSTC_WRAPPER_RUSTFLAGS='flags'\n";
  });
  expect(() => nativeUnitCoverage(true)).toThrow('unit failure');
  expect(rmSync).toHaveBeenCalledWith('coverage/native-unit', { recursive: true, force: true });
  const testCall = vi.mocked(execFileSync).mock.calls.findIndex(([, args]) => args?.[0] === 'test');
  expect(vi.mocked(rmSync).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(execFileSync).mock.invocationCallOrder[testCall]);
});

test('final regeneration runs coverage and the full offline suite before all report gates', () => {
  refreshProbeCoverage();
  expect(vi.mocked(execFileSync).mock.calls).toEqual([
    ['npm', ['run', 'coverage'], { stdio: 'inherit' }],
    ['npm', ['run', 'test:offline'], { stdio: 'inherit' }],
    ['npm', ['run', 'coverage:verify'], { stdio: 'inherit' }],
  ]);
  expect(vi.mocked(rmSync).mock.calls.map(([path]) => path)).toEqual(['coverage/frontend', 'coverage/tooling', 'coverage/native-unit', 'coverage/native']);
});

test.each([0, 1, 2])('final regeneration fails closed at stage %s', stage => {
  for (let i = 0; i < stage; i++) vi.mocked(execFileSync).mockReturnValueOnce('');
  vi.mocked(execFileSync).mockImplementationOnce(() => { throw new Error('validation failed'); });
  expect(refreshProbeCoverage).toThrow('validation failed');
  expect(execFileSync).toHaveBeenCalledTimes(stage + 1);
  expect(rmSync).toHaveBeenCalledTimes(4);
});
