import { beforeEach, expect, test, vi } from 'vitest';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { nativeCargo, nativeEnvironment, nativeReport, resetNativeCoverage } from '../../native-coverage';

vi.mock('node:child_process', () => {
  const api = { execFileSync: vi.fn() };
  return { ...api, default: api };
});
vi.mock('node:fs', () => {
  const api = { mkdirSync: vi.fn(), rmSync: vi.fn(), writeFileSync: vi.fn() };
  return { ...api, default: api };
});
beforeEach(() => {
  vi.clearAllMocks();
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
