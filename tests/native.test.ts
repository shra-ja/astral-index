import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, rmSync, globSync } from 'node:fs';
import { beforeAll, expect, test } from 'vitest';

import { nativeCargo, nativeEnvironment } from '../scripts/native-coverage';

let nativeEnv: NodeJS.ProcessEnv;
beforeAll(() => {
  // Extraction now validates with HoYoverse: refuse to run where the synthetic key
  // could reach the live endpoint. The network namespace must have only loopback.
  const interfaces = readFileSync('/proc/self/net/dev', 'utf8').split('\n').slice(2)
    .map(line => line.split(':')[0].trim()).filter(Boolean);
  expect(interfaces, 'run the native test through test:offline').toEqual(['lo']);
  nativeEnv = nativeEnvironment();
  nativeCargo(['build', '--locked', '--offline']);
}, 600000);

// Native integration test; run inside Xvfb. No production test hooks or mocked runtime.
test('the bundled native shell works offline, supports keyboard selection, and closes cleanly', async () => {
  // Keep automatic discovery deterministic: never start Windows helpers from a WSL test host.
  const driver = spawn('tauri-driver', [], { env: { ...nativeEnv, WSL_DISTRO_NAME: '' }, stdio: 'inherit' });
  let session = '';
  // Surface WebDriver failures at the request boundary instead of later UI assertions.
  const request = async (path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:4444${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    expect(result.value?.error, JSON.stringify(result)).toBeUndefined();
    return result.value;
  };
  try {
    await expect.poll(async () => {
      try { return (await fetch('http://127.0.0.1:4444/status')).ok; }
      catch { return false; }
    }, { timeout: 10000 }).toBe(true);
    const created = await request('/session', 'POST', {
      capabilities: { alwaysMatch: { 'tauri:options': {
        application: resolve('src-tauri/target/debug/roll-tracker'),
      } } },
    });
    session = created.sessionId;
    // Inspect the real webview through its active native session.
    const execute = (script: string) => request(`/session/${session}/execute/sync`, 'POST', { script, args: [] });
    expect(await execute('return location.protocol')).toBe('tauri:');
    expect(await execute('return document.querySelector("h1").textContent')).toBe('Your rolls, kept local.');
    expect(await execute('return document.querySelector("[role=status]").textContent')).toContain('No Genshin Impact rolls yet');
    await execute('document.querySelector("select").focus()');
    await request(`/session/${session}/actions`, 'POST', { actions: [{ type: 'key', id: 'keyboard', actions: [
      { type: 'keyDown', value: '\uE015' }, { type: 'keyUp', value: '\uE015' },
      { type: 'keyDown', value: '\uE007' }, { type: 'keyUp', value: '\uE007' },
    ] }] });
    expect(await execute('return document.querySelector("[role=status]").textContent')).toContain('No Honkai: Star Rail rolls yet');
    expect(await execute('return document.documentElement.scrollWidth <= innerWidth')).toBe(true);
    const network = await request(`/session/${session}/execute/async`, 'POST', {
      script: `
        const done = arguments[arguments.length - 1];
        const timeout = setTimeout(() => done(null), 1000);
        document.addEventListener('securitypolicyviolation', event => {
          clearTimeout(timeout);
          done({ directive: event.effectiveDirective, disposition: event.disposition });
        }, { once: true });
        fetch('http://127.0.0.1:43199/csp-probe').catch(() => {});
      `, args: [],
    });
    expect(network, 'CSP must block webview connections').toEqual({ directive: 'connect-src', disposition: 'enforce' });
    // The capability grants only the manifest commands; results carry categories, never contexts.
    const commands = await request(`/session/${session}/execute/async`, 'POST', {
      script: `
        const done = arguments[arguments.length - 1];
        const invoke = window.__TAURI_INTERNALS__.invoke;
        Promise.all([
          invoke('extract_from_file', new TextEncoder().encode('no request')).then(() => 'resolved', JSON.stringify),
          invoke('read_arbitrary_file').then(() => 'resolved', String),
          invoke('cancel_acquisition').then(() => 'resolved', String),
        ]).then(done);
      `, args: [],
    });
    expect(commands[0]).toBe('{"kind":"no_request"}');
    expect(commands[1]).toContain('not allowed');
    expect(commands[2]).toBe('resolved');
    // Keyboard-operated automatic search fails safely here, then the real file input
    // sends a synthetic cache through raw IPC. Validation cannot reach HoYoverse offline.
    expect(await execute('return document.querySelector(".fallback").hidden')).toBe(false);
    await execute('document.querySelector(".retrieval button").focus()');
    await request(`/session/${session}/actions`, 'POST', { actions: [{ type: 'key', id: 'keyboard', actions: [
      { type: 'keyDown', value: '\uE007' }, { type: 'keyUp', value: '\uE007' },
    ] }] });
    const extractionStatus = 'return document.querySelector(".extraction-status").textContent';
    await expect.poll(() => execute(extractionStatus), { timeout: 10000 }).toContain('Automatic search needs Windows');
    mkdirSync('test-results', { recursive: true });
    const cachePath = resolve('test-results/synthetic-data_2');
    writeFileSync(cachePath, '1/0/https://public-operation-hkrpg-sg.hoyoverse.com/common/hkrpg_gacha_record/api/getGachaLog?authkey=synthetic&authkey_ver=1&sign_type=2&game_biz=hkrpg_global&lang=en\0');
    const input = await request(`/session/${session}/element`, 'POST', { using: 'css selector', value: '#cache-file' });
    await request(`/session/${session}/element/${Object.values(input)[0]}/value`, 'POST', { text: cachePath });
    await expect.poll(() => execute(extractionStatus), { timeout: 10000 }).toContain('We couldn’t reach HoYoverse.');
    expect(await execute('return document.querySelector("#cache-file").files.length')).toBe(1);
    rmSync(cachePath);
    const screenshot = await request(`/session/${session}/screenshot`);
    writeFileSync('test-results/native-shell.png', Buffer.from(screenshot, 'base64'));
    const windowId = execFileSync('xdotool', ['search', '--name', '^Roll Tracker$'], { encoding: 'utf8' }).trim().split('\n')[0];
    const pid = execFileSync('xdotool', ['getwindowpid', windowId], { encoding: 'utf8' }).trim();
    execFileSync('python3', ['tests/close-window.py', windowId]);
    await expect.poll(() => globSync(`src-tauri/target/src-tauri-${pid}-*.profraw`).length, { timeout: 10000 }).toBeGreaterThan(0);
  } finally {
    if (session) {
      await fetch(`http://127.0.0.1:4444/session/${session}`, { method: 'DELETE' }).catch(() => {});
    }
    driver.kill('SIGTERM');
    await once(driver, 'exit');
  }
}, 60000);
