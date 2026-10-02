import { clearMocks, mockIPC } from '@tauri-apps/api/mocks'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { nextTick } from 'vue'
import type { Channel } from '@tauri-apps/api/core'

// Tauri rejects a command with the native failure as plain data, not an Error.
function reject(failure: unknown): never {
  throw failure
}

// Resolve the mocked IPC and the UI's follow-up rendering.
const settle = () => new Promise((resolve) => setTimeout(resolve))

// Mount the whole app afresh, and wait for the router to show the first view.
beforeEach(async () => {
  document.body.innerHTML = '<div id="app"></div>'
  // The address outlives each app, so every test starts from the opening screen.
  history.replaceState(null, '', '/')
  vi.resetModules()
  await import('../src/main')
  await settle()
})
afterEach(clearMocks)

const panel = () => document.querySelector<HTMLElement>('.retrieval')!
const findButton = () => panel().querySelector('button')!
const fallback = () => panel().querySelector<HTMLElement>('.fallback')!
const fileInput = () => fallback().querySelector<HTMLInputElement>('input[type="file"]')!
const extractionStatus = () => panel().querySelector('[role="status"]')!.textContent

const sidebar = () => document.querySelector<HTMLElement>('nav[aria-label="Main"]')!
// A link's accessible name: its label when it has one, else its text.
const nameOf = (link: Element) => link.getAttribute('aria-label') ?? link.textContent?.trim()
const named = (container: HTMLElement, name: string) =>
  [...container.querySelectorAll<HTMLAnchorElement>('a')].find((link) => nameOf(link) === name)!
// Following a link navigates asynchronously, then the new view renders.
async function follow(link: HTMLAnchorElement) {
  link.click()
  await settle()
}
const openImport = () => follow(named(sidebar(), 'Import'))
const heading = () => document.querySelector('h1')?.textContent
const current = (container: HTMLElement) =>
  [...container.querySelectorAll('a[aria-current]')].map((link) => [
    nameOf(link),
    link.getAttribute('aria-current'),
  ])

// Vue updates the page on the next tick, so each helper waits for it.
function choose(file: File) {
  Object.defineProperty(fileInput(), 'files', { value: [file], configurable: true })
  fileInput().dispatchEvent(new Event('change'))
  return nextTick()
}
function click(element: HTMLElement) {
  element.click()
  return nextTick()
}
const cancelButton = () => panel().querySelector<HTMLButtonElement>('.cancel')!
const start = () => panel().querySelector<HTMLElement>('.start')!
const reviewPanel = () => panel().querySelector<HTMLElement>('.review')!
// The review is rendered only while one is shown.
const reviewShown = () => panel().querySelector('.review') !== null
const reviewHeading = () => reviewPanel().querySelector('h3')!
// Vue keeps a space either side of a label written on its own line.
const reviewButton = (name: string) =>
  [...reviewPanel().querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === name,
  )!
const rows = () =>
  [...reviewPanel().querySelectorAll('tbody tr')].map((row) =>
    [...row.children].map((cell) => cell.textContent),
  )

type Handler = (args: Record<string, unknown>) => unknown
// Route each mocked command to its handler, recording the commands called.
function serve(handlers: Record<string, Handler>) {
  const calls: string[] = []
  mockIPC((cmd, args) => {
    calls.push(cmd)
    return handlers[cmd]?.(args as Record<string, unknown>)
  })
  return calls
}
type Progress = Channel<unknown>
const progressOf = (args: Record<string, unknown>) => args.onProgress as Progress
type Conflict = { id: string; gacha_type: string; time: string }
// A synthetic review with every count in Stellar Warp.
const review = (inserted: number, duplicates = 0, conflicts: Conflict[] = []) => ({
  kind: 'review',
  uid: '100000001',
  server: 'synthetic-server',
  timezone: 8,
  summary: { inserted, duplicates, conflicts: conflicts.length },
  categories: ['1', '2', '11', '12', '21', '22'].map((gacha_type, index) =>
    index === 0
      ? { gacha_type, inserted, duplicates, conflicts: conflicts.length }
      : { gacha_type, inserted: 0, duplicates: 0, conflicts: 0 },
  ),
  earliest: '2026-04-02 10:00:00',
  latest: '2026-09-28 21:30:00',
  conflicts,
})
// A command that stays pending until the test resolves or rejects it.
function pending() {
  let resolve!: (value: unknown) => void
  let reject!: (error: unknown) => void
  const promise = new Promise((done, fail) => {
    resolve = done
    reject = fail
  })
  return { handler: () => promise, resolve, reject }
}

test('opens on Star Rail’s warp history, with the games and screens in a sidebar', () => {
  expect(location.hash).toBe('#/honkai-star-rail/history')
  expect(heading()).toBe('Warp History')
  expect(document.querySelector('header')?.textContent).toContain('Honkai: Star Rail')
  expect(current(sidebar())).toEqual([
    ['Honkai: Star Rail', 'true'],
    ['Warp History', 'page'],
  ])
  expect(named(sidebar(), 'Genshin Impact').getAttribute('href')).toBe('#/genshin-impact/history')
  expect(named(sidebar(), 'Import').getAttribute('href')).toBe('#/honkai-star-rail/import')
  expect(sidebar().textContent).toContain('Stored on this device')
  expect(document.querySelector('[role="status"]')?.textContent).toContain('No Warp History Yet')
  expect(document.querySelector('.retrieval')).toBeNull()
  expect(document.body.textContent).not.toMatch(/pity|guarantee|win rate/i)
})

test('switching games keeps the screen, and each game names its own history', async () => {
  await follow(named(sidebar(), 'Genshin Impact'))
  expect(location.hash).toBe('#/genshin-impact/history')
  expect(heading()).toBe('Wish History')
  expect(current(sidebar())).toEqual([
    ['Genshin Impact', 'true'],
    ['Wish History', 'page'],
  ])
  expect(document.querySelector('[role="status"]')?.textContent).toContain('No Wish History Yet')
  await openImport()
  expect(location.hash).toBe('#/genshin-impact/import')
  expect(heading()).toBe('Import')
  expect(document.querySelector('main')?.textContent).toContain(
    'Retrieval for Genshin Impact is coming soon.',
  )
  expect(panel().hidden).toBe(true)
  await follow(named(sidebar(), 'Honkai: Star Rail'))
  expect(location.hash).toBe('#/honkai-star-rail/import')
  expect(panel().hidden).toBe(false)
})

test('the empty history leads to the Import screen', async () => {
  await follow(named(document.querySelector('main')!, 'Go to Import'))
  expect(location.hash).toBe('#/honkai-star-rail/import')
  expect(heading()).toBe('Import')
})

test('a retrieval keeps running while another screen is shown', async () => {
  await openImport()
  const retrieval = pending()
  serve({ retrieve_history: retrieval.handler })
  findButton().click()
  await settle()
  await follow(named(sidebar(), 'Warp History'))
  retrieval.resolve(review(3))
  await settle()
  await openImport()
  expect(reviewHeading().textContent).toBe('Ready to save 3 new rolls')
})

test('an unknown address returns to Star Rail’s history', async () => {
  const { default: router } = await import('../src/router')
  await router.push('/somewhere/else')
  await settle()
  expect(location.hash).toBe('#/honkai-star-rail/history')
})

test('Star Rail offers retrieval, automatically or from a file, and says it contacts HoYoverse', async () => {
  await openImport()
  expect(panel().hidden).toBe(false)
  expect(findButton().textContent).toBe('Start retrieval')
  expect(findButton().type).toBe('button')
  expect(fallback().hidden).toBe(false)
  expect(document.querySelector<HTMLLabelElement>('.fallback label')?.htmlFor).toBe(fileInput().id)
  expect(extractionStatus()).toBe('')
  expect(cancelButton().hidden).toBe(true)
  expect(cancelButton().type).toBe('button')
  expect(panel().textContent).toContain('checks it with HoYoverse')
  expect(panel().textContent).not.toContain('Nothing is sent anywhere')
})

test('starting retrieval validates, retrieves with progress, then reviews and saves', async () => {
  const extraction = pending()
  const retrieval = pending()
  let progress!: Progress
  const calls = serve({
    extract_automatically: extraction.handler,
    retrieve_history: (args) => {
      progress = progressOf(args)
      return retrieval.handler()
    },
  })
  await openImport()
  findButton().focus()
  await click(findButton())
  expect(start().hidden).toBe(true)
  expect(cancelButton().hidden).toBe(false)
  expect(document.activeElement).toBe(cancelButton())
  expect(panel().getAttribute('aria-busy')).toBe('true')
  expect(extractionStatus()).toBe('Searching this device, then checking with HoYoverse…')
  extraction.resolve(undefined)
  await settle()
  expect(extractionStatus()).toBe('Retrieving your warp history…')
  progress.onmessage({ kind: 'requesting', gacha_type: '11', page: 2, pages: 1, records: 1532 })
  await nextTick()
  expect(extractionStatus()).toBe('Retrieving Character Event Warp, page 2 · 1,532 rolls so far')
  progress.onmessage({ kind: 'retry_pending', delay_ms: 1000 })
  await nextTick()
  expect(extractionStatus()).toBe('HoYoverse didn’t respond, so we’ll try again in a moment…')
  progress.onmessage({ kind: 'requesting', gacha_type: '1', page: 1, pages: 0, records: 1 })
  await nextTick()
  expect(extractionStatus()).toBe('Retrieving Stellar Warp, page 1 · 1 roll so far')
  retrieval.resolve(review(412, 88))
  await settle()
  expect(calls).toEqual(['extract_automatically', 'retrieve_history'])
  expect(reviewShown()).toBe(true)
  expect(start().hidden).toBe(true)
  expect(cancelButton().hidden).toBe(true)
  expect(panel().getAttribute('aria-busy')).toBe('false')
  expect(extractionStatus()).toBe('')
  expect(reviewHeading().textContent).toBe('Ready to save 412 new rolls')
  expect(document.activeElement).toBe(reviewHeading())
  expect(reviewPanel().textContent).toContain(
    'UID 100000001 · synthetic-server · 2026-04-02 to 2026-09-28 (server time)',
  )
  expect([...reviewPanel().querySelectorAll('thead th')].map((cell) => cell.textContent)).toEqual([
    'Warp',
    'New',
    'Already saved',
    'Conflicts',
  ])
  expect(rows()).toEqual([
    ['Stellar Warp', '412', '88', '0'],
    ['Departure Warp', '0', '0', '0'],
    ['Character Event Warp', '0', '0', '0'],
    ['Light Cone Event Warp', '0', '0', '0'],
    ['Character Collaboration Warp', '0', '0', '0'],
    ['Light Cone Collaboration Warp', '0', '0', '0'],
  ])
  expect(reviewPanel().querySelector<HTMLElement>('.conflicts')!.hidden).toBe(true)
  expect(reviewButton('Done').hidden).toBe(true)
  expect(reviewButton('Discard').hidden).toBe(false)
  const commit = pending()
  serve({ commit_import: commit.handler })
  await click(reviewButton('Save to this device'))
  expect(extractionStatus()).toBe('Saving…')
  // The review panel re-renders on the next tick.
  await settle()
  expect(reviewButton('Save to this device').disabled).toBe(true)
  expect(reviewButton('Discard').disabled).toBe(true)
  expect(panel().getAttribute('aria-busy')).toBe('true')
  commit.resolve({ inserted: 412, duplicates: 88, conflicts: 0 })
  await settle()
  expect(extractionStatus()).toBe('Saved 412 new rolls to this device. 88 were already saved.')
  expect(reviewShown()).toBe(false)
  expect(start().hidden).toBe(false)
  expect(panel().getAttribute('aria-busy')).toBe('false')
  expect(document.activeElement).toBe(findButton())
  // A later review starts with its buttons enabled again.
  serve({ retrieve_history: () => review(1) })
  findButton().click()
  await settle()
  expect(reviewButton('Save to this device').disabled).toBe(false)
  expect(reviewButton('Discard').disabled).toBe(false)
})

test('discarding the review saves nothing', async () => {
  const calls = serve({ retrieve_history: () => review(4) })
  await openImport()
  findButton().click()
  await settle()
  reviewButton('Discard').click()
  await settle()
  expect(calls).toEqual(['extract_automatically', 'retrieve_history', 'discard_import'])
  expect(extractionStatus()).toBe('Discarded the retrieved history. Nothing was saved.')
  expect(reviewShown()).toBe(false)
  expect(start().hidden).toBe(false)
  expect(document.activeElement).toBe(findButton())
})

test('when everything is already saved, Done replaces Save and Discard', async () => {
  const calls = serve({ retrieve_history: () => review(0, 5) })
  await openImport()
  findButton().click()
  await settle()
  expect(reviewHeading().textContent).toBe('Everything here is already saved')
  expect(reviewButton('Save to this device').hidden).toBe(true)
  expect(reviewButton('Discard').hidden).toBe(true)
  expect(reviewButton('Done').hidden).toBe(false)
  reviewButton('Done').click()
  await settle()
  expect(calls).toEqual(['extract_automatically', 'retrieve_history', 'discard_import'])
  expect(extractionStatus()).toBe('Your saved history is already up to date.')
  expect(reviewShown()).toBe(false)
})

test('conflicting rolls are listed and cannot be saved', async () => {
  serve({
    retrieve_history: () =>
      review(2, 0, [
        { id: '1000000000000000001', gacha_type: '11', time: '2026-05-01 12:00:00' },
        { id: '1000000000000000002', gacha_type: '1', time: '2026-05-02 13:00:00' },
      ]),
  })
  await openImport()
  findButton().click()
  await settle()
  expect(reviewHeading().textContent).toBe('Some rolls conflict with your saved history')
  const conflicts = reviewPanel().querySelector<HTMLElement>('.conflicts')!
  expect(conflicts.hidden).toBe(false)
  expect(conflicts.textContent).toContain(
    'differ from saved rolls with the same ID, so nothing can be saved',
  )
  expect([...conflicts.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
    'Character Event Warp · 2026-05-01 12:00:00 · ID 1000000000000000001',
    'Stellar Warp · 2026-05-02 13:00:00 · ID 1000000000000000002',
  ])
  const save = reviewButton('Save to this device')
  expect(save.hidden).toBe(false)
  expect(save.disabled).toBe(true)
  expect(save.getAttribute('aria-describedby')).toBe(conflicts.querySelector('p')!.id)
  expect(reviewButton('Discard').hidden).toBe(false)
  // The next review lists only its own conflicts, and Save describes nothing.
  reviewButton('Discard').click()
  await settle()
  serve({ retrieve_history: () => review(2) })
  findButton().click()
  await settle()
  // The panel renders each review afresh, so look its elements up again.
  const next = reviewPanel().querySelector<HTMLElement>('.conflicts')!
  expect(next.querySelectorAll('li')).toHaveLength(0)
  expect(next.hidden).toBe(true)
  expect(reviewButton('Save to this device').hasAttribute('aria-describedby')).toBe(false)
})

test('a failed save explains what happened and returns to the start', async () => {
  serve({
    retrieve_history: () => review(2),
    commit_import: () => reject({ kind: 'conflict' }),
  })
  await openImport()
  findButton().click()
  await settle()
  reviewButton('Save to this device').click()
  await settle()
  expect(extractionStatus()).toBe(
    'Some retrieved rolls differ from ones already saved. Nothing was saved.',
  )
  expect(reviewShown()).toBe(false)
  expect(start().hidden).toBe(false)
  expect(document.activeElement).toBe(findButton())
})

test('a failed retrieval explains itself and where it stopped', async () => {
  const calls = serve({
    retrieve_history: () => reject({ kind: 'network', gacha_type: '12', page: 2 }),
  })
  await openImport()
  findButton().click()
  await settle()
  expect(extractionStatus()).toBe(
    'Retrieval stopped at Light Cone Event Warp, page 2. We couldn’t reach HoYoverse. Check your internet connection, then try again.',
  )
  expect(calls).toEqual(['extract_automatically', 'retrieve_history'])
  expect(start().hidden).toBe(false)
})

test('cancelling during validation stops before retrieval', async () => {
  const extraction = pending()
  const calls = serve({ extract_automatically: extraction.handler })
  await openImport()
  await click(findButton())
  await click(cancelButton())
  expect(cancelButton().disabled).toBe(true)
  expect(extractionStatus()).toBe('Cancelling…')
  await settle()
  extraction.reject({ kind: 'cancelled' })
  await settle()
  expect(calls).toEqual(['extract_automatically', 'cancel_acquisition'])
  expect(extractionStatus()).toBe('Retrieval cancelled. Nothing was saved.')
  expect(cancelButton().hidden).toBe(true)
  expect(start().hidden).toBe(false)
})

test('if cancelling cannot be sent, retrieval carries on and can be cancelled again', async () => {
  const retrieval = pending()
  let progress!: Progress
  serve({
    retrieve_history: (args) => {
      progress = progressOf(args)
      return retrieval.handler()
    },
    cancel_acquisition: () => reject('cancel_acquisition not allowed'),
  })
  await openImport()
  findButton().click()
  await settle()
  cancelButton().click()
  await settle()
  expect(cancelButton().disabled).toBe(false)
  progress.onmessage({ kind: 'requesting', gacha_type: '2', page: 1, pages: 0, records: 0 })
  await nextTick()
  expect(extractionStatus()).toBe('Retrieving Departure Warp, page 1 · 0 rolls so far')
  retrieval.resolve(review(5))
  await settle()
  expect(reviewHeading().textContent).toBe('Ready to save 5 new rolls')
})

test('a failed automatic search explains what to do next', async () => {
  const calls = serve({
    extract_automatically: () => reject({ kind: 'no_cache' }),
  })
  await openImport()
  findButton().click()
  await settle()
  expect(extractionStatus()).toContain('found the game, but not its web cache')
  expect(calls).toEqual(['extract_automatically'])
  expect(start().hidden).toBe(false)
})

test('choosing a cache file extracts from it without an automatic search first', async () => {
  await openImport()
  const calls = serve({ retrieve_history: () => review(7) })
  fileInput().focus()
  await choose(new File(['synthetic'], 'data_2'))
  expect(extractionStatus()).toBe('Reading the file, then checking with HoYoverse…')
  expect(start().hidden).toBe(true)
  await settle()
  expect(calls).toEqual(['extract_from_file', 'retrieve_history'])
  expect(reviewHeading().textContent).toBe('Ready to save 7 new rolls')
  reviewButton('Discard').click()
  await settle()
  expect(document.activeElement).toBe(fileInput())
  mockIPC(() => reject({ kind: 'invalid_file' }))
  await choose(new File(['synthetic'], 'data_2'))
  await settle()
  expect(extractionStatus()).toBe('That file couldn’t be read. Try choosing it again.')
  expect(document.activeElement).toBe(fileInput())
  // A change without a file, such as a cleared selection, leaves the last result.
  Object.defineProperty(fileInput(), 'files', { value: [], configurable: true })
  fileInput().dispatchEvent(new Event('change'))
  expect(extractionStatus()).toContain('couldn’t be read')
  expect(start().hidden).toBe(false)
})
