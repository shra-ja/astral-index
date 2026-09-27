import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Each process reconstructs the same instrumentation environment without running tests. */
export function nativeEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env, CARGO_LLVM_COV_TARGET_DIR: resolve('src-tauri/target'), GDK_BACKEND: 'x11' };
  const exports = execFileSync('cargo', ['llvm-cov', 'show-env', '--sh'], {
    cwd: resolve('src-tauri'), env, encoding: 'utf8',
  });
  const instrumented: NodeJS.ProcessEnv = { ...env };
  for (const line of exports.trim().split('\n')) {
    const [, key, value] = /^export (\w+)=(.*)$/.exec(line)!;
    instrumented[key] = value.replace(/^'|'$/g, '');
  }
  instrumented.__CARGO_LLVM_COV_RUSTC_WRAPPER_RUSTFLAGS += '\x1f-Zcoverage-options=branch';
  return instrumented;
}

/** Start a new execution epoch; already frozen reports are independent snapshots. */
export function resetNativeCoverage(): void {
  mkdirSync('src-tauri/target', { recursive: true });
  writeFileSync('src-tauri/target/CACHEDIR.TAG', 'Signature: 8a477f597d28d172789f06886806bc55\n');
  nativeCargo(['llvm-cov', 'clean', '--workspace']);
}

export function nativeCargo(args: string[]): void {
  execFileSync('cargo', args, { cwd: resolve('src-tauri'), env: nativeEnvironment(), stdio: 'inherit' });
}

/** Replace the requested report only; JSON probes do not need rendered HTML. */
export function nativeReport(directory: string, html: boolean): void {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  nativeCargo(['llvm-cov', 'report', '--include-build-script', '--json', '--output-path', resolve(directory, 'coverage.json')]);
  if (html) nativeCargo(['llvm-cov', 'report', '--include-build-script', '--html', '--output-dir', resolve(directory)]);
}

/** Freeze unit evidence before integration execution. */
export function nativeUnitCoverage(html: boolean): void {
  rmSync('coverage/native-unit', { recursive: true, force: true });
  resetNativeCoverage();
  nativeCargo(['test', '--lib', '--locked', '--offline']);
  nativeReport('coverage/native-unit', html);
}

/** Regenerate authoritative evidence after all mutations have been restored. */
export function refreshProbeCoverage(): void {
  for (const directory of ['coverage/frontend', 'coverage/native-unit', 'coverage/native']) {
    rmSync(directory, { recursive: true, force: true });
  }
  for (const command of ['coverage', 'test:offline', 'coverage:verify']) {
    execFileSync('npm', ['run', command], { stdio: 'inherit' });
  }
}
