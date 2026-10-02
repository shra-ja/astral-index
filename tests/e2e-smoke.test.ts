import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync, rmSync, globSync } from 'node:fs'
import { beforeAll, expect, test } from 'vitest'

import { backendCargo, backendEnvironment } from '../tooling/backend-coverage'

let backendEnv: NodeJS.ProcessEnv
beforeAll(() => {
  // Extraction now validates with HoYoverse: refuse to run where the synthetic key
  // could reach the live endpoint. The network namespace must have only loopback.
  const interfaces = readFileSync('/proc/self/net/dev', 'utf8')
    .split('\n')
    .slice(2)
    .map((line) => line.split(':')[0].trim())
    .filter(Boolean)
  if (interfaces.join() !== 'lo') throw new Error('run the native test through test:offline')
  backendEnv = backendEnvironment()
  backendCargo(['build', '--locked', '--offline'])
}, 600000)

// Native integration test; run inside Xvfb. No production test hooks or mocked runtime.
test('the bundled native shell works offline, supports keyboard navigation, and closes cleanly', async () => {
  // Keep automatic discovery deterministic: never start Windows helpers from a WSL test host.
  const driver = spawn('tauri-driver', [], {
    env: { ...backendEnv, WSL_DISTRO_NAME: '' },
    stdio: 'inherit',
  })
  let session = ''
  // Surface WebDriver failures at the request boundary instead of later UI assertions.
  const request = async <T = unknown>(path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:4444${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    // A WebDriver response's `value` has a different shape for each command, and
    // carries an `error` when the command failed.
    const result = (await response.json()) as { value?: { error?: unknown } }
    expect(result.value?.error, JSON.stringify(result)).toBeUndefined()
    return result.value as T
  }
  try {
    await expect
      .poll(
        async () => {
          try {
            return (await fetch('http://127.0.0.1:4444/status')).ok
          } catch {
            return false
          }
        },
        { timeout: 10000 },
      )
      .toBe(true)
    const created = await request<{ sessionId: string }>('/session', 'POST', {
      capabilities: {
        alwaysMatch: {
          'tauri:options': {
            application: resolve('src-tauri/target/debug/roll-tracker'),
          },
        },
      },
    })
    session = created.sessionId
    // Inspect the real webview through its active native session.
    const execute = (script: string) =>
      request(`/session/${session}/execute/sync`, 'POST', { script, args: [] })
    expect(await execute('return location.protocol')).toBe('tauri:')
    expect(await execute('return document.querySelector("h1").textContent')).toBe('Warp History')
    expect(await execute('return document.querySelector("[role=status]").textContent')).toContain(
      'No Warp History Yet',
    )
    mkdirSync('test-results', { recursive: true })
    await request(`/session/${session}/execute/async`, 'POST', {
      script: 'document.fonts.ready.then(() => arguments[arguments.length - 1]())',
      args: [],
    })
    const history = await request<string>(`/session/${session}/screenshot`)
    writeFileSync('test-results/e2e-history.png', Buffer.from(history, 'base64'))
    // The sidebar works from the keyboard: Enter on the Import link opens that screen.
    await execute('document.querySelector("nav a[aria-label=Import]").focus()')
    await request(`/session/${session}/actions`, 'POST', {
      actions: [
        {
          type: 'key',
          id: 'keyboard',
          actions: [
            { type: 'keyDown', value: '\uE007' },
            { type: 'keyUp', value: '\uE007' },
          ],
        },
      ],
    })
    await expect
      .poll(() => execute('return document.querySelector("h1").textContent'), { timeout: 5000 })
      .toBe('Import')
    const sources = await request<string>(`/session/${session}/screenshot`)
    writeFileSync('test-results/e2e-import.png', Buffer.from(sources, 'base64'))
    expect(await execute('return document.documentElement.scrollWidth <= innerWidth')).toBe(true)
    // The bundled typeface loads offline and styles the page (decision 0013).
    const font = await request(`/session/${session}/execute/async`, 'POST', {
      script: `
        const done = arguments[arguments.length - 1];
        document.fonts.ready.then(() => done({
          family: getComputedStyle(document.body).fontFamily.split(',')[0].trim(),
          loaded: [...document.fonts].some(
            face => face.family.includes('Hanken Grotesk') && face.status === 'loaded'),
        }));
      `,
      args: [],
    })
    expect(font).toEqual({ family: '"Hanken Grotesk Variable"', loaded: true })
    // The window never shrinks below the 480×560 design minimum (decision 0013).
    await request(`/session/${session}/window/rect`, 'POST', { width: 320, height: 320 })
    expect(await execute('return { width: innerWidth, height: innerHeight }')).toEqual({
      width: 480,
      height: 560,
    })
    const network = await request(`/session/${session}/execute/async`, 'POST', {
      script: `
        const done = arguments[arguments.length - 1];
        const timeout = setTimeout(() => done(null), 1000);
        document.addEventListener('securitypolicyviolation', event => {
          clearTimeout(timeout);
          done({ directive: event.effectiveDirective, disposition: event.disposition });
        }, { once: true });
        fetch('http://127.0.0.1:43199/csp-probe').catch(() => {});
      `,
      args: [],
    })
    expect(network, 'CSP must block webview connections').toEqual({
      directive: 'connect-src',
      disposition: 'enforce',
    })
    // The capability grants only the manifest commands; results carry categories, never contexts.
    const commands = await request<string[]>(`/session/${session}/execute/async`, 'POST', {
      script: `
        const done = arguments[arguments.length - 1];
        const invoke = window.__TAURI_INTERNALS__.invoke;
        Promise.all([
          invoke('extract_from_file', new TextEncoder().encode('no request')).then(() => 'resolved', JSON.stringify),
          invoke('read_arbitrary_file').then(() => 'resolved', String),
          invoke('cancel_acquisition').then(() => 'resolved', String),
          invoke('retrieve_history', {
            onProgress: '__CHANNEL__:' + window.__TAURI_INTERNALS__.transformCallback(() => {}),
          }).then(() => 'resolved', JSON.stringify),
          invoke('commit_import').then(() => 'resolved', JSON.stringify),
          invoke('discard_import').then(() => 'resolved', String),
        ]).then(done);
      `,
      args: [],
    })
    expect(commands[0]).toBe('{"kind":"no_request"}')
    expect(commands[1]).toContain('not allowed')
    expect(commands[2]).toBe('resolved')
    // Setup managed the database; nothing was validated, so nothing is retrieved.
    expect(commands[3]).toBe('{"kind":"no_context"}')
    // Nothing was retrieved, so nothing can be committed; discarding is harmless.
    expect(commands[4]).toBe('{"kind":"no_preview"}')
    expect(commands[5]).toBe('resolved')
    // Keyboard-operated automatic search fails safely here, then the real file input
    // sends a synthetic cache through raw IPC. Validation cannot reach HoYoverse offline.
    await execute('document.querySelector(".retrieval button").focus()')
    await request(`/session/${session}/actions`, 'POST', {
      actions: [
        {
          type: 'key',
          id: 'keyboard',
          actions: [
            { type: 'keyDown', value: '\uE007' },
            { type: 'keyUp', value: '\uE007' },
          ],
        },
      ],
    })
    const failure = 'return document.querySelector(".failed")?.textContent'
    await expect
      .poll(() => execute(failure), { timeout: 10000 })
      .toContain('Automatic search needs Windows')
    mkdirSync('test-results', { recursive: true })
    const cachePath = resolve('test-results/synthetic-data_2')
    writeFileSync(
      cachePath,
      '1/0/https://public-operation-hkrpg-sg.hoyoverse.com/common/hkrpg_gacha_record/api/getGachaLog?authkey=synthetic&authkey_ver=1&sign_type=2&game_biz=hkrpg_global&lang=en\0',
    )
    const input = await request<Record<string, string>>(`/session/${session}/element`, 'POST', {
      using: 'css selector',
      value: '#retry-cache-file',
    })
    await request(`/session/${session}/element/${Object.values(input)[0]}/value`, 'POST', {
      text: cachePath,
    })
    await expect
      .poll(() => execute(failure), { timeout: 10000 })
      .toContain('We couldn’t reach HoYoverse.')
    // The narrow window collapses the sidebar to icons.
    expect(
      await execute('return getComputedStyle(document.querySelector("nav .local .text")).display'),
    ).toBe('none')
    rmSync(cachePath)
    const screenshot = await request<string>(`/session/${session}/screenshot`)
    writeFileSync('test-results/e2e-smoke.png', Buffer.from(screenshot, 'base64'))
    const windowId = execFileSync('xdotool', ['search', '--name', '^Roll Tracker$'], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')[0]
    const pid = execFileSync('xdotool', ['getwindowpid', windowId], { encoding: 'utf8' }).trim()
    execFileSync('python3', ['tests/close-window-helper.py', windowId])
    await expect
      .poll(() => globSync(`src-tauri/target/src-tauri-${pid}-*.profraw`).length, {
        timeout: 10000,
      })
      .toBeGreaterThan(0)
  } finally {
    if (session) {
      await fetch(`http://127.0.0.1:4444/session/${session}`, { method: 'DELETE' }).catch(() => {})
    }
    driver.kill('SIGTERM')
    await once(driver, 'exit')
  }
}, 60000)
