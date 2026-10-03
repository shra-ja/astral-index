import { readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, expect, test } from 'vitest'

import { backendCargo, backendEnvironment } from '../tooling/backend-coverage'
import { ENTER, launch, type AppSession } from './app-driver'

let backendEnv: NodeJS.ProcessEnv
// A synthetic cache file holding one warp history request.
const cachePath = resolve('test-results/synthetic-data_2')
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
  // The mock feature also builds the mock debug binary (decision 0014).
  backendCargo(['build', '--locked', '--offline', '--features', 'mock'])
  mkdirSync('test-results', { recursive: true })
  writeFileSync(
    cachePath,
    '1/0/https://public-operation-hkrpg-sg.hoyoverse.com/common/hkrpg_gacha_record/api/getGachaLog?authkey=synthetic&authkey_ver=1&sign_type=2&game_biz=hkrpg_global&lang=en\0',
  )
}, 600000)

// Keep automatic discovery deterministic: never start Windows helpers from a WSL test host.
const environment = (extra: NodeJS.ProcessEnv = {}) => ({
  ...backendEnv,
  WSL_DISTRO_NAME: '',
  ...extra,
})
const textOf = (app: AppSession, selector: string) =>
  app.execute<string | undefined>(`return document.querySelector("${selector}")?.textContent`)
const heading = (app: AppSession) => textOf(app, 'h1')

// Native integration test; run inside Xvfb. No production test hooks or mocked runtime.
test('the bundled native shell works offline, supports keyboard navigation, and closes cleanly', async () => {
  const app = await launch('roll-tracker', environment())
  try {
    // Inspect the real webview through its active native session.
    expect(await app.execute('return location.protocol')).toBe('tauri:')
    expect(await heading(app)).toBe('Warp History')
    expect(await textOf(app, '[role=status]')).toContain('No Warp History Yet')
    await app.executeAsync('document.fonts.ready.then(() => arguments[arguments.length - 1]())')
    await app.screenshot('e2e-history')
    // The sidebar works from the keyboard: Enter on the Import link opens that screen.
    await app.execute('document.querySelector("nav a[aria-label=Import]").focus()')
    await app.press(ENTER)
    await expect.poll(() => heading(app), { timeout: 5000 }).toBe('Import')
    await app.screenshot('e2e-import')
    expect(await app.execute('return document.documentElement.scrollWidth <= innerWidth')).toBe(
      true,
    )
    // The bundled typeface loads offline and styles the page (decision 0013).
    const font = await app.executeAsync(`
      const done = arguments[arguments.length - 1];
      document.fonts.ready.then(() => done({
        family: getComputedStyle(document.body).fontFamily.split(',')[0].trim(),
        loaded: [...document.fonts].some(
          face => face.family.includes('Hanken Grotesk') && face.status === 'loaded'),
      }));
    `)
    expect(font).toEqual({ family: '"Hanken Grotesk Variable"', loaded: true })
    // The window never shrinks below the 480×560 design minimum (decision 0013).
    await app.command('/window/rect', 'POST', { width: 320, height: 320 })
    expect(await app.execute('return { width: innerWidth, height: innerHeight }')).toEqual({
      width: 480,
      height: 560,
    })
    const network = await app.executeAsync(`
      const done = arguments[arguments.length - 1];
      const timeout = setTimeout(() => done(null), 1000);
      document.addEventListener('securitypolicyviolation', event => {
        clearTimeout(timeout);
        done({ directive: event.effectiveDirective, disposition: event.disposition });
      }, { once: true });
      fetch('http://127.0.0.1:43199/csp-probe').catch(() => {});
    `)
    expect(network, 'CSP must block webview connections').toEqual({
      directive: 'connect-src',
      disposition: 'enforce',
    })
    // The capability grants only the manifest commands; results carry categories, never contexts.
    const commands = await app.executeAsync<string[]>(`
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
        invoke('history_page', { category: '99', page: 1, pageSize: 20 }).then(() => 'resolved', JSON.stringify),
      ]).then(done);
    `)
    expect(commands[0]).toBe('{"kind":"no_request"}')
    expect(commands[1]).toContain('not allowed')
    expect(commands[2]).toBe('resolved')
    // Setup managed the database; nothing was validated, so nothing is retrieved.
    expect(commands[3]).toBe('{"kind":"no_context"}')
    // Nothing was retrieved, so nothing can be committed; discarding is harmless.
    expect(commands[4]).toBe('{"kind":"no_preview"}')
    expect(commands[5]).toBe('resolved')
    // Stored history is readable through the capability; bad requests are refused.
    expect(commands[6]).toBe('{"kind":"invalid_request"}')
    // Keyboard-operated automatic search fails safely here, then the real file input
    // sends a synthetic cache through raw IPC. Validation cannot reach HoYoverse offline.
    await app.execute('document.querySelector(".retrieval button").focus()')
    await app.press(ENTER)
    await expect
      .poll(() => textOf(app, '.failed'), { timeout: 10000 })
      .toContain('Automatic search needs Windows')
    await app.chooseFile('#retry-cache-file', cachePath)
    await expect
      .poll(() => textOf(app, '.failed'), { timeout: 10000 })
      .toContain('We couldn’t reach HoYoverse.')
    // The narrow window collapses the sidebar to icons.
    expect(
      await app.execute(
        'return getComputedStyle(document.querySelector("nav .local .text")).display',
      ),
    ).toBe('none')
    await app.screenshot('e2e-smoke')
    await app.close()
  } finally {
    await app.dispose()
  }
}, 60000)

// The mock debug binary answers from a synthetic HoYoverse (decision 0014), so the whole
// flow runs with no network. Its history goes to its own folder in a fresh data home.
async function launchMock(scenario: string) {
  const data = resolve('test-results/mock-data')
  rmSync(data, { recursive: true, force: true })
  const app = await launch(
    'roll-tracker-mock',
    environment({ XDG_DATA_HOME: data, ROLL_TRACKER_MOCK_SCENARIO: scenario }),
  )
  return { app, database: resolve(data, 'roll-tracker-mock/history.sqlite') }
}
async function retrieveFromFile(app: AppSession) {
  // The first screen renders once the router has resolved it.
  await expect.poll(() => heading(app), { timeout: 10000 }).toBe('Warp History')
  await app.execute('document.querySelector("nav a[aria-label=Import]").click()')
  await expect.poll(() => heading(app), { timeout: 5000 }).toBe('Import')
  await app.chooseFile('#cache-file', cachePath)
}
const click = (app: AppSession, container: string, name: string) =>
  app.execute(
    `[...document.querySelectorAll("${container} button")].find(b => b.textContent.trim() === ${JSON.stringify(name)}).click()`,
  )

test('the mock binary retrieves, reviews and saves synthetic history, which persists', async () => {
  const { app, database } = await launchMock('history')
  try {
    await retrieveFromFile(app)
    await expect
      .poll(() => textOf(app, '.progress [role=status]'), { timeout: 10000 })
      .toContain('Retrieving')
    await app.screenshot('e2e-mock-progress')
    await expect
      .poll(() => textOf(app, '.review h2'), { timeout: 30000 })
      .toBe('Ready to save 2,060 new rolls')
    expect(await heading(app)).toBe('Review Import')
    expect(await textOf(app, '.review .account')).toContain('100000001')
    await app.screenshot('e2e-mock-review')
    await click(app, '.review', 'Save 2,060 rolls')
    await expect.poll(() => textOf(app, '.saved h2'), { timeout: 10000 }).toBe('2,060 Rolls Saved')
    // The mock's history has 32 five-star and 206 four-star rows (decision 0014).
    expect(
      await app.execute(
        'return [...document.querySelectorAll(".saved .stat-value")].map(value => value.textContent)',
      ),
    ).toEqual(['32', '206', '0'])
    // The saved history reads back a page at a time, newest first, never fetching.
    const history = (page: number) =>
      app.executeAsync<{
        account: { uid: string }
        total: number
        categories: { gacha_type: string; total: number }[]
        rolls: { number: number; id: string; time: string; rank_type: string }[]
      }>(
        `window.__TAURI_INTERNALS__.invoke('history_page', { category: '11', page: ${page}, pageSize: 20 }).then(arguments[arguments.length - 1])`,
      )
    const first = await history(1)
    expect([first.account.uid, first.total, first.rolls.length]).toEqual(['100000001', 1250, 20])
    // Each page also counts every category, as the mock serves them.
    expect(first.categories).toEqual(
      [
        ['1', 300],
        ['2', 50],
        ['11', 1250],
        ['12', 412],
        ['21', 38],
        ['22', 10],
      ].map(([gacha_type, total]) => ({ gacha_type, total })),
    )
    expect(first.rolls[0]).toEqual(
      expect.objectContaining({
        number: 1250,
        id: '1800000000110000000',
        time: '2026-09-28 21:03:03',
      }),
    )
    const last = await history(63)
    expect(last.rolls.map((roll) => roll.number)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
    await app.screenshot('e2e-mock-saved')
    expect(existsSync(database)).toBe(true)
    // A second retrieval finds everything already saved.
    await click(app, '.saved', 'Done')
    await app.chooseFile('#cache-file', cachePath)
    await expect
      .poll(() => textOf(app, '.review h2'), { timeout: 30000 })
      .toBe('Everything here is already saved')
    await click(app, '.review', 'Done')
    await expect
      .poll(() => textOf(app, '.start .note'), { timeout: 10000 })
      .toContain('Your saved history is already up to date.')
    await app.close()
  } finally {
    await app.dispose()
  }
}, 120000)

test('a mock retrieval that loses the network says where it stopped and saves nothing', async () => {
  const { app, database } = await launchMock('network-failure')
  try {
    await retrieveFromFile(app)
    await expect
      .poll(() => textOf(app, '.failed h2'), { timeout: 30000 })
      .toBe('Couldn’t Reach HoYoverse')
    expect(await textOf(app, '.failed')).toContain(
      'Retrieval stopped at Light Cone Event Warp, page 1.',
    )
    await app.screenshot('e2e-mock-failed')
    expect(existsSync(database)).toBe(false)
    await app.close()
  } finally {
    await app.dispose()
    rmSync(cachePath, { force: true })
  }
}, 60000)
