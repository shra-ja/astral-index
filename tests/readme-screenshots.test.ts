// The README's screenshots: `npm run readme:screenshots` drives the mock debug binary
// (decision 0014) through its synthetic history, never a real account, and saves to
// docs/assets/readme/ for committing: the History screen in a full window, framed as a
// Windows 11 window for the hero, and for the gallery, the import review and the
// History screen's grid, filtered, without the sidebar in a smaller window. Run it
// again whenever those screens change.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { backendCargo, backendEnvironment } from '../tooling/backend-coverage'
import { outputs } from '../tooling/outputs'
import { launch, type AppSession } from './app-driver'

const folder = 'docs/assets/readme'
/** The windows' sizes in CSS pixels; GTK draws them at twice the density. */
const full = { width: 1280, height: 800 }
/** The narrowest window that keeps the History screen's filters on one line and
 * its category tabs in view, once the sidebar is hidden. */
const gallery = { width: 760, height: 800 }
/** The day the gallery's History screen takes as today, the day after the newest roll. */
const today = '2026-09-08T04:00:00Z'

/** Save what the window shows, once the next frame has painted. */
async function save(app: AppSession, name: string, into = folder) {
  await app.execute('document.activeElement?.blur()')
  await app.executeAsync(
    'const done = arguments[arguments.length - 1]; requestAnimationFrame(() => requestAnimationFrame(() => done()))',
  )
  const png = Buffer.from(await app.command<string>('/screenshot'), 'base64')
  writeFileSync(`${into}/${name}`, png)
  return png
}

/** The window's caption buttons, drawn as Windows 11 draws them, 10 pixels square. */
const glyphs = [
  '<path d="M0 5h10" />',
  '<rect x="0.5" y="0.5" width="9" height="9" rx="1" fill="none" />',
  '<path d="M0 0l10 10M10 0l-10 10" />',
].map(
  (shape) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.5 -0.5 11 11" stroke="#e8eaee" stroke-width="1">${shape}</svg>`)}`,
)

/**
 * The hero's surroundings: the brand's blue, violet and plum, darkened, fading towards
 * the bottom to the dark theme's page colour, with a soft violet light behind the
 * window's top, a faint light rim and a strong shadow.
 */
const look = {
  background: [
    'radial-gradient(50% 40% at 50% 8%, rgba(181, 160, 252, 0.22), transparent 100%)',
    'linear-gradient(to bottom, transparent 30%, rgba(13, 17, 23, 0.8) 100%)',
    'linear-gradient(135deg, #20365a 0%, #2f2758 50%, #4a2342 100%)',
  ].join(', '),
  shadow: '0 28px 80px rgba(0, 0, 0, 0.7), 0 6px 20px rgba(0, 0, 0, 0.5)',
  rim: 'rgba(255, 255, 255, 0.11)',
  margin: 72,
}

/**
 * The window's title font: Segoe UI, as Windows draws it, read from the Windows drive
 * when WSL can reach it; otherwise the title falls back to the app's own font.
 */
const segoe = '/mnt/c/Windows/Fonts/segoeui.ttf'

/**
 * Replace the page with `screenshot` in a window frame like Windows 11's, laid out
 * so the screenshot keeps its own pixels, and resize the window to fit, so the hero
 * reads as a desktop app at a glance. The title uses `font`, Segoe UI, when given.
 */
async function frame(app: AppSession, screenshot: Buffer, icon: Buffer, font?: Buffer) {
  const size = {
    width: full.width + 2 + 2 * look.margin,
    height: full.height + 34 + 2 * look.margin,
  }
  await app.command('/window/rect', 'POST', size)
  await app.command('/execute/async', 'POST', {
    script: `const [shot, icon, glyphs, look, font, width, done] = arguments
      const el = (tag, style, ...children) => { const node = document.createElement(tag); Object.assign(node.style, style); node.append(...children); return node }
      const image = (src, style) => { const node = el('img', style); node.src = src; return node }
      const buttons = glyphs.map(src => el('span', { width: '46px', height: '32px', display: 'grid', placeItems: 'center' }, image(src, { width: '10px', height: '10px' })))
      const bar = el('div', { display: 'flex', alignItems: 'center', height: '32px', background: '#0d1017', color: '#e8eaee', font: '12px "Segoe UI", "Hanken Grotesk Variable", sans-serif' },
        image(icon, { width: '16px', height: '16px', margin: '0 10px 0 14px' }), el('span', { flex: '1' }, 'Astral Index'), ...buttons)
      const window = el('div', { borderRadius: '8px', overflow: 'hidden', border: '1px solid ' + look.rim, boxShadow: look.shadow },
        bar, image(shot, { display: 'block', width: width + 'px' }))
      document.documentElement.style.background = look.background
      document.body.replaceChildren(el('div', { height: '100vh', display: 'grid', placeItems: 'center', background: look.background }, window))
      Object.assign(document.body.style, { margin: '0', overflow: 'hidden', background: look.background })
      const bytes = font && Uint8Array.from(atob(font), c => c.charCodeAt(0))
      const loaded = bytes ? new FontFace('Segoe UI', bytes).load().then(face => document.fonts.add(face)) : Promise.resolve()
      loaded.then(() => Promise.all([...document.images].map(image => image.decode()))).then(() => done())`,
    args: [
      `data:image/png;base64,${screenshot.toString('base64')}`,
      `data:image/png;base64,${icon.toString('base64')}`,
      glyphs,
      look,
      font?.toString('base64'),
      full.width,
    ],
  })
}

/** Show or hide the sidebar, so a gallery screenshot holds only the screen. */
const sidebar = (app: AppSession, shown: boolean) =>
  app.execute(`document.querySelector("nav.sidebar").style.display = "${shown ? '' : 'none'}"`)

const click = (app: AppSession, selector: string, label: string) =>
  app.execute(
    `[...document.querySelectorAll("${selector}")].find(b => b.textContent.trim().startsWith("${label}")).click()`,
  )

const text = (app: AppSession, selector: string) =>
  app.execute<string | undefined>(
    `return document.querySelector("${selector}")?.textContent?.trim()`,
  )

test('take the README screenshots', async () => {
  backendCargo(['build', '--locked', '--offline', '--features', 'mock'])
  const { results } = outputs()
  const data = resolve(results, 'readme-screenshots')
  rmSync(data, { recursive: true, force: true })
  mkdirSync(data, { recursive: true })
  mkdirSync(folder, { recursive: true })
  // A synthetic cache holding a history link, which only the mock answers.
  const cache = resolve(data, 'data_2')
  writeFileSync(
    cache,
    '1/0/https://public-operation-hkrpg-sg.hoyoverse.com/common/hkrpg_gacha_record/api/getGachaLog?authkey=synthetic-readme-key&authkey_ver=1&sign_type=2&game_biz=hkrpg_global&lang=en\0',
  )
  const app = await launch('astral-index-mock', {
    ...backendEnvironment(),
    WSL_DISTRO_NAME: '',
    XDG_DATA_HOME: data,
    ASTRAL_INDEX_MOCK_SCENARIO: 'history',
    GDK_SCALE: '2',
  })
  try {
    await app.command('/window/rect', 'POST', full)
    await expect.poll(() => text(app, 'h1'), { timeout: 10000 }).toBe('Warp History')
    await app.executeAsync('document.fonts.ready.then(() => arguments[arguments.length - 1]())')
    await app.execute('document.querySelector("nav a[aria-label=Import]").click()')
    await expect.poll(() => text(app, 'h1'), { timeout: 5000 }).toBe('Import')
    await app.command('/window/rect', 'POST', gallery)
    await sidebar(app, false)
    await app.chooseFile('#cache-file', cache)
    await expect.poll(() => text(app, '.review h2'), { timeout: 60000 }).toMatch(/^Ready to save/)
    const width = (await save(app, 'import-review.png')).readUInt32BE(16)
    await click(app, '.review button', 'Save')
    await expect.poll(() => text(app, '.saved h2'), { timeout: 10000 }).toMatch(/Rolls Saved$/)
    await sidebar(app, true)
    await app.command('/window/rect', 'POST', full)
    await click(app, '.saved a', 'View warp history')
    await expect.poll(() => text(app, 'h1'), { timeout: 5000 }).toBe('Warp History')
    const rows = (selector: string) =>
      app.execute<number>(`return document.querySelectorAll("${selector}").length`)
    await expect.poll(() => rows('.roll-list [role=row]'), { timeout: 10000 }).toBeGreaterThan(10)
    const plain = await save(app, 'history-window.png', data)
    // The quick ranges count back from today, so the page takes the day after the
    // synthetic history ends as today.
    await app.execute(
      `const fixed = Date.parse("${today}"); const Real = Date; window.Date = class extends Real { constructor(...args) { super(...(args.length ? args : [fixed])) } static now() { return fixed } }`,
    )
    await app.command('/window/rect', 'POST', gallery)
    await sidebar(app, false)
    await app.execute('document.querySelector("button[aria-label=\'Grid view\']").click()')
    await app.execute(`document.querySelector('[aria-label="Show rarities"] .rarity-3').click()`)
    await app.execute(`document.querySelector('main button[aria-haspopup="dialog"]').click()`)
    await click(app, '[role=dialog] button', 'Last 6 months')
    await click(app, '[role=dialog] button', 'Done')
    await expect
      .poll(() => text(app, "main button[aria-haspopup='dialog']"), { timeout: 10000 })
      .toBe('Last 6 months')
    await expect.poll(() => rows('.roll-grid > *'), { timeout: 10000 }).toBeGreaterThan(5)
    await save(app, 'history-grid.png')
    // The hero: the History screen framed, its title in Segoe UI when it can be read.
    const font = existsSync(segoe) ? readFileSync(segoe) : undefined
    await frame(app, plain, readFileSync('src-tauri/icons/64x64.png'), font)
    await save(app, 'history.png')
    console.log(`hero title in ${font ? 'Segoe UI' : 'the app font, as Segoe UI was not found'}`)
    console.log(`gallery screenshots ${width} px wide for a ${gallery.width} px window`)
    await app.close()
  } finally {
    await app.dispose()
  }
}, 300000)
