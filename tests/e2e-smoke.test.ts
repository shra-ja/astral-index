import {
  copyFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, expect, test } from 'vitest'

import { backendCargo, backendEnvironment } from '../tooling/backend-coverage'
import { accessibilityViolations } from './accessibility'
import { DOWN, ENTER, ESCAPE, RIGHT, TAB, launch, type AppSession } from './app-driver'
import { outputs } from '../tooling/outputs'

let backendEnv: NodeJS.ProcessEnv
// A synthetic cache file holding one warp history request, with a key distinctive
// enough to search the app's files for.
const authKey = 'synthetic-e2e-auth-key'
const { results } = outputs()
const cachePath = resolve(results, 'synthetic-data_2')
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
  mkdirSync(results, { recursive: true })
  // Failure snapshots from an earlier run would pass for this run's.
  for (const name of readdirSync(results).filter((name) => name.startsWith('failed-'))) {
    rmSync(resolve(results, name))
  }
  writeFileSync(
    cachePath,
    `1/0/https://public-operation-hkrpg-sg.hoyoverse.com/common/hkrpg_gacha_record/api/getGachaLog?authkey=${authKey}&authkey_ver=1&sign_type=2&game_biz=hkrpg_global&lang=en\0`,
  )
}, 600000)
afterAll(() => rmSync(cachePath, { force: true }))

// Keep automatic discovery deterministic: never start Windows helpers from a WSL test host.
const environment = (extra: NodeJS.ProcessEnv = {}) => ({
  ...backendEnv,
  WSL_DISTRO_NAME: '',
  ...extra,
})
const textOf = (app: AppSession, selector: string) =>
  app.execute<string | undefined>(`return document.querySelector("${selector}")?.textContent`)
const heading = (app: AppSession) => textOf(app, 'h1')
/** The tooltip of the element matching `selector`: its text, whether it shows, and where. */
const tooltipFor = (app: AppSession, selector: string) =>
  app.execute<{ text: string; shown: boolean; inWindow: boolean; overlaps: boolean }>(`
    const target = document.querySelector(${JSON.stringify(selector)});
    const tip = target.parentElement.querySelector('[role=tooltip]');
    const own = target.getBoundingClientRect(), box = tip.getBoundingClientRect();
    return {
      text: tip.textContent,
      shown: getComputedStyle(tip).display !== 'none',
      inWindow: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
      overlaps: box.left < own.right && own.left < box.right && box.top < own.bottom && own.top < box.bottom,
    };
  `)
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms))
/** The scrollbar style of the element matching `selector`, as computed. */
const scrollbarOf = (app: AppSession, selector: string) =>
  app.execute<{ width: string; color: string }>(`
    const style = getComputedStyle(document.querySelector(${JSON.stringify(selector)}));
    return { width: style.scrollbarWidth, color: style.scrollbarColor };
  `)
// Every scrolling area's thin scrollbar: a --text-faint thumb, at least 3:1 against
// every background, on a transparent track.
const appScrollbar = { width: 'thin', color: 'rgb(95, 103, 115) rgba(0, 0, 0, 0)' }
// The sidebar's open lockup as drawn: the emblem's size in CSS px and colour, the gap
// to the wordmark, and whether the bundled wordmark loaded and still names the app.
const lockup = (app: AppSession) =>
  app.execute(`
    const emblem = document.querySelector('nav .brand .astral-emblem');
    const wordmark = document.querySelector('nav .brand img');
    const [e, w] = [emblem, wordmark].map(el => el.getBoundingClientRect());
    const round = n => Math.round(n * 10) / 10;
    return {
      emblem: [round(e.width), round(e.height), getComputedStyle(emblem).color],
      gap: round(w.left - e.right),
      wordmark: [round(w.height), round(w.width), wordmark.alt, wordmark.naturalWidth > 0],
      centred: Math.abs((e.top + e.bottom) / 2 - (w.top + w.bottom) / 2) < 0.5,
    };
  `)

// Native integration test; run inside Xvfb. No production test hooks or mocked runtime.
test('the bundled native shell works offline, supports keyboard navigation, and closes cleanly', async () => {
  const app = await launch('astral-index', environment())
  try {
    // Inspect the real webview through its active native session.
    expect(await app.execute('return location.protocol')).toBe('tauri:')
    expect(await app.execute('return document.title')).toBe('Astral Index')
    // Without ASTRAL_INDEX_SIZE_OVERLAY, no size overlay is shown.
    expect(await app.execute('return document.querySelector(".size-overlay") === null')).toBe(true)
    // The first screen renders once the router resolves, and its empty state once the
    // saved history has been read, so wait for each rather than reading once.
    await expect.poll(() => heading(app), { timeout: 10000 }).toBe('Warp History')
    await expect
      .poll(() => textOf(app, '[role=status]'), { timeout: 10000 })
      .toContain('No Warp History Yet')
    // A release build hides Genshin Impact (decision 0026): the sidebar offers Star Rail
    // alone, nothing names Genshin Impact, and its addresses return to Star Rail's history.
    expect(
      await app.execute(`return [...document.querySelectorAll('nav [aria-labelledby=sidebar-games] a')]
        .map((link) => link.getAttribute('aria-label'))`),
    ).toEqual(['Honkai: Star Rail'])
    expect(await app.execute('return document.body.textContent.includes("Genshin")')).toBe(false)
    await app.execute(`location.hash = '#/genshin-impact/import'`)
    await expect
      .poll(() => app.execute('return location.hash'), { timeout: 5000 })
      .toBe('#/honkai-star-rail/history')
    expect(await heading(app)).toBe('Warp History')
    await app.executeAsync('document.fonts.ready.then(() => arguments[arguments.length - 1]())')
    // Every screen and step passes the accessibility audit (decision 0028).
    expect(await accessibilityViolations(app)).toEqual([])
    await app.screenshot('e2e-history')
    // The window opens wide enough for the full sidebar, which collapses at 1100px.
    expect(await app.execute('return { width: innerWidth, height: innerHeight }')).toEqual({
      width: 1200,
      height: 760,
    })
    // The sidebar shows the brand's open lockup from the bundled files, sized from the
    // wordmark's height H, 18 px: the emblem without a tile, cropped to its artwork,
    // 1.338 H high (1.953 H, 35.15 px, wide), then a 0.4 H gap.
    expect(await lockup(app)).toEqual({
      emblem: [35.1, 24.1, 'rgb(250, 249, 245)'],
      gap: 7.2,
      wordmark: [18, 130, 'Astral Index', true],
      centred: true,
    })
    // The expanded sidebar shows its links' names, so their tooltips stay hidden.
    const importLink = 'nav a[aria-label=Import]'
    expect(
      await app.execute(
        `return getComputedStyle(document.querySelector("${importLink} .text")).display`,
      ),
    ).not.toBe('none')
    await app.hover(importLink)
    await pause(600)
    expect(await tooltipFor(app, importLink)).toMatchObject({ text: 'Import', shown: false })
    await app.hover('h1')
    // The sidebar works from the keyboard: Enter on the Import link opens that screen.
    await app.execute('document.querySelector("nav a[aria-label=Import]").focus()')
    await app.press(ENTER)
    await expect.poll(() => heading(app), { timeout: 5000 }).toBe('Import')
    expect(await accessibilityViolations(app)).toEqual([])
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
    // Collapsed, the sidebar shows the emblem alone, as large; the hidden wordmark still
    // names the app.
    expect(await lockup(app)).toMatchObject({
      emblem: [35.1, 24.1, 'rgb(250, 249, 245)'],
      wordmark: [1, 1, 'Astral Index', true],
    })
    // Collapsed to icons, the sidebar names its links in themed tooltips (decision 0013):
    // after a pause under the pointer, beside the link and inside the window.
    await app.hover(importLink)
    await expect
      .poll(() => tooltipFor(app, importLink), { timeout: 5000 })
      .toEqual({ text: 'Import', shown: true, inWindow: true, overlaps: false })
    // Escape hides it without moving the pointer.
    await app.press(ESCAPE)
    await expect.poll(async () => (await tooltipFor(app, importLink)).shown).toBe(false)
    // Tabbing onto a link shows its tooltip too, with the pointer elsewhere.
    await app.hover('h1')
    await app.execute(`document.querySelector("nav a[aria-label='Warp History']").focus()`)
    await app.press(TAB)
    expect(await app.execute('return document.activeElement.getAttribute("aria-label")')).toBe(
      'Import',
    )
    await expect
      .poll(() => tooltipFor(app, importLink), { timeout: 5000 })
      .toEqual({ text: 'Import', shown: true, inWindow: true, overlaps: false })
    // File import is coming soon: its button stays focusable, and its tooltip says why.
    const fileImport = '[aria-labelledby=source-file] button'
    await app.hover(fileImport)
    await expect
      .poll(() => tooltipFor(app, fileImport), { timeout: 5000 })
      .toEqual({
        text: 'Importing from a file isn’t available yet.',
        shown: true,
        inWindow: true,
        overlaps: false,
      })
    await app.screenshot('e2e-tooltip')
    await app.hover('h1')
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
        invoke('extract_from_file', new TextEncoder().encode('ignored body')).then(() => 'resolved', JSON.stringify),
        invoke('read_arbitrary_file').then(() => 'resolved', String),
        invoke('cancel_acquisition').then(() => 'resolved', String),
        invoke('retrieve_history', {
          mode: 'full',
          onProgress: '__CHANNEL__:' + window.__TAURI_INTERNALS__.transformCallback(() => {}),
        }).then(() => 'resolved', JSON.stringify),
        invoke('retrieve_history', {
          mode: 'partial',
          onProgress: '__CHANNEL__:' + window.__TAURI_INTERNALS__.transformCallback(() => {}),
        }).then(() => 'resolved', JSON.stringify),
        invoke('commit_import').then(() => 'resolved', JSON.stringify),
        invoke('discard_import').then(() => 'resolved', String),
        invoke('history_page', { category: '99', page: 1, pageSize: 20 }).then(() => 'resolved', JSON.stringify),
      ]).then(done);
    `)
    // The file is chosen in the system's dialog, which only the mock's tests can
    // answer; with nothing chosen, reading is refused and a body is ignored, as no
    // file's bytes cross IPC (decision 0034).
    expect(commands[0]).toBe('{"kind":"invalid_file"}')
    expect(commands[1]).toContain('not allowed')
    expect(commands[2]).toBe('resolved')
    // Setup managed the database; nothing was validated, so nothing is retrieved.
    expect(commands[3]).toBe('{"kind":"no_context"}')
    // An unknown retrieval mode is refused before anything else.
    expect(commands[4]).toBe('{"kind":"invalid_request"}')
    // Nothing was retrieved, so nothing can be committed; discarding is harmless.
    expect(commands[5]).toBe('{"kind":"no_preview"}')
    expect(commands[6]).toBe('resolved')
    // Stored history is readable through the capability; bad requests are refused.
    expect(commands[7]).toBe('{"kind":"invalid_request"}')
    // The About dialog's details: the version and the data folder in use. Opening is
    // left to the mock binary's test, so this run never launches a file manager.
    const info = await app.executeAsync<{ version: string; folder: string; portable: boolean }>(
      `const done = arguments[arguments.length - 1];
      window.__TAURI_INTERNALS__.invoke('app_info').then(done, (error) => done(String(error)))`,
    )
    // Test builds carry no version or build identity (decision 0030).
    expect(info).toMatchObject({ version: '0.0.0', build: { kind: 'local' }, portable: false })
    expect(info.folder).toMatch(/[/\\]astral-index$/)
    // Keyboard-operated automatic search fails safely here.
    await app.execute('document.querySelector(".retrieval button").focus()')
    await app.press(ENTER)
    await expect
      .poll(() => textOf(app, '.failed'), { timeout: 10000 })
      .toContain('Automatic search needs Windows')
    // The narrow window collapses the sidebar to icons.
    expect(
      await app.execute(
        'return getComputedStyle(document.querySelector("nav .local .text")).display',
      ),
    ).toBe('none')
    expect(await accessibilityViolations(app)).toEqual([])
    await app.screenshot('e2e-smoke')
    await app.close()
  } catch (error) {
    await snapshotFailure(app)
    throw error
  } finally {
    await app.dispose()
  }
}, 60000)

// The mock debug binary answers from a synthetic HoYoverse (decision 0014), so the whole
// flow runs with no network. Its history goes to its own folder in a data home that
// starts fresh, unless `keep` relaunches it on the data saved so far, as a restart.
const mockData = resolve(results, 'mock-data')
async function launchMock(
  scenario: string,
  { env = {}, keep = false }: { env?: NodeJS.ProcessEnv; keep?: boolean } = {},
) {
  if (!keep) rmSync(mockData, { recursive: true, force: true })
  // A module cached by an earlier run, which the mock must not reuse.
  const staleCache = resolve(mockData, 'astral-index-mock/webview/WebKitCache/stale-module')
  mkdirSync(resolve(staleCache, '..'), { recursive: true })
  writeFileSync(staleCache, 'cached before a refactor')
  const app = await launch(
    'astral-index-mock',
    environment({ XDG_DATA_HOME: mockData, ASTRAL_INDEX_MOCK_SCENARIO: scenario, ...env }),
  )
  await traceIpc(app)
  return {
    app,
    database: resolve(mockData, 'astral-index-mock/history.sqlite'),
    staleCache,
  }
}
/**
 * Record each IPC command the webview sends, with when it was sent and answered,
 * for a failure snapshot to show; only names and times, never arguments. Tauri's
 * `invoke` can't be replaced, but it sends each command with `fetch`.
 */
async function traceIpc(app: AppSession) {
  await app.execute(`
    const send = window.fetch.bind(window);
    const now = () => Math.round(performance.now());
    window.ipcTrace = [];
    window.fetch = (resource, init) => {
      const url = String(resource instanceof Request ? resource.url : resource);
      if (!url.startsWith('ipc:') && !url.includes('ipc.localhost')) return send(resource, init);
      const call = { command: decodeURIComponent(url.split('/').pop()), sent: now() };
      window.ipcTrace = [...window.ipcTrace, call].slice(-50);
      return send(resource, init).then(
        (response) => ((call.answered = now()), response),
        (failure) => ((call.failed = now()), Promise.reject(failure)),
      );
    };
  `)
}
/**
 * Save what the window shows when a test fails, before the app closes, as CI keeps
 * `test-results/` but not the window: a screenshot and the text of the screen,
 * named `failed-` and the test's name.
 */
async function snapshotFailure(app: AppSession) {
  const test = expect.getState().currentTestName ?? 'test'
  const name = `failed-${test
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 60)}`
  await app.screenshot(name).catch(() => undefined)
  const text = await app
    .execute<string>(`return (document.querySelector('main') ?? document.body).innerText`)
    .catch(() => '')
  // Whether IPC still answers at all, and what the webview sent before.
  const probe = await app
    .executeAsync<string>(
      `const done = arguments[arguments.length - 1];
      const started = performance.now();
      const late = new Promise((resolve) => setTimeout(() => resolve('no answer'), 3000));
      Promise.race([window.__TAURI_INTERNALS__.invoke('app_info').then(() => 'answered', () => 'failed'), late])
        .then((outcome) => done(outcome + ' after ' + Math.round(performance.now() - started) + ' ms'));`,
    )
    .catch((error: unknown) => `not run: ${String(error)}`)
  const trace = await app
    .execute<unknown>(`return [window.ipcTrace ?? null, Math.round(performance.now())]`)
    .catch(() => null)
  writeFileSync(
    resolve(results, `${name}.txt`),
    `${text}\n\n--- IPC probe (app_info, 3 s limit): ${probe}\n--- IPC calls and the time now, in ms since the page loaded:\n${JSON.stringify(trace, null, 1)}\n`,
  )
}
/** Run `steps` in the mock, then close it as a user would. */
async function withMock(
  scenario: string,
  options: Parameters<typeof launchMock>[1],
  steps: (app: AppSession, database: string) => Promise<void>,
) {
  const { app, database } = await launchMock(scenario, options)
  try {
    await steps(app, database)
    await app.close()
  } catch (error) {
    await snapshotFailure(app)
    throw error
  } finally {
    await app.dispose()
  }
}
/** The files under the mock's data home, its webview profile included, holding the auth key. */
const filesHoldingAuthKey = () =>
  readdirSync(mockData, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => readFileSync(path).includes(authKey))
/** The stored account and every category's count, read without retrieving. */
async function stored(app: AppSession) {
  const page = await app.executeAsync<{
    account: { uid: string } | null
    categories: { gacha_type: string; total: number }[]
  }>(
    `window.__TAURI_INTERNALS__.invoke('history_page', { category: '11', page: 1, pageSize: 20 }).then(arguments[arguments.length - 1])`,
  )
  return {
    uid: page.account?.uid ?? null,
    totals: Object.fromEntries(
      page.categories.map((category) => [category.gacha_type, category.total]),
    ),
  }
}
// No account yet, and an empty count for every category.
const nothingSaved = {
  uid: null,
  totals: { '1': 0, '2': 0, '11': 0, '12': 0, '21': 0, '22': 0 },
}
// The mock's full history, as `stored` reads it (decision 0014).
const savedHistory = {
  uid: '100000001',
  totals: { '1': 300, '2': 50, '11': 1250, '12': 412, '21': 38, '22': 10 },
}
/**
 * Each stored account, rolls or not, with its roll count and a digest of its rows, read from the closed
 * mock's database file, so a later import can be shown to leave them unchanged.
 */
function storedAccounts() {
  const database = new DatabaseSync(resolve(mockData, 'astral-index-mock/history.sqlite'), {
    readOnly: true,
  })
  try {
    const rows = database
      .prepare('SELECT uid, server, id, payload, first_batch FROM rolls ORDER BY uid, server, id')
      .all() as { uid: string; server: string; id: string; payload: string; first_batch: number }[]
    const stored = database
      .prepare('SELECT uid, server FROM accounts ORDER BY uid, server')
      .all() as {
      uid: string
      server: string
    }[]
    const accounts: Record<string, { rolls: number; digest: string }> = {}
    for (const account of stored.map((row) => `${row.uid} ${row.server}`)) {
      const own = rows.filter((row) => `${row.uid} ${row.server}` === account)
      accounts[account] = {
        rolls: own.length,
        digest: createHash('sha256').update(JSON.stringify(own)).digest('hex'),
      }
    }
    return accounts
  } finally {
    database.close()
  }
}
/** Ask, as the webview could, to retrieve and to save, outside the import flow. */
const retrieveAndSave = (app: AppSession) =>
  app.executeAsync<string[]>(`
    const done = arguments[arguments.length - 1];
    const invoke = window.__TAURI_INTERNALS__.invoke;
    Promise.all([
      invoke('retrieve_history', {
        mode: 'new',
        onProgress: '__CHANNEL__:' + window.__TAURI_INTERNALS__.transformCallback(() => {}),
      }).then(() => 'resolved', JSON.stringify),
      invoke('commit_import').then(() => 'resolved', JSON.stringify),
    ]).then(done);
  `)
// Without a validated link nothing is retrieved, and without a review nothing is saved.
const refused = ['{"kind":"no_context"}', '{"kind":"no_preview"}']
async function retrieveFromFile(app: AppSession) {
  // The first screen renders once the router has resolved it.
  await expect.poll(() => heading(app), { timeout: 10000 }).toBe('Warp History')
  await app.execute('document.querySelector("nav a[aria-label=Import]").click()')
  await expect.poll(() => heading(app), { timeout: 5000 }).toBe('Import')
  await chooseCache(app)
}
/**
 * Choose the synthetic cache file as the mock answers its native dialog, from
 * `cache-from.txt` in its data folder (decision 0034).
 */
async function chooseCache(app: AppSession) {
  const folder = resolve(mockData, 'astral-index-mock')
  mkdirSync(folder, { recursive: true })
  writeFileSync(resolve(folder, 'cache-from.txt'), `${cachePath}\n`)
  await app.execute(`document.querySelector('#cache-file').click()`)
}
const skipped = (app: AppSession) =>
  app.execute<string | undefined>(
    'return [...document.querySelectorAll(".review .stat")].find(stat => stat.querySelector(".stat-label").textContent === "Existing rolls skipped")?.querySelector(".stat-value").textContent',
  )
/**
 * Whether a status card sits in the middle of its screen, across and down, or, when it
 * is taller than the screen, centred across and starting at the top. The screen
 * carries its step as a class too, so the card is matched as its child.
 */
const centredCard = (app: AppSession, card: string) =>
  app.execute<boolean>(`
    const element = document.querySelector('.retrieval');
    const screen = element.getBoundingClientRect();
    const box = element.querySelector(':scope > ${card}').getBoundingClientRect();
    const top = screen.top + parseFloat(getComputedStyle(element).paddingTop);
    const across = Math.abs((screen.left + screen.right) / 2 - (box.left + box.right) / 2) <= 2;
    const fits = box.height <= element.clientHeight - 2 * (top - screen.top);
    const down = fits
      ? Math.abs((screen.top + screen.bottom) / 2 - (box.top + box.bottom) / 2) <= 2
      : Math.abs(box.top - top) <= 1;
    return across && down;
  `)
const click = (app: AppSession, container: string, name: string) =>
  app.execute(
    `[...document.querySelectorAll("${container} button")].find(b => b.textContent.trim() === ${JSON.stringify(name)}).click()`,
  )

test('the mock binary records what the About dialog opens, and reports a failed opening', async () => {
  await withMock('history', {}, async (app) => {
    const folder = resolve(mockData, 'astral-index-mock')
    const record = resolve(folder, 'opened.txt')
    const call = (command: string) =>
      app.executeAsync<string>(`
        window.__TAURI_INTERNALS__.invoke('${command}')
          .then(() => 'resolved', (error) => typeof error === 'string' ? error : JSON.stringify(error))
          .then(arguments[arguments.length - 1])`)
    // The History screen's first read creates the database, so it is shown selected.
    await expect
      .poll(() => textOf(app, '[role=status]'), { timeout: 10000 })
      .toContain('No Warp History Yet')
    const info = await app.executeAsync(`
      const done = arguments[arguments.length - 1];
      window.__TAURI_INTERNALS__.invoke('app_info').then(done, (error) => done(String(error)))`)
    expect(info).toEqual({
      version: '0.0.0',
      build: { kind: 'local' },
      folder,
      file: resolve(folder, 'history.sqlite'),
      portable: false,
    })
    expect(await call('reveal_data_folder')).toBe('resolved')
    expect(readFileSync(record, 'utf8')).toBe(`reveal ${resolve(folder, 'history.sqlite')}\n`)
    expect(await call('open_issues_page')).toBe('resolved')
    expect(readFileSync(record, 'utf8')).toBe(
      'browse https://github.com/shra-ja/astral-index/issues\n',
    )
    // A folder in the record's place makes opening fail, reported by kind alone.
    rmSync(record)
    mkdirSync(record)
    expect(await call('reveal_data_folder')).toBe('{"kind":"open_failed"}')
    expect(await call('open_issues_page')).toBe('{"kind":"open_failed"}')
  })
}, 60000)

test('Backup & Restore saves a checked backup and checks one to restore, where the mock answers', async () => {
  const backups = resolve(results, 'e2e-backups')
  rmSync(backups, { recursive: true, force: true })
  mkdirSync(backups, { recursive: true })
  const backup = resolve(backups, 'history-copy.sqlite')
  await withMock('history', {}, async (app) => {
    const folder = resolve(mockData, 'astral-index-mock')
    const answer = resolve(folder, 'save-as.txt')
    await retrieveFromFile(app)
    await expect.poll(() => textOf(app, '.review h2'), { timeout: 30000 }).toMatch(/^Ready to save/)
    await click(app, '.review', 'Save 2,060 rolls')
    await expect.poll(() => textOf(app, '.saved h2'), { timeout: 10000 }).toBe('2,060 Rolls Saved')
    await app.execute(`document.querySelector('nav a[aria-label="Backup & Restore"]').click()`)
    await expect.poll(() => heading(app), { timeout: 5000 }).toBe('Backup & Restore')
    // The screen is app-wide (decision 0033): its address and the sidebar name no game.
    expect(await app.execute('return location.hash')).toBe('#/backup')
    expect(
      await app.execute(`return [...document.querySelectorAll('nav [aria-current]')]
        .map((link) => link.getAttribute('aria-label'))`),
    ).toEqual(['Backup & Restore'])
    await expect
      .poll(() => textOf(app, 'main .path'), { timeout: 5000 })
      .toBe(resolve(folder, 'history.sqlite'))
    const status = () => textOf(app, "main [role='status']")
    // The mock answers the save dialog with the path its tests write.
    writeFileSync(answer, `${backup}\n`)
    await click(app, 'main', 'Save backup…')
    await expect.poll(status, { timeout: 10000 }).toContain('Saved history-copy.sqlite')
    // Cancelling the dialog writes nothing more.
    rmSync(answer)
    await click(app, 'main', 'Save backup…')
    await expect.poll(status, { timeout: 10000 }).toBe('')
    // A folder that does not exist fails, leaving no partial file.
    const missing = resolve(backups, 'missing', 'copy.sqlite')
    writeFileSync(answer, missing)
    await click(app, 'main', 'Save backup…')
    await expect
      .poll(status, { timeout: 10000 })
      .toContain('The backup couldn’t be saved there. Choose another folder and try again.')
    // Restoring that backup: the mock answers the open dialog with the path its tests
    // write. The copy is checked in the data folder and compared with the history.
    const restoreFrom = resolve(folder, 'restore-from.txt')
    const held = resolve(folder, 'restore.sqlite.partial')
    writeFileSync(restoreFrom, `${backup}\n`)
    await click(app, 'main', 'Restore from backup…')
    await expect.poll(() => heading(app), { timeout: 10000 }).toBe('Restore Backup')
    expect(await textOf(app, 'header .source')).toBe('Restoring from history-copy.sqlite')
    expect(await textOf(app, '#in-backup + .tag')).toBe('Becomes your history')
    expect(
      await app.execute(
        `return [...document.querySelectorAll('main section .value')].map((value) => value.textContent)`,
      ),
    ).toEqual(['2,060', '1', '2,060', '1'])
    expect(await textOf(app, 'main .footnote')).toBe(
      'Restoring replaces 2,060 rolls in 1 account with 2,060 rolls in 1 account.',
    )
    expect(await app.execute(`return document.activeElement.classList.contains('intro')`)).toBe(
      true,
    )
    expect(existsSync(held)).toBe(true)
    // Cancel drops the held copy, and focus returns.
    await click(app, 'main footer', 'Cancel')
    await expect.poll(() => heading(app), { timeout: 5000 }).toBe('Backup & Restore')
    await expect.poll(() => existsSync(held), { timeout: 5000 }).toBe(false)
    expect(await app.execute(`return document.activeElement.textContent.trim()`)).toBe(
      'Restore from backup…',
    )
    // Leaving a held backup's confirmation asks first; Leave cancels the restore.
    await click(app, 'main', 'Restore from backup…')
    await expect.poll(() => heading(app), { timeout: 10000 }).toBe('Restore Backup')
    expect(existsSync(held)).toBe(true)
    await app.execute(`document.querySelector('nav a[aria-label="Import"]').click()`)
    await expect
      .poll(() => textOf(app, 'dialog.leave-restore h2'), { timeout: 5000 })
      .toBe('Leave Without Restoring?')
    expect(await app.execute(`return document.activeElement.textContent.trim()`)).toBe('Stay')
    await click(app, 'dialog.leave-restore', 'Leave')
    await expect.poll(() => heading(app), { timeout: 5000 }).toBe('Import')
    await expect.poll(() => existsSync(held), { timeout: 5000 }).toBe(false)
    await app.execute(`document.querySelector('nav a[aria-label="Backup & Restore"]').click()`)
    await expect.poll(() => heading(app), { timeout: 5000 }).toBe('Backup & Restore')
    // A file that isn't a backup is refused, and nothing is left in the data folder.
    const notes = resolve(results, 'e2e-not-a-backup.sqlite')
    writeFileSync(notes, 'not a database, just some text that is long enough')
    writeFileSync(restoreFrom, notes)
    await click(app, 'main', 'Restore from backup…')
    await expect
      .poll(() => textOf(app, "#restore-title ~ .actions [role='status']"), { timeout: 10000 })
      .toContain('This file isn’t an Astral Index backup.')
    expect(existsSync(held)).toBe(false)
    rmSync(notes)
  })
  // The backup is the closed app's history, checked: this app's, version 2, intact.
  expect(readdirSync(backups)).toEqual(['history-copy.sqlite'])
  const copy = new DatabaseSync(backup, { readOnly: true })
  try {
    const value = (sql: string) => Object.values(copy.prepare(sql).get()!)[0]
    expect(value('PRAGMA application_id')).toBe(1381257795)
    expect(value('PRAGMA user_version')).toBe(2)
    expect(value('PRAGMA integrity_check')).toBe('ok')
    expect(value('SELECT count(*) FROM rolls')).toBe(2060)
  } finally {
    copy.close()
  }
}, 120000)

test('Restore replaces the history with a backup, keeping the history as a safety copy, which can be restored', async () => {
  const backups = resolve(results, 'e2e-restore')
  rmSync(backups, { recursive: true, force: true })
  mkdirSync(backups, { recursive: true })
  const backup = resolve(backups, 'smaller.sqlite')
  const folder = resolve(mockData, 'astral-index-mock')
  const restoreStatus = "#restore-title ~ .actions [role='status']"
  const firstTab = "[aria-label='Category summary'] .tile .value"
  const toBackup = async (app: AppSession) => {
    await app.execute(`document.querySelector('nav a[aria-label="Backup & Restore"]').click()`)
    await expect.poll(() => heading(app), { timeout: 5000 }).toBe('Backup & Restore')
  }
  let removed = 0
  let safety = ''
  await withMock('history', {}, async (app) => {
    // While a review awaits saving, restoring is refused before any dialog opens.
    await retrieveFromFile(app)
    await expect.poll(() => textOf(app, '.review h2'), { timeout: 30000 }).toMatch(/^Ready to save/)
    await toBackup(app)
    writeFileSync(resolve(folder, 'restore-from.txt'), `${backup}\n`)
    await click(app, 'main', 'Restore from backup…')
    await expect
      .poll(() => textOf(app, restoreStatus), { timeout: 10000 })
      .toContain('Finish or discard the import first, then restore the backup.')
    await app.execute('document.querySelector("nav a[aria-label=Import]").click()')
    await expect.poll(() => textOf(app, '.review h2'), { timeout: 5000 }).toMatch(/^Ready to save/)
    await click(app, '.review', 'Save 2,060 rolls')
    await expect.poll(() => textOf(app, '.saved h2'), { timeout: 10000 }).toBe('2,060 Rolls Saved')
    // A backup of that history, with the first ten rolls of each category removed.
    await toBackup(app)
    writeFileSync(resolve(folder, 'save-as.txt'), `${backup}\n`)
    await click(app, 'main', 'Save backup…')
    await expect
      .poll(() => textOf(app, "main [role='status']"), { timeout: 10000 })
      .toContain('Saved smaller.sqlite')
    const smaller = new DatabaseSync(backup)
    try {
      removed = Number(
        smaller
          .prepare(
            `DELETE FROM rolls WHERE rowid IN (SELECT rowid FROM (SELECT rowid, row_number() OVER (PARTITION BY json_extract(payload, '$.gacha_type') ORDER BY id) AS n FROM rolls) WHERE n <= 10)`,
          )
          .run().changes,
      )
    } finally {
      smaller.close()
    }
    await app.execute(`document.querySelector('nav a[aria-label="Warp History"]').click()`)
    await expect.poll(() => textOf(app, firstTab), { timeout: 10000 }).toMatch(/\d/)
    const before = Number((await textOf(app, firstTab))!.replace(/,/g, ''))
    // Restoring it: the confirmation compares, then Restore backup replaces the history.
    await toBackup(app)
    await click(app, 'main', 'Restore from backup…')
    await expect.poll(() => heading(app), { timeout: 10000 }).toBe('Restore Backup')
    expect(await textOf(app, 'main .footnote')).toBe(
      `Restoring replaces 2,060 rolls in 1 account with ${(2060 - removed).toLocaleString('en')} rolls in 1 account.`,
    )
    await click(app, 'main footer', 'Restore backup')
    await expect.poll(() => heading(app), { timeout: 10000 }).toBe('Backup & Restore')
    const restored = (await textOf(app, restoreStatus))!.replace(/\s+/g, ' ').trim()
    expect(restored).toMatch(
      /^Restored smaller\.sqlite\. Your previous history is kept in the data folder as history-before-restore-\d{8}-\d{6}\.sqlite\.$/,
    )
    expect(await app.execute(`return document.activeElement.textContent.trim()`)).toBe(
      'Restore from backup…',
    )
    await app.screenshot('e2e-restored')
    // The History screen reads the restored history.
    await app.execute(`document.querySelector('nav a[aria-label="Warp History"]').click()`)
    await expect
      .poll(() => textOf(app, firstTab), { timeout: 10000 })
      .toBe((before - 10).toLocaleString('en'))
    // The history itself can't be restored, but the safety copy beside it can.
    await toBackup(app)
    writeFileSync(resolve(folder, 'restore-from.txt'), `${resolve(folder, 'history.sqlite')}\n`)
    await click(app, 'main', 'Restore from backup…')
    await expect
      .poll(() => textOf(app, restoreStatus), { timeout: 10000 })
      .toContain('This is your current history, not a backup.')
    expect(await heading(app)).toBe('Backup & Restore')
    safety = readdirSync(folder).find((name) => name.startsWith('history-before-restore-'))!
    writeFileSync(resolve(folder, 'restore-from.txt'), `${resolve(folder, safety)}\n`)
    // Safety copies are named to the second, so this restore's gets a name of its own.
    await new Promise((done) => setTimeout(done, 1000))
    await click(app, 'main', 'Restore from backup…')
    await expect.poll(() => heading(app), { timeout: 10000 }).toBe('Restore Backup')
    expect(await textOf(app, 'main .footnote')).toBe(
      `Restoring replaces ${(2060 - removed).toLocaleString('en')} rolls in 1 account with 2,060 rolls in 1 account.`,
    )
    await click(app, 'main footer', 'Restore backup')
    await expect.poll(() => heading(app), { timeout: 10000 }).toBe('Backup & Restore')
    expect((await textOf(app, restoreStatus))!.replace(/\s+/g, ' ').trim()).toMatch(
      new RegExp(
        `^Restored ${safety.replace(/\./g, '\\.')}\\. Your previous history is kept in the data folder as history-before-restore-\\d{8}-\\d{6}\\.sqlite\\.$`,
      ),
    )
    await app.execute(`document.querySelector('nav a[aria-label="Warp History"]').click()`)
    await expect
      .poll(() => textOf(app, firstTab), { timeout: 10000 })
      .toBe(before.toLocaleString('en'))
  })
  // The data folder holds the history restored from the first safety copy, that copy
  // unchanged, and the second restore's safety copy, and nothing else.
  const saved = readdirSync(folder).filter(
    (name) => name.endsWith('.sqlite') || name.endsWith('.partial'),
  )
  const second = saved.find(
    (name) => name.startsWith('history-before-restore-') && name !== safety,
  )!
  expect(saved.toSorted()).toEqual([safety, second, 'history.sqlite'].toSorted())
  const count = (path: string) => {
    const database = new DatabaseSync(path, { readOnly: true })
    try {
      return Object.values(database.prepare('SELECT count(*) FROM rolls').get()!)[0]
    } finally {
      database.close()
    }
  }
  expect(count(resolve(folder, 'history.sqlite'))).toBe(2060)
  expect(count(resolve(folder, safety))).toBe(2060)
  expect(count(resolve(folder, second))).toBe(2060 - removed)
  rmSync(backups, { recursive: true, force: true })
}, 120000)

test('an older history the mock cannot upgrade is copied first, left as it was and reported', async () => {
  const folder = resolve(mockData, 'astral-index-mock')
  rmSync(mockData, { recursive: true, force: true })
  mkdirSync(folder, { recursive: true })
  // 1.0.0's history holds two accounts on one server, which the mock's test-only
  // migration refuses.
  const fixture = resolve(
    import.meta.dirname,
    '../src-tauri/tests/fixtures/storage/history-1.0.0.sqlite',
  )
  copyFileSync(fixture, resolve(folder, 'history.sqlite'))
  const original = readFileSync(fixture)
  // Ready resolves; a history that can't be used rejects with the failure.
  const status = (app: AppSession) =>
    app.executeAsync<{ kind: string; code?: string | null } | null>(
      `const done = arguments[arguments.length - 1];
      window.__TAURI_INTERNALS__.invoke('history_status').then(() => done(null), done)`,
    )
  let copy = ''
  await withMock('failing-upgrade', { keep: true }, async (app) => {
    const first = await status(app)
    expect(first?.kind).toBe('history_not_upgraded')
    expect(first?.code).toMatch(/^history-v2-\d{8}-\d{6}\.sqlite$/)
    copy = first!.code!
    // Asked again, it reports the same copy without trying again.
    expect(await status(app)).toEqual(first)
  })
  // The history is as it was, and the one copy holds it byte for byte.
  expect(readFileSync(resolve(folder, 'history.sqlite'))).toEqual(original)
  expect(readdirSync(folder).filter((name) => name.startsWith('history-v'))).toEqual([copy])
  expect(readFileSync(resolve(folder, copy))).toEqual(original)
}, 120000)

test('the About dialog opens from the keyboard, opens what it offers and closes back to its button', async () => {
  await withMock('history', {}, async (app) => {
    const folder = resolve(mockData, 'astral-index-mock')
    const record = resolve(folder, 'opened.txt')
    // Anything the CSP blocks from here on, such as a remote image or script.
    await app.execute(`window.blocked = [];
      document.addEventListener('securitypolicyviolation', (event) => window.blocked.push(event.blockedURI))`)
    const press = (name: string) =>
      app.execute(`[...document.querySelectorAll('dialog button')]
        .find((button) => button.textContent.trim() === ${JSON.stringify(name)}).click()`)
    // Text as shown, without the spaces Vue keeps around a line break in a template.
    const shown = async (selector: string) => (await textOf(app, selector))?.trim()
    const focused = () =>
      app.execute<string>(
        `return document.activeElement.getAttribute('aria-label') ?? document.activeElement.textContent.trim()`,
      )
    await expect
      .poll(() => textOf(app, '[role=status]'), { timeout: 10000 })
      .toContain('No Warp History Yet')
    await app.execute(`document.querySelector('nav button.about').focus()`)
    await app.press(ENTER)
    await expect.poll(() => shown('dialog[open] .version')).toBe('Local build · MIT License')
    expect(await heading(app)).toBe('Warp History')
    expect(await shown('dialog .path')).toBe(folder)
    expect(await shown('dialog .mode')).toBe('App data folder')
    // The open lockup at H 40, centred in the dialog, with the brand's regular files.
    const lockup = await app.execute(`
      const dialog = document.querySelector('dialog').getBoundingClientRect();
      const [emblem, wordmark] = ['dialog .open-lockup svg', 'dialog .open-lockup img']
        .map((selector) => document.querySelector(selector));
      const [e, w] = [emblem, wordmark].map((el) => el.getBoundingClientRect());
      const round = (n) => Math.round(n * 10) / 10;
      return {
        heights: [round(e.height), round(w.height)],
        gap: round(w.left - e.right),
        centred: Math.abs((e.left + w.right) / 2 - (dialog.left + dialog.right) / 2) < 1,
        loaded: wordmark.naturalWidth > 0 && wordmark.src.includes('astral-index-wordmark-'),
      };
    `)
    expect(lockup).toEqual({ heights: [51.4, 40], gap: 16, centred: true, loaded: true })
    expect(await accessibilityViolations(app)).toEqual([])
    await app.screenshot('e2e-about')
    // Both openings go to the mock, which records them rather than launching anything.
    await press('Show in Folder')
    await expect
      .poll(() => existsSync(record) && readFileSync(record, 'utf8'))
      .toBe(`reveal ${resolve(folder, 'history.sqlite')}\n`)
    await press('Issues Page')
    await expect
      .poll(() => readFileSync(record, 'utf8'))
      .toBe('browse https://github.com/shra-ja/astral-index/issues\n')
    rmSync(record)
    mkdirSync(record)
    await press('Show in Folder')
    await expect
      .poll(() => shown('dialog [role=alert]'))
      .toBe('The folder couldn’t be opened. Its path is shown above.')
    // The licence view, and Back to the button that opened it.
    await press('Licence Text')
    await expect.poll(() => shown('dialog h2')).toBe('Licence')
    expect(await textOf(app, 'dialog .licence')).toContain('MIT License')
    expect(await accessibilityViolations(app)).toEqual([])
    expect(await focused()).toBe('Back')
    await app.press(ENTER)
    await expect.poll(focused).toBe('Licence Text')
    // The build generated the notices: every component by origin, each text shown only
    // once its component is opened.
    await press('Third-Party Notices')
    await expect
      .poll(() =>
        app.execute<string[]>(
          `return [...document.querySelectorAll('dialog .notices-list h3')].map((h) => h.textContent.replace(/\\s+/g, ' ').trim())`,
        ),
      )
      .toSatisfy(
        (groups: string[]) =>
          groups.length === 3 &&
          /^Rust Crates \(\d{3}\)$/.test(groups[0]) &&
          /^Frontend Packages \(\d+\)$/.test(groups[1]) &&
          groups[2] === 'Typeface (1)',
      )
    expect(
      await app.execute(`return document.querySelectorAll('dialog .licence-text').length`),
    ).toBe(0)
    await app.execute(`document.querySelector('dialog .notices-list summary').click()`)
    await expect.poll(() => shown('dialog .notices-list details[open] .licence-text')).toMatch(/\S/)
    expect(await shown('dialog .notices-list details[open] .source')).toMatch(
      /^Source: https:\/\/crates\.io\/crates\//,
    )
    expect(await accessibilityViolations(app)).toEqual([])
    await app.screenshot('e2e-about-notices')
    // Everything the dialog's views loaded, notices included, came with the app: the
    // CSP blocked nothing, and the page refers only to its own files and routes.
    expect(await app.execute('return window.blocked')).toEqual([])
    expect(
      await app.execute<string[]>(
        `return [...document.querySelectorAll('[src], [href]')].map((element) => element.getAttribute('src') ?? element.getAttribute('href')).filter((url) => !/^(\\/assets\\/|#\\/)/.test(url))`,
      ),
    ).toEqual([])
    await press('Back')
    await expect.poll(focused).toBe('Third-Party Notices')
    // Esc closes the dialog and returns focus to the About button.
    await app.press(ESCAPE)
    await expect
      .poll(() => app.execute('return document.querySelector("dialog") === null'))
      .toBe(true)
    expect(await focused()).toBe('About')
    // In the smallest window the dialog fits, scrolling inside, with nothing cut off.
    await app.command('/window/rect', 'POST', { width: 480, height: 560 })
    await app.execute(`document.querySelector('nav button.about').click()`)
    await expect.poll(() => shown('dialog[open] .version')).toContain('MIT License')
    const fit = await app.execute(`
      const box = document.querySelector('dialog').getBoundingClientRect();
      const body = document.querySelector('dialog .body');
      return {
        inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
        scrolls: body.scrollHeight > body.clientHeight,
        wide: body.scrollWidth <= body.clientWidth,
      };
    `)
    expect(fit).toEqual({ inside: true, scrolls: true, wide: true })
    expect(await scrollbarOf(app, 'dialog .body')).toEqual(appScrollbar)
    await app.screenshot('e2e-about-small')
    // A real press inside the dialog keeps it open; one on the backdrop, outside it,
    // closes it and returns focus to the About button, as Esc does.
    const pressAt = (x: number, y: number) =>
      app.command('/actions', 'POST', {
        actions: [
          {
            type: 'pointer',
            id: 'mouse',
            parameters: { pointerType: 'mouse' },
            actions: [
              { type: 'pointerMove', duration: 0, origin: 'viewport', x, y },
              { type: 'pointerDown', button: 0 },
              { type: 'pointerUp', button: 0 },
            ],
          },
        ],
      })
    const middle = await app.execute<{ x: number; y: number }>(`
      const box = document.querySelector('dialog .version').getBoundingClientRect();
      return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
    `)
    await pressAt(middle.x, middle.y)
    await pause(300)
    expect(await app.execute('return document.querySelector("dialog[open]") !== null')).toBe(true)
    await pressAt(2, 2)
    await expect
      .poll(() => app.execute('return document.querySelector("dialog") === null'))
      .toBe(true)
    expect(await focused()).toBe('About')
    // Close, clicked, returns focus there too.
    await app.execute(`document.querySelector('nav button.about').click()`)
    await expect.poll(() => shown('dialog[open] .version')).toContain('MIT License')
    const close = await app.execute<{ x: number; y: number }>(`
      const box = document.querySelector('dialog button.close').getBoundingClientRect();
      return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
    `)
    await pressAt(close.x, close.y)
    await expect
      .poll(() => app.execute('return document.querySelector("dialog") === null'))
      .toBe(true)
    expect(await focused()).toBe('About')
  })
}, 60000)

test('the mock binary retrieves, reviews and saves synthetic history, which persists', async () => {
  const { app, database, staleCache } = await launchMock('history')
  try {
    await retrieveFromFile(app)
    // The mock started with a fresh webview profile.
    expect(existsSync(staleCache)).toBe(false)
    await expect
      .poll(() => textOf(app, '.progress [role=status]'), { timeout: 10000 })
      .toContain('Retrieving')
    // The download shows the category reached and each category's state.
    await expect
      .poll(() => textOf(app, '.progress .summary'), { timeout: 10000 })
      .toMatch(/^Category [1-6] of 6\s*[\d,]+ rolls? so far$/)
    expect(
      await app.execute(
        'return [...document.querySelectorAll(".categories .name")].map(name => name.textContent)',
      ),
    ).toEqual([
      'Stellar Warp',
      'Departure Warp',
      'Character Event Warp',
      'Light Cone Event Warp',
      'Character Collaboration Warp',
      'Light Cone Collaboration Warp',
    ])
    // The progress card sits in the middle of the screen, as other status cards do.
    expect(await centredCard(app, '.progress')).toBe(true)
    expect(await accessibilityViolations(app)).toEqual([])
    await app.screenshot('e2e-mock-progress')
    await expect
      .poll(() => textOf(app, '.review h2'), { timeout: 30000 })
      .toBe('Ready to save 2,060 new rolls')
    expect(await heading(app)).toBe('Review Import')
    expect(await textOf(app, '.review .account')).toContain('100000001')
    // The mock's prod_official_asia server reads as the game names it.
    expect(await textOf(app, '.review .account .chip')).toBe('Asia')
    expect(await accessibilityViolations(app)).toEqual([])
    await app.screenshot('e2e-mock-review')
    // In the smallest window the review keeps every category in reach: no panel
    // clips its rows, the body scrolls to them, and Save stays in the window.
    await app.command('/window/rect', 'POST', { width: 480, height: 560 })
    const reviewFits = () =>
      app.execute<{ clipped: string[]; scrolls: boolean; saveInWindow: boolean }>(`
        const body = document.querySelector('.review .body');
        const save = [...document.querySelectorAll('.review .actions button')].at(-1).getBoundingClientRect();
        return {
          // The body's parts that cut off their own content, its hidden measuring copy aside.
          clipped: [...body.querySelectorAll(':scope > :not(.measure)')].filter(child => child.scrollHeight > child.clientHeight + 1).map(child => child.className || child.tagName),
          scrolls: body.scrollHeight > body.clientHeight,
          saveInWindow: save.top >= 0 && save.bottom <= innerHeight && save.right <= innerWidth,
        };
      `)
    await expect
      .poll(reviewFits, { timeout: 5000 })
      .toEqual({ clipped: [], scrolls: true, saveInWindow: true })
    await app.execute('document.querySelector(".review tbody tr:last-child").scrollIntoView()')
    await app.screenshot('e2e-mock-review-small')
    await app.command('/window/rect', 'POST', { width: 1000, height: 760 })
    await click(app, '.review', 'Save 2,060 rolls')
    await expect.poll(() => textOf(app, '.saved h2'), { timeout: 10000 }).toBe('2,060 Rolls Saved')
    expect(await textOf(app, '.saved p')).toBe('Added to UID 100000001 (Asia).')
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
        time: '2026-09-07 21:14:03',
      }),
    )
    const last = await history(63)
    expect(last.rolls.map((roll) => roll.number)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
    expect(await accessibilityViolations(app)).toEqual([])
    await app.screenshot('e2e-mock-saved')
    expect(existsSync(database)).toBe(true)
    // The History screen shows what was saved, read from this device.
    await app.execute(
      `[...document.querySelectorAll(".saved a")].find(a => a.textContent.trim() === "View warp history").click()`,
    )
    await expect.poll(() => heading(app), { timeout: 10000 }).toBe('Warp History')
    await expect
      .poll(() => textOf(app, '.showing'), { timeout: 10000 })
      .toMatch(/^\s*Showing 1–20 of\s+1,250\s*$/)
    expect(
      await app.execute('return document.querySelector(".account").getAttribute("aria-label")'),
    ).toBe('Account: UID 100000001, Asia server')
    // In a wide window the tabs show their counts.
    await app.command('/window/rect', 'POST', { width: 1280, height: 900 })
    const tabs = () =>
      app.execute<string[]>(
        `return [...document.querySelectorAll('[aria-label="Banner category"] button')].map(tab => tab.textContent.replace(/\\s+/g, " ").trim())`,
      )
    await expect
      .poll(tabs, { timeout: 5000 })
      .toEqual([
        'Character Event 1,250',
        'Light Cone Event 412',
        'Stellar 300',
        'Departure 50',
        'Character Collab 38',
        'Light Cone Collab 10',
      ])
    expect(await textOf(app, '[aria-sort]')).toBe('Time (UTC+8)')
    expect(
      await app.execute(
        `return [...document.querySelectorAll(".roll-list .body [role=row]")].slice(0, 2).map(row => [...row.querySelectorAll("[role=cell]")].map(cell => cell.textContent.trim()).filter((_, index) => index !== 1))`,
      ),
    ).toEqual([
      [
        '1250',
        expect.stringMatching(/^\d+$/),
        expect.stringMatching(/^[345]★$/),
        expect.any(String),
        '7 Sep 2026, 21:14:03',
      ],
      [
        '1249',
        expect.stringMatching(/^\d+$/),
        expect.stringMatching(/^[345]★$/),
        expect.any(String),
        '7 Sep 2026, 21:14:03',
      ],
    ])
    // Each roll's pity counts on from the older roll below it, starting again at 1
    // straight after a 5★.
    const pities = await app.execute<{ pity: number; five: boolean; band: string | null }[]>(
      `return [...document.querySelectorAll(".roll-list .body [role=row]")].map(row => { const cell = row.querySelector(".pity"); return { pity: Number(cell.firstChild.textContent), five: row.classList.contains("rarity-5"), band: [...cell.classList].find(name => name.startsWith("band-")) ?? null } })`,
    )
    // Character Event Warp's 5★ pity turns orange from 49 and red from 74; the rest
    // stay plain.
    expect(pities.some((roll) => roll.five)).toBe(true)
    for (const roll of pities) {
      const band = roll.pity >= 74 ? 'band-soft' : roll.pity >= 49 ? 'band-near' : 'band-early'
      expect(roll.band).toBe(roll.five ? band : null)
    }
    expect(pities).toHaveLength(20)
    for (const [newer, older] of pities
      .slice(0, -1)
      .map((roll, index) => [roll, pities[index + 1]])) {
      expect(newer.pity).toBe(older.five ? 1 : older.pity + 1)
    }
    // The summary strip covers the whole category: each rate is its count's share of
    // the 1,250 rolls, and the period ends on the newest roll's date.
    const strip = await app.execute<{ label: string; parts: string[] }[]>(
      `return [...document.querySelectorAll('[aria-label="Category summary"] .tile')].map(tile => ({ label: tile.querySelector(".label").textContent, parts: [...tile.querySelectorAll(".value, .rate, .period > span")].map(part => part.textContent.trim()) }))`,
    )
    expect(strip.map((tile) => tile.label)).toEqual([
      'Rolls stored',
      '5★ rolls',
      '4★ rolls',
      'Stored period',
    ])
    expect(strip[0].parts).toEqual(['1,250'])
    for (const tile of [strip[1], strip[2]]) {
      const [count, shown] = tile.parts
      expect(Number(count)).toBeGreaterThan(0)
      expect(shown).toBe(`${((Number(count) / 1250) * 100).toFixed(2)}%`)
    }
    expect(strip[3].parts.slice(1)).toEqual([
      expect.stringMatching(/^\d{1,2} [A-Z][a-z]{2} \d{4} –$/),
      '7 Sep 2026',
    ])
    // Hiding 3★ rolls leaves the 5★ and 4★ ones of the whole category, still numbered
    // in it, while the tabs and strip keep counting everything.
    const fiveAndFour = Number(strip[1].parts[0]) + Number(strip[2].parts[0])
    await app.execute(`document.querySelector('[aria-label="Show rarities"] .rarity-3').click()`)
    await expect
      .poll(async () => (await textOf(app, '.showing'))?.replace(/\s+/g, ' ').trim(), {
        timeout: 10000,
      })
      .toBe(`Showing 1–20 of ${fiveAndFour}`)
    const filtered = await app.execute<string[][]>(
      `return [...document.querySelectorAll(".roll-list .body [role=row]")].map(row => [...row.querySelectorAll("[role=cell]")].map(cell => cell.textContent.trim()))`,
    )
    expect(filtered).toHaveLength(20)
    expect(filtered.every((cells) => /^[45]★$/.test(cells[3]))).toBe(true)
    expect(Number(filtered[0][0])).toBeLessThanOrEqual(1250)
    expect(filtered.map((cells) => Number(cells[0]))).toEqual(
      filtered.map((cells) => Number(cells[0])).toSorted((a, b) => b - a),
    )
    expect(await textOf(app, "[aria-label='Category summary'] .tile .value")).toBe('1,250')
    await app.screenshot('e2e-mock-history-filtered')
    // Typing a lowercase search narrows the 5★ and 4★ rolls to that item, once
    // typing pauses, still numbered in the whole category.
    await app.execute('document.querySelector(\'input[type="search"]\').focus()')
    await app.press(...'acheron')
    await expect
      .poll(
        () =>
          app.execute<string[]>(
            `return [...document.querySelectorAll(".roll-list .body [role=row] .name")].map(name => name.textContent.trim())`,
          ),
        { timeout: 10000 },
      )
      .toSatisfy((names: string[]) => names.length > 0 && names.every((name) => name === 'Acheron'))
    const searched = Number(
      (await textOf(app, '.showing'))?.replace(/\s+/g, ' ').match(/of ([\d,]+)$/)?.[1],
    )
    expect(searched).toBeGreaterThan(0)
    expect(searched).toBeLessThan(fiveAndFour)
    await app.screenshot('e2e-mock-history-search')
    await app.execute(
      `const box = document.querySelector('input[type="search"]'); box.value = ''; box.dispatchEvent(new Event('input'))`,
    )
    // With the keyboard, the date button opens its popover at All dates; choosing
    // 7 Sep onwards keeps only that day's 5★ and 4★ rolls, and Escape closes it.
    await app.execute('document.querySelector(\'main button[aria-haspopup="dialog"]\').focus()')
    await app.press(ENTER)
    await expect
      .poll(
        () => app.execute<string | undefined>('return document.activeElement?.textContent?.trim()'),
        {
          timeout: 10000,
        },
      )
      .toBe('All dates')
    expect(await textOf(app, '[role=dialog] .note')).toBe(
      'Server time (UTC+8). Saved rolls span 31 Aug 2025 – 7 Sep 2026.',
    )
    // The popover's buttons keep their own sizes: 30px quick ranges, 32px actions.
    expect(
      await app.execute(
        'return [...document.querySelectorAll("[role=dialog] button")].map(button => [button.textContent.trim(), button.offsetHeight])',
      ),
    ).toEqual([
      ['All dates', 30],
      ['Last 7 days', 30],
      ['Last 30 days', 30],
      ['Last 6 months', 30],
      ['This year', 30],
      ['Clear', 32],
      ['Done', 32],
    ])
    await app.execute(
      `const from = [...document.querySelectorAll('[role=dialog] label')].find(label => label.textContent.trim() === 'From').querySelector('input'); from.value = '2026-09-07'; from.dispatchEvent(new Event('change'))`,
    )
    await expect
      .poll(
        () =>
          app.execute<string[]>(
            `return [...document.querySelectorAll(".roll-list .body [role=row]")].map(row => row.lastElementChild.textContent.trim().split(",")[0])`,
          ),
        { timeout: 10000 },
      )
      .toSatisfy((days: string[]) => days.length > 0 && days.every((day) => day === '7 Sep 2026'))
    expect(await accessibilityViolations(app)).toEqual([])
    await app.screenshot('e2e-mock-history-dates')
    await app.press(ESCAPE)
    await expect
      .poll(() => textOf(app, "main button[aria-haspopup='dialog']"), { timeout: 10000 })
      .toMatch(/^\s*From 7 Sep 2026\s*$/)
    expect(await app.execute('return document.querySelector("[role=dialog]") === null')).toBe(true)
    expect(
      await app.execute(
        'return document.activeElement === document.querySelector(\'main button[aria-haspopup="dialog"]\')',
      ),
    ).toBe(true)
    await app.press(ENTER)
    await expect.poll(() => textOf(app, '[role=dialog] .clear'), { timeout: 10000 }).toBe('Clear')
    await app.execute('document.querySelector("[role=dialog] .clear").click()')
    await app.press(ESCAPE)
    await app.execute(`document.querySelector('[aria-label="Show rarities"] .rarity-3').click()`)
    await expect
      .poll(() => textOf(app, '.showing'), { timeout: 10000 })
      .toMatch(/^\s*Showing 1–20 of\s+1,250\s*$/)
    expect(await accessibilityViolations(app)).toEqual([])
    await app.screenshot('e2e-mock-history')
    // The rolls panel ends at its last roll, and only the screen scrolls: the rolls never
    // scroll on their own, the column headings stay under the top and the pager stays
    // at the bottom.
    const scrolling = () =>
      app.execute<{
        fitted: boolean
        rollsScroll: boolean
        screenScrolls: boolean
        pagerInView: boolean
        headPinned: boolean | null
      }>(`
        const screen = document.querySelector('main > .body');
        const view = screen.getBoundingClientRect();
        const panel = document.querySelector('.rolls').getBoundingClientRect();
        const rolls = document.querySelector('.roll-list .body, .roll-grid, .roll-icons');
        const last = [...rolls.querySelectorAll('[role=row], li')].at(-1).getBoundingClientRect();
        const pager = document.querySelector('.roll-pager').getBoundingClientRect();
        const head = document.querySelector('.roll-list .head')?.getBoundingClientRect();
        return {
          fitted: panel.bottom - last.bottom <= 20,
          rollsScroll: rolls.scrollHeight > rolls.clientHeight + 1,
          screenScrolls: screen.scrollHeight > screen.clientHeight,
          pagerInView: pager.top >= view.top && pager.bottom <= view.bottom + 1,
          headPinned: head ? Math.abs(head.top - view.top) <= 1 : null,
        };
      `)
    const scrollScreen = (top: number) =>
      app.execute(`document.querySelector('main > .body').scrollTop = ${top}`)
    expect(await scrolling()).toMatchObject({
      fitted: true,
      rollsScroll: false,
      screenScrolls: true,
      pagerInView: true,
    })
    // The screen keeps room for its scrollbar whether or not it scrolls, so content
    // never shifts sideways between tabs and layouts that do and don't scroll. WebView2
    // draws classic scrollbars, which take room; WebKitGTK's overlay ones take none
    // here, so the style that reserves it is checked instead.
    expect(
      await app.execute(
        `return getComputedStyle(document.querySelector('main > .body')).scrollbarGutter`,
      ),
    ).toBe('stable')
    expect(await scrollbarOf(app, 'main > .body')).toEqual(appScrollbar)
    await scrollScreen(300)
    await expect
      .poll(scrolling, { timeout: 5000 })
      .toMatchObject({ pagerInView: true, headPinned: true })
    await app.screenshot('e2e-mock-history-scrolled')
    await scrollScreen(0)
    // The Grid layout shows the same page as tiles, several to a row, from the keyboard.
    // The toolbar keeps its height above the rolls, however many rows it wraps to.
    const toolbarClear = () =>
      app.execute<boolean>(`
        const controls = [...document.querySelector('.rolls .toolbar').children];
        const rolls = document.querySelector('.roll-list, .roll-grid').getBoundingClientRect();
        return Math.max(...controls.map(control => control.getBoundingClientRect().bottom)) <= rolls.top + 1;
      `)
    const grid = () =>
      app.execute<{ tiles: number; columns: number; narrowest: number; fits: boolean }>(`
        const tiles = [...document.querySelectorAll('.roll-grid li')];
        return {
          tiles: tiles.length,
          columns: new Set(tiles.map(tile => tile.getBoundingClientRect().left)).size,
          narrowest: Math.min(...tiles.map(tile => tile.getBoundingClientRect().width)),
          fits: document.documentElement.scrollWidth <= innerWidth,
        };
      `)
    await app.execute('document.querySelector(\'[aria-label="Grid view"]\').focus()')
    await app.press(ENTER)
    await expect.poll(async () => (await grid()).tiles, { timeout: 5000 }).toBe(20)
    const wide = await grid()
    expect(wide.columns).toBeGreaterThan(2)
    expect(wide.narrowest).toBeGreaterThanOrEqual(190)
    expect(wide.fits).toBe(true)
    // Twenty tiles leave no empty panel below them.
    expect(await scrolling()).toMatchObject({ fitted: true, rollsScroll: false, pagerInView: true })
    expect(await accessibilityViolations(app)).toEqual([])
    await app.screenshot('e2e-mock-history-grid')
    // The Icons layout is one Tab stop: arrows move by icon and by row, and each icon
    // names its roll in a tooltip and to assistive technology.
    await app.execute('document.querySelector(\'[aria-label="Icons view"]\').focus()')
    await app.press(ENTER)
    await expect
      .poll(
        () => app.execute('return document.querySelectorAll(".roll-icons [role=img]").length'),
        {
          timeout: 5000,
        },
      )
      .toBe(20)
    const focusedIcon = () =>
      app.execute<{ index: number; label: string; tip: string; shown: boolean }>(`
        const icons = [...document.querySelectorAll('.roll-icons [role=img]')];
        const icon = document.activeElement;
        const tip = icon.parentElement.querySelector('[role=tooltip]');
        return {
          index: icons.indexOf(icon),
          label: icon.getAttribute('aria-label'),
          tip: tip?.textContent,
          shown: tip !== null && getComputedStyle(tip).display !== 'none',
        };
      `)
    await app.press(TAB)
    await expect.poll(focusedIcon, { timeout: 5000 }).toMatchObject({ index: 0, shown: true })
    const firstIcon = await focusedIcon()
    expect(firstIcon.tip).toBe(firstIcon.label)
    expect(firstIcon.label).toMatch(/^.+, [345]★, pity \d+, #1250, \d+ \w{3} \d{4}$/)
    await app.press(RIGHT)
    expect((await focusedIcon()).index).toBe(1)
    const perRow = await app.execute<number>(`
      const icons = [...document.querySelectorAll('.roll-icons [role=img]')];
      return icons.filter(icon => icon.offsetTop === icons[0].offsetTop).length;
    `)
    expect(perRow).toBeGreaterThan(1)
    await app.press(DOWN)
    expect((await focusedIcon()).index).toBe(1 + perRow)
    expect(await scrolling()).toMatchObject({ fitted: true, rollsScroll: false, pagerInView: true })
    expect(await accessibilityViolations(app)).toEqual([])
    await app.screenshot('e2e-mock-history-icons')
    await app.execute('document.querySelector(\'[aria-label="List view"]\').click()')
    await expect
      .poll(() => app.execute('return document.querySelector(".roll-list") !== null'), {
        timeout: 5000,
      })
      .toBe(true)
    // At the minimum width they no longer fit, so they become a dropdown.
    await app.command('/window/rect', 'POST', { width: 480, height: 700 })
    await expect
      .poll(() => textOf(app, 'label.select select option:checked'), { timeout: 5000 })
      .toMatch(/^\s*Character Event · 1,250\s*$/)
    expect(await tabs()).toEqual([])
    // The strip wraps to two by two rather than squashing.
    expect(
      await app.execute<number>(
        `return new Set([...document.querySelectorAll('[aria-label="Category summary"] .tile')].map(tile => tile.getBoundingClientRect().top)).size`,
      ),
    ).toBe(2)
    expect(await toolbarClear()).toBe(true)
    // In a short window too, only the screen scrolls, and the pinned pager keeps to two
    // lines: the rows-per-page label is hidden but still names its select.
    expect(await scrolling()).toMatchObject({
      fitted: true,
      rollsScroll: false,
      screenScrolls: true,
      pagerInView: true,
    })
    const pager = () =>
      app.execute<{ lines: number; sizeName: string }>(`
        // Its visible parts, by the middle of each, leaving out its measuring copies.
        const parts = [...document.querySelectorAll('.roll-pager > :not(.measure)')];
        const select = document.querySelector('.roll-pager select');
        const middle = part => { const box = part.getBoundingClientRect(); return Math.round((box.top + box.bottom) / 2); };
        return {
          lines: new Set(parts.map(middle)).size,
          sizeName: select.closest('label').querySelector('.size-label').textContent.trim(),
        };
      `)
    expect(await pager()).toEqual({ lines: 2, sizeName: 'Rows per page' })
    // The screen scrolls down only, never sideways.
    expect(
      await app.execute(
        'const main = document.querySelector("main .body"); return main.scrollWidth <= main.clientWidth',
      ),
    ).toBe(true)
    // Item icons keep their 30px size in the list's rows.
    expect(
      await app.execute(
        'const icon = document.querySelector(".roll-list .body .icon").getBoundingClientRect(); return [icon.width, icon.height]',
      ),
    ).toEqual([30, 30])
    await app.screenshot('e2e-mock-history-narrow')
    // Narrow, the grid keeps whole tiles, fewer to a row, without scrolling sideways.
    await app.execute('document.querySelector(\'[aria-label="Grid view"]\').click()')
    await expect.poll(async () => (await grid()).tiles, { timeout: 5000 }).toBe(20)
    const narrow = await grid()
    expect(narrow.columns).toBeLessThan(wide.columns)
    expect(narrow.narrowest).toBeGreaterThanOrEqual(190)
    expect(narrow.fits).toBe(true)
    expect(await toolbarClear()).toBe(true)
    expect(await scrolling()).toMatchObject({ fitted: true, rollsScroll: false, pagerInView: true })
    await app.screenshot('e2e-mock-history-grid-narrow')
    // Paging reads the next rolls, still from this device.
    await app.execute('document.querySelector(\'[aria-label="Next page"]\').click()')
    await expect
      .poll(() => textOf(app, '.showing'), { timeout: 10000 })
      .toMatch(/^\s*Showing 21–40 of\s+1,250\s*$/)
    // A second retrieval finds everything already saved.
    await app.execute('document.querySelector("nav a[aria-label=Import]").click()')
    await expect.poll(() => heading(app), { timeout: 5000 }).toBe('Import')
    // The Import screen now names the import just saved.
    await app.command('/window/rect', 'POST', { width: 1280, height: 900 })
    const lastImport = () =>
      app.execute<string[]>(
        'return [...document.querySelectorAll(".last-import .part")].map(part => part.textContent)',
      )
    await expect
      .poll(async () => (await lastImport()).slice(1), { timeout: 5000 })
      .toEqual(['Retrieved from HoYoverse', 'UID 100000001 (Asia)', '2,060 new rolls saved'])
    expect((await lastImport())[0]).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}$/)
    expect(await accessibilityViolations(app)).toEqual([])
    await app.screenshot('e2e-mock-last-import')
    // A quick refresh, the default, stops each category at its first page: every
    // category reaches saved rolls there, so only those pages are skipped.
    await chooseCache(app)
    await expect
      .poll(
        () =>
          app.execute<number>(
            'return document.querySelectorAll(".categories [data-state=up-to-date]").length',
          ),
        { timeout: 10000 },
      )
      .toBeGreaterThan(0)
    await app.screenshot('e2e-mock-refresh-progress')
    await expect
      .poll(() => textOf(app, '.review h2'), { timeout: 30000 })
      .toBe('Everything here is already saved')
    // Stellar 300, Departure 50, Character Event 1,000, Light Cone Event 412 and
    // the two collaboration warps' first 20 and 10.
    expect(await skipped(app)).toBe('1,792')
    await click(app, '.review', 'Done')
    await expect
      .poll(() => textOf(app, '.start .note'), { timeout: 10000 })
      .toContain('Your saved history is already up to date.')
    // The full history still requests every page, skipping every saved roll.
    await app.execute(
      '[...document.querySelectorAll("fieldset label")].find(label => label.textContent.trim() === "Full history").click()',
    )
    await chooseCache(app)
    await expect
      .poll(() => textOf(app, '.review h2'), { timeout: 60000 })
      .toBe('Everything here is already saved')
    expect(await skipped(app)).toBe('2,060')
    await click(app, '.review', 'Done')
    await app.close()
  } catch (error) {
    await snapshotFailure(app)
    throw error
  } finally {
    await app.dispose()
  }
}, 120000)

test('in a very wide window every screen keeps one content width, centred under its header', async () => {
  const { app } = await launchMock('history')
  try {
    await app.command('/window/rect', 'POST', { width: 2560, height: 1440 })
    // The content's width and its gaps to the main area's edges, and whether the
    // header's title and trailing item line up with the content's edges.
    const content = (selector: string) =>
      app.execute<{ width: number; centred: boolean; titleAligned: boolean; endAligned: boolean }>(`
        const main = document.querySelector('main').getBoundingClientRect();
        const box = document.querySelector('${selector}').getBoundingClientRect();
        const title = document.querySelector('.screen-header h1').getBoundingClientRect();
        const end = document.querySelector('.screen-header').lastElementChild.getBoundingClientRect();
        return {
          width: Math.round(box.width),
          centred: Math.abs((box.left - main.left) - (main.right - box.right)) <= 2,
          titleAligned: Math.abs(title.left - box.left) <= 1,
          endAligned: Math.abs(end.right - box.right) <= 1,
        };
      `)
    const fitted = { width: 1360, centred: true, titleAligned: true }
    await retrieveFromFile(app)
    await expect
      .poll(() => textOf(app, '.review h2'), { timeout: 30000 })
      .toBe('Ready to save 2,060 new rolls')
    expect(await content('.review .stats')).toMatchObject(fitted)
    // The review's actions end where its content does.
    expect(
      await app.execute<boolean>(`
        const stats = document.querySelector('.review .stats').getBoundingClientRect();
        const save = [...document.querySelectorAll('.review .actions button')].at(-1).getBoundingClientRect();
        return Math.abs(save.right - stats.right) <= 1;
      `),
    ).toBe(true)
    await app.screenshot('e2e-mock-wide-review')
    await click(app, '.review', 'Save 2,060 rolls')
    await expect.poll(() => textOf(app, '.saved h2'), { timeout: 10000 }).toBe('2,060 Rolls Saved')
    expect(await centredCard(app, '.saved')).toBe(true)
    await click(app, '.saved', 'Done')
    // The source cards share the whole content width.
    await expect
      .poll(() => app.execute('return document.querySelector(".start") !== null'))
      .toBe(true)
    expect(await content('.retrieval > .start')).toMatchObject(fitted)
    await app.screenshot('e2e-mock-wide-import')
    await app.execute('document.querySelector("nav a[aria-label*=History]").click()')
    await expect
      .poll(() => textOf(app, '.showing'), { timeout: 10000 })
      .toMatch(/^\s*Showing 1–20 of\s+1,250\s*$/)
    expect(await content('.rolls')).toEqual({ ...fitted, endAligned: true })
    await app.screenshot('e2e-mock-wide-history')
    await app.close()
  } catch (error) {
    await snapshotFailure(app)
    throw error
  } finally {
    await app.dispose()
  }
}, 120000)

test('as the window narrows, the sidebar gives way first, no fuller layout comes back and nothing is clipped or stranded', async () => {
  const { app } = await launchMock('history')
  try {
    await retrieveFromFile(app)
    await expect
      .poll(() => textOf(app, '.review h2'), { timeout: 30000 })
      .toBe('Ready to save 2,060 new rolls')
    await click(app, '.review', 'Save 2,060 rolls')
    await expect.poll(() => textOf(app, '.saved h2'), { timeout: 10000 }).toBe('2,060 Rolls Saved')
    await app.execute('document.querySelector("nav a[aria-label*=History]").click()')
    await expect
      .poll(() => textOf(app, '.showing'), { timeout: 10000 })
      .toMatch(/^\s*Showing 1–20 of\s+1,250\s*$/)
    // Which compact layouts apply once the page has laid out at the given width, and
    // what is out of place: in the list, a column's text cut off (names truncate by
    // design), a row running past its end, or Pity closer than 12px to the name
    // before it; in the toolbar, a control other than 32px tall, or a control apart
    // from its partner when the toolbar wraps; in the pager, two lines with its label
    // still shown, or on one line, its page buttons off centre.
    const layoutAt = (width: number) =>
      app.executeAsync<{ compact: Record<string, boolean>; clipped: string[] }>(`
        const done = arguments[arguments.length - 1];
        const read = (frames) => {
          if (innerWidth !== ${width} && frames > 0) return requestAnimationFrame(() => read(frames - 1));
          requestAnimationFrame(() => requestAnimationFrame(() => {
            const hidden = (element) => getComputedStyle(element).display === 'none';
            const headings = [...document.querySelectorAll('.roll-list [role=columnheader]')];
            const clipped = new Set();
            for (const row of document.querySelectorAll('.roll-list [role=row]')) {
              if (row.scrollWidth > row.clientWidth) clipped.add('row');
              [...row.children].forEach((cell, index) => {
                if (!cell.classList.contains('item') && !hidden(cell) && cell.scrollWidth > cell.clientWidth)
                  clipped.add(headings[index].textContent.split(' ')[0]);
              });
              const item = row.querySelector('.item, [role=columnheader]:nth-child(2)');
              const pity = row.children[2];
              if (pity.getBoundingClientRect().left - item.getBoundingClientRect().right < 12)
                clipped.add('Pity beside Item');
            }
            const toolbar = document.querySelector('.rolls .toolbar');
            if ([...toolbar.querySelectorAll('button')].some((button) => button.offsetHeight !== 32))
              clipped.add('toolbar control not 32px');
            const middle = (selector) => {
              const box = toolbar.querySelector(selector).getBoundingClientRect();
              return (box.top + box.bottom) / 2;
            };
            const apart = (one, other) => Math.abs(middle(one) - middle(other)) > 1;
            if (apart('.search', '.layouts')) clipped.add('search apart from layout switch');
            if (apart('.filters', '.dates')) clipped.add('dates apart from rarities');
            const pager = document.querySelector('.roll-pager');
            const showing = pager.querySelector(':scope > .showing').getBoundingClientRect();
            const pages = pager.querySelector('nav').getBoundingClientRect();
            const label = pager.querySelector('.size-label').getBoundingClientRect();
            const oneLine = Math.abs((showing.top + showing.bottom) / 2 - (pages.top + pages.bottom) / 2) <= 1;
            if (!oneLine && label.width > 1) clipped.add('pager on two lines with its label');
            const box = pager.getBoundingClientRect();
            if (oneLine && Math.abs((pages.left + pages.right) / 2 - (box.left + box.right) / 2) > 1)
              clipped.add('pages off centre');
            done({
              compact: {
                'icon rail': document.querySelector('.sidebar').getBoundingClientRect().width < 100,
                'two by two summary':
                  getComputedStyle(document.querySelector('.strip')).gridTemplateColumns.split(' ').length === 2,
                'no Type column': hidden(document.querySelector('.roll-list .head .type')),
                'no Time column': hidden(document.querySelector('.roll-list .head .time')),
                'no Rows per page label': document.querySelector('.size-label').getBoundingClientRect().width <= 1,
              },
              clipped: [...clipped],
            });
          }));
        };
        read(60);
      `)
    const early: string[] = []
    const undone: string[] = []
    const clipped: string[] = []
    let before: Record<string, boolean> = {}
    for (let width = 1700; width >= 480; width -= 10) {
      await app.command('/window/rect', 'POST', { width, height: 760 })
      const now = await layoutAt(width)
      for (const [layout, applies] of Object.entries(now.compact)) {
        if (applies && !now.compact['icon rail']) early.push(`${layout} at ${width}`)
        if (before[layout] && !applies) undone.push(`${layout} undone at ${width}`)
      }
      clipped.push(...now.clipped.map((what) => `${what} at ${width}`))
      before = now.compact
    }
    expect({ early, undone, clipped }).toEqual({ early: [], undone: [], clipped: [] })
    // Moving between pages keeps every page button in its place, wide or narrow.
    const pageButtons = () =>
      app.execute<number[][]>(
        'return [...document.querySelectorAll(".roll-pager nav > *")].map(each => { const box = each.getBoundingClientRect(); return [Math.round(box.left), Math.round(box.width)]; })',
      )
    for (const width of [1280, 480]) {
      await app.command('/window/rect', 'POST', { width, height: 760 })
      await layoutAt(width)
      const places: number[][][] = []
      for (const page of [1, 2, 3, 4, 5, 6, 7, 8, 63]) {
        await app.execute(
          `document.querySelector('.roll-pager [aria-label="${page === 1 ? 'Page 1' : page === 63 ? 'Page 63' : 'Next page'}"]').click()`,
        )
        await expect
          .poll(() => textOf(app, ".roll-pager [aria-current='page']"), { timeout: 10000 })
          .toMatch(new RegExp(`^\\s*${page}\\s*$`))
        places.push(await pageButtons())
      }
      expect(places.every((each) => JSON.stringify(each) === JSON.stringify(places[0]))).toBe(true)
    }
    // The sidebar collapses at an 1100px window.
    await app.command('/window/rect', 'POST', { width: 1101, height: 760 })
    expect((await layoutAt(1101)).compact['icon rail']).toBe(false)
    await app.command('/window/rect', 'POST', { width: 1100, height: 760 })
    expect((await layoutAt(1100)).compact['icon rail']).toBe(true)
    await app.close()
  } catch (error) {
    await snapshotFailure(app)
    throw error
  } finally {
    await app.dispose()
  }
}, 180000)

test('at every width, the review shows each figure whole, its label on one line', async () => {
  const { app } = await launchMock('history')
  try {
    await retrieveFromFile(app)
    await expect
      .poll(() => textOf(app, '.review h2'), { timeout: 30000 })
      .toBe('Ready to save 2,060 new rolls')
    // The figures whose label takes more than one line or whose value is cut off.
    const brokenAt = (width: number) =>
      app.executeAsync<string[]>(`
        const done = arguments[arguments.length - 1];
        const read = (frames) => {
          if (innerWidth !== ${width} && frames > 0) return requestAnimationFrame(() => read(frames - 1));
          requestAnimationFrame(() => requestAnimationFrame(() => {
            const lines = (element) => { const range = document.createRange(); range.selectNodeContents(element); return new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size; };
            done([...document.querySelectorAll('.review .stats:not(.measure *) .stat')].flatMap((stat) => {
              const label = stat.querySelector('.stat-label');
              const value = stat.querySelector('.stat-value').getBoundingClientRect();
              const box = stat.getBoundingClientRect();
              const broken = [];
              if (lines(label) > 1) broken.push(label.textContent + ' label wraps');
              if (value.bottom > box.bottom || value.right > box.right) broken.push(label.textContent + ' cut off');
              return broken;
            }));
          }));
        };
        read(60);
      `)
    const broken: string[] = []
    for (let width = 1700; width >= 480; width -= 10) {
      await app.command('/window/rect', 'POST', { width, height: 760 })
      broken.push(...(await brokenAt(width)).map((what) => `${what} at ${width}`))
    }
    expect(broken).toEqual([])
    await app.close()
  } catch (error) {
    await snapshotFailure(app)
    throw error
  } finally {
    await app.dispose()
  }
}, 180000)

test('failed, cancelled and discarded retrievals save nothing, and saved history survives restarts and later failures', async () => {
  // A retrieval that loses the network says where it stopped and saves nothing.
  await withMock('network-failure', {}, async (app, database) => {
    await retrieveFromFile(app)
    await expect
      .poll(() => textOf(app, '.failed h2'), { timeout: 30000 })
      .toBe('Couldn’t Reach HoYoverse')
    expect(await textOf(app, '.failed')).toContain(
      'Retrieval stopped at Light Cone Event Warp, page 1.',
    )
    expect(await centredCard(app, '.failed')).toBe(true)
    expect(await accessibilityViolations(app)).toEqual([])
    await app.screenshot('e2e-mock-failed')
    // The History screen's read opens the database, but no rolls were saved.
    expect(existsSync(database)).toBe(true)
    expect(await stored(app)).toEqual(nothingSaved)
  })
  // Once HoYoverse answers again, a cancelled retrieval and a discarded review save
  // nothing either, and a retrieval saves everything the failed one could not.
  await withMock('history', { keep: true }, async (app) => {
    await retrieveFromFile(app)
    await expect
      .poll(() => textOf(app, '.progress .summary'), { timeout: 10000 })
      .toMatch(/^Category [1-6] of 6/)
    await click(app, '.progress', 'Cancel')
    await expect
      .poll(() => textOf(app, '.start .note'), { timeout: 10000 })
      .toBe('Retrieval cancelled. Nothing was saved.')
    expect(await stored(app)).toEqual(nothingSaved)
    await chooseCache(app)
    await expect
      .poll(() => textOf(app, '.review h2'), { timeout: 30000 })
      .toBe('Ready to save 2,060 new rolls')
    await click(app, '.review', 'Discard')
    await expect
      .poll(() => textOf(app, '.start .note'), { timeout: 10000 })
      .toBe('Discarded the retrieved history. Nothing was saved.')
    expect(await stored(app)).toEqual(nothingSaved)
    await chooseCache(app)
    await expect
      .poll(() => textOf(app, '.review h2'), { timeout: 30000 })
      .toBe('Ready to save 2,060 new rolls')
    await click(app, '.review', 'Save 2,060 rolls')
    await expect.poll(() => textOf(app, '.saved h2'), { timeout: 10000 }).toBe('2,060 Rolls Saved')
    expect(await stored(app)).toEqual(savedHistory)
  })
  // After a restart, the saved history shows straight away, read from this device.
  await withMock('network-failure', { keep: true }, async (app) => {
    await expect.poll(() => heading(app), { timeout: 10000 }).toBe('Warp History')
    await expect
      .poll(() => textOf(app, '.showing'), { timeout: 10000 })
      .toMatch(/^\s*Showing 1–20 of\s+1,250\s*$/)
    expect(
      await app.execute('return document.querySelector(".account").getAttribute("aria-label")'),
    ).toBe('Account: UID 100000001, Asia server')
    await app.screenshot('e2e-mock-restart')
    await app.execute('document.querySelector("nav a[aria-label=Import]").click()')
    await expect.poll(() => heading(app), { timeout: 5000 }).toBe('Import')
    await app.command('/window/rect', 'POST', { width: 1280, height: 900 })
    await expect
      .poll(
        () =>
          app.execute<string[]>(
            'return [...document.querySelectorAll(".last-import .part")].slice(1).map(part => part.textContent)',
          ),
        { timeout: 5000 },
      )
      .toEqual(['Retrieved from HoYoverse', 'UID 100000001 (Asia)', '2,060 new rolls saved'])
    // A retrieval that fails now leaves the saved history as it was.
    await chooseCache(app)
    await expect
      .poll(() => textOf(app, '.failed h2'), { timeout: 30000 })
      .toBe('Couldn’t Reach HoYoverse')
    expect(await stored(app)).toEqual(savedHistory)
  })
  // Saving, failing and cancelling never wrote the auth key anywhere the app keeps data.
  expect(filesHoldingAuthKey()).toEqual([])
}, 180000)

test('a quick refresh saves only newer rolls, and another account with the same roll IDs is kept apart', async () => {
  const save = async (app: AppSession, rolls: string) => {
    await expect
      .poll(() => textOf(app, '.review h2'), { timeout: 60000 })
      .toBe(`Ready to save ${rolls} new rolls`)
    await click(app, '.review', `Save ${rolls} rolls`)
    await expect
      .poll(() => textOf(app, '.saved h2'), { timeout: 10000 })
      .toBe(`${rolls} Rolls Saved`)
  }
  await withMock('history', {}, async (app) => {
    await retrieveFromFile(app)
    await save(app, '2,060')
  })
  // The same account has since made 25 more rolls in each category.
  await withMock('newer-history', { keep: true }, async (app) => {
    await retrieveFromFile(app)
    // Each category's first page reaches saved rolls, except the collaboration warps',
    // whose 20-roll first pages hold only newer ones: their second pages hold 15 and
    // 10 saved rolls. Stellar 300, Departure 50, Character Event 975, Light Cone
    // Event 412 and those 25 are skipped.
    await expect
      .poll(() => textOf(app, '.review h2'), { timeout: 60000 })
      .toBe('Ready to save 150 new rolls')
    expect(await skipped(app)).toBe('1,762')
    await save(app, '150')
    expect(await stored(app)).toEqual({
      uid: '100000001',
      totals: { '1': 325, '2': 75, '11': 1275, '12': 437, '21': 63, '22': 35 },
    })
    // The newer rolls are numbered on from the saved ones, newest first.
    await app.execute(
      `[...document.querySelectorAll(".saved a")].find(a => a.textContent.trim() === "View warp history").click()`,
    )
    await expect
      .poll(() => textOf(app, '.showing'), { timeout: 10000 })
      .toMatch(/^\s*Showing 1–20 of\s+1,275\s*$/)
    expect(
      await app.execute(
        `return [...document.querySelectorAll(".roll-list .body [role=row]")].map(row => row.querySelector("[role=cell]").textContent.trim())`,
      ),
    ).toEqual(Array.from({ length: 20 }, (_, index) => String(1275 - index)))
    await app.screenshot('e2e-mock-newer')
    // A full retrieval finds nothing new either.
    await app.execute('document.querySelector("nav a[aria-label=Import]").click()')
    await expect.poll(() => heading(app), { timeout: 5000 }).toBe('Import')
    await app.execute(
      '[...document.querySelectorAll("fieldset label")].find(label => label.textContent.trim() === "Full history").click()',
    )
    await chooseCache(app)
    await expect
      .poll(() => textOf(app, '.review h2'), { timeout: 60000 })
      .toBe('Everything here is already saved')
    expect(await skipped(app)).toBe('2,210')
    await click(app, '.review', 'Done')
  })
  const first = storedAccounts()
  expect(Object.keys(first)).toEqual(['100000001 prod_official_asia'])
  expect(first['100000001 prod_official_asia'].rolls).toBe(2210)
  // The same cache file now reaches another account, on another server, whose roll IDs
  // match the first account's. The account comes from HoYoverse's responses, and a
  // quick refresh only stops at the account's own saved rolls, so none are omitted.
  await withMock('second-account', { keep: true }, async (app) => {
    await retrieveFromFile(app)
    await expect
      .poll(() => textOf(app, '.review h2'), { timeout: 60000 })
      .toBe('Ready to save 2,060 new rolls')
    expect(await textOf(app, '.review .account')).toContain('100000002')
    expect(await textOf(app, '.review .account .chip')).toBe('America')
    await save(app, '2,060')
    expect(await textOf(app, '.saved p')).toBe('Added to UID 100000002 (America).')
    // The History screen follows the account imported last, and now that two are
    // saved its header switches between them.
    expect(await stored(app)).toEqual({ ...savedHistory, uid: '100000002' })
    await app.execute('document.querySelector("nav a[aria-label=\'Warp History\']").click()')
    const switcherLabel = () =>
      app.execute<string | null>(
        'return document.querySelector("button[aria-haspopup=menu]")?.getAttribute("aria-label")',
      )
    await expect
      .poll(switcherLabel, { timeout: 10000 })
      .toBe('Switch account. Current: UID 100000002, America server')
    await app.screenshot('e2e-mock-second-account')
    // With the keyboard: open the menu at the current account, move to the other one
    // and choose it.
    await app.execute('document.querySelector("button[aria-haspopup=menu]").focus()')
    await app.press(DOWN)
    await expect
      .poll(
        () =>
          app.execute<string[]>(
            'return [...document.querySelectorAll("[role=menuitemradio]")].map((item) => [".uid", ".server", ".rolls"].map((part) => item.querySelector(part).textContent))',
          ),
        { timeout: 10000 },
      )
      .toEqual([
        ['100000002', 'America', '2,060 rolls'],
        ['100000001', 'Asia', '2,210 rolls'],
      ])
    expect(await accessibilityViolations(app)).toEqual([])
    await app.screenshot('e2e-mock-account-menu')
    await app.press(DOWN, ENTER)
    await expect
      .poll(switcherLabel, { timeout: 10000 })
      .toBe('Switch account. Current: UID 100000001, Asia server')
    // Its own Character Event Warp rolls, including the 25 the quick refresh added.
    await expect
      .poll(() => textOf(app, '.showing'), { timeout: 10000 })
      .toMatch(/^\s*Showing 1–20 of\s+1,275\s*$/)
  })
  // Pages that disagree on the account are refused as a whole.
  await withMock('mixed-accounts', { keep: true }, async (app) => {
    await retrieveFromFile(app)
    await expect
      .poll(() => textOf(app, '.failed h2'), { timeout: 60000 })
      .toBe('Retrieval Didn’t Finish')
    expect(await textOf(app, '.failed')).toContain(
      'Retrieval stopped at Light Cone Event Warp, page 1. HoYoverse returned history for more than one account, so nothing was kept.',
    )
    await app.screenshot('e2e-mock-mixed-accounts')
  })
  // Each account's rolls are stored apart, and the first account's are untouched.
  const accounts = storedAccounts()
  expect(Object.keys(accounts)).toEqual([
    '100000001 prod_official_asia',
    '100000002 prod_official_usa',
  ])
  expect(accounts['100000001 prod_official_asia']).toEqual(first['100000001 prod_official_asia'])
  expect(accounts['100000002 prod_official_usa'].rolls).toBe(2060)
}, 300000)

test('a retrieval with no history creates no account, and an ended retrieval’s link and review cannot be reused', async () => {
  await withMock('no-history', {}, async (app) => {
    // Before any retrieval there is nothing to retrieve with or to save.
    await expect.poll(() => heading(app), { timeout: 10000 }).toBe('Warp History')
    expect(await retrieveAndSave(app)).toEqual(refused)
    await retrieveFromFile(app)
    await expect
      .poll(() => textOf(app, '.start .note'), { timeout: 30000 })
      .toBe('HoYoverse returned no warp history for this account. Nothing was saved.')
    expect(await stored(app)).toEqual(nothingSaved)
    // The retrieval dropped its link when it ended, and left no review.
    expect(await retrieveAndSave(app)).toEqual(refused)
  })
  expect(storedAccounts()).toEqual({})
  await withMock('history', { keep: true }, async (app) => {
    await retrieveFromFile(app)
    await expect
      .poll(() => textOf(app, '.review h2'), { timeout: 60000 })
      .toBe('Ready to save 2,060 new rolls')
    await click(app, '.review', 'Save 2,060 rolls')
    await expect.poll(() => textOf(app, '.saved h2'), { timeout: 10000 }).toBe('2,060 Rolls Saved')
    // Saving used the review up, and the link went when the retrieval ended.
    expect(await retrieveAndSave(app)).toEqual(refused)
    expect(await stored(app)).toEqual(savedHistory)
  })
  expect(Object.keys(storedAccounts())).toEqual(['100000001 prod_official_asia'])
}, 120000)

// Bounds for a 20,000-roll history, in ms: about three times the slowest of three
// local runs (2026-10-13), as CI runners are slower, and at least 500 ms, since a
// WebDriver round trip and the 20 ms poll are a fair part of the quickest steps.
// Retrieval is paced at 500 ms a request, about 31 of them.
const largeHistoryBounds = {
  retrieve: 55000, // measured 18,379–18,414
  save: 600, // 135–176
  open: 600, // 121–193
  page: 500, // 5–48
  filter: 700, // 168–215
  grid: 500, // 10–53
  icons: 500, // 18–56
}

test('a large history saves and browses within its time bounds', async () => {
  await withMock('large-history', {}, async (app) => {
    const timings: Record<string, number> = {}
    /** Run `action`, then wait for `done` to hold, recording how long both took. */
    const timed = async (
      step: keyof typeof largeHistoryBounds,
      action: () => Promise<unknown>,
      done: () => Promise<boolean>,
    ) => {
      const start = performance.now()
      await action()
      await expect.poll(done, { timeout: largeHistoryBounds[step], interval: 20 }).toBe(true)
      timings[step] = Math.round(performance.now() - start)
    }
    const showing = () => textOf(app, '.showing').then((text) => text?.replace(/\s+/g, ' ').trim())
    await timed(
      'retrieve',
      () => retrieveFromFile(app),
      async () => (await textOf(app, '.review h2')) === 'Ready to save 20,810 new rolls',
    )
    await timed(
      'save',
      () => click(app, '.review', 'Save 20,810 rolls'),
      () => app.execute<boolean>('return document.querySelector(".retrieval > .saved") !== null'),
    )
    await timed(
      'open',
      () =>
        app.execute(
          `[...document.querySelectorAll(".saved a")].find(a => a.textContent.trim() === "View warp history").click()`,
        ),
      async () => (await showing()) === 'Showing 1–20 of 20,000',
    )
    await timed(
      'page',
      () => app.execute('document.querySelector(\'[aria-label="Next page"]\').click()'),
      async () => (await showing()) === 'Showing 21–40 of 20,000',
    )
    // Hiding 3★ rolls leaves the 4★ and 5★ ones, a fraction of the 20,000.
    await timed(
      'filter',
      () => app.execute(`document.querySelector('[aria-label="Show rarities"] .rarity-3').click()`),
      async () =>
        /^Showing 1–20 of [\d,]+$/.test((await showing()) ?? '') &&
        !(await showing())?.endsWith('20,000'),
    )
    await timed(
      'grid',
      () => app.execute('document.querySelector(\'[aria-label="Grid view"]\').click()'),
      () =>
        app.execute<boolean>('return document.querySelectorAll(".roll-grid > li").length === 20'),
    )
    await timed(
      'icons',
      () => app.execute('document.querySelector(\'[aria-label="Icons view"]\').click()'),
      () =>
        app.execute<boolean>(
          'return document.querySelectorAll(".roll-icons [role=img]").length === 20',
        ),
    )
    writeFileSync(`${results}/large-history-timings.json`, `${JSON.stringify(timings, null, 2)}\n`)
    await app.screenshot('e2e-mock-large-history')
  })
}, 600000)

test('a development zoom scales the webview, so WSL can match the Windows display scale', async () => {
  const { app } = await launchMock('no-history', {
    env: { ASTRAL_INDEX_ZOOM: '1.25', ASTRAL_INDEX_SIZE_OVERLAY: '1' },
  })
  try {
    await expect
      .poll(() => textOf(app, '[role=status] h2'), { timeout: 10000 })
      .toBe('No Warp History Yet')
    await app.executeAsync('document.fonts.ready.then(() => arguments[arguments.length - 1]())')
    // The window is 1200 pixels wide inside, so at 125% the page is 960 wide.
    const width = await app.execute<number>('return window.innerWidth')
    expect(Math.abs(width - 960)).toBeLessThanOrEqual(2)
    // Opened with the size overlay, the corner shows the page's size and scale, and
    // follows a resize.
    const overlay = () =>
      app.execute<{ shown?: string; expected: string }>(`
        const scale = Math.round(devicePixelRatio * 100) / 100;
        return {
          shown: document.querySelector('.size-overlay')?.textContent,
          expected: innerWidth + ' × ' + innerHeight + (scale === 1 ? '' : ' · ' + scale + '×'),
        };
      `)
    const matches = async () => {
      const { shown, expected } = await overlay()
      return shown === expected
    }
    await expect.poll(matches, { timeout: 5000 }).toBe(true)
    expect((await overlay()).shown).toMatch(/^\d+ × \d+ · 1\.25×$/)
    await app.screenshot('e2e-mock-zoom')
    await app.command('/window/rect', 'POST', { width: 1280, height: 900 })
    await expect.poll(async () => (await overlay()).shown, { timeout: 5000 }).not.toMatch(/^96\d /)
    expect(await matches()).toBe(true)
    await app.close()
  } catch (error) {
    await snapshotFailure(app)
    throw error
  } finally {
    await app.dispose()
  }
}, 60000)
