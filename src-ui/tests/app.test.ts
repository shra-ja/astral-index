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

const panel = () => document.querySelector<HTMLElement>('.retrieval')!
// Each step of the flow is its own screen inside the panel, rendered only while shown.
const screen = (name: string) => panel().querySelector<HTMLElement>(`.${name}`)
const shown = (name: string) => screen(name) !== null
// Vue keeps a space either side of a label written on its own line.
const button = (container: Element, name: string) =>
  [...container.querySelectorAll('button')].find((each) => each.textContent?.trim() === name)!
const findButton = () => button(screen('start')!, 'Retrieve history')
const fileInput = () => screen('start')!.querySelector<HTMLInputElement>('#cache-file')!
const note = () => screen('start')!.querySelector('.note')?.textContent?.trim()
const progressStatus = () => screen('progress')!.querySelector('[role="status"]')!.textContent
const steps = () =>
  [...screen('progress')!.querySelectorAll('li')].map((step) => [
    step.querySelector('.label')!.textContent?.trim(),
    step.dataset.state,
  ])
const cancelButton = () => screen('progress')!.querySelector<HTMLButtonElement>('.cancel')!
const reviewPanel = () => screen('review')!
const reviewHeading = () => reviewPanel().querySelector('h2')!
const reviewButton = (name: string) => button(reviewPanel(), name)
const rows = () =>
  [...reviewPanel().querySelectorAll('tbody tr')].map((row) =>
    [...row.children].map((cell) => cell.textContent?.trim()),
  )
const failedHeading = () => screen('failed')!.querySelector('h2')!
// Vue updates the page on the next tick, so each helper waits for it.
function choose(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change'))
  return nextTick()
}
function click(element: HTMLElement) {
  element.click()
  return nextTick()
}

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
  expect(screen('start')!.querySelector('h2')?.textContent).toBe('Add Wish History')
  expect(screen('start')!.textContent).toContain('Retrieval for Genshin Impact is coming soon.')
  expect(findButton().disabled).toBe(true)
  expect(fileInput().disabled).toBe(true)
  await follow(named(sidebar(), 'Honkai: Star Rail'))
  expect(location.hash).toBe('#/honkai-star-rail/import')
  expect(findButton().disabled).toBe(false)
  expect(screen('start')!.textContent).not.toContain('coming soon')
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

test('Star Rail offers retrieval from HoYoverse or a chosen cache file; file import is coming soon', async () => {
  await openImport()
  const start = screen('start')!
  expect(start.querySelector('h2')?.textContent).toBe('Add Warp History')
  expect(start.textContent).toContain('downloads your full history from HoYoverse')
  expect(findButton().type).toBe('button')
  expect(
    start.querySelector<HTMLLabelElement>('label[for="cache-file"]')?.textContent?.trim(),
  ).toBe('Choose cache file…')
  expect(fileInput().type).toBe('file')
  const fileImport = button(start, 'Choose file…')
  expect(fileImport.disabled).toBe(true)
  expect(document.getElementById(fileImport.getAttribute('aria-describedby')!)?.textContent).toBe(
    'Coming soon',
  )
  expect(note()).toBeUndefined()
  expect(shown('progress')).toBe(false)
  expect(start.textContent).not.toContain('Nothing is sent anywhere')
})

test('starting retrieval shows progress, then the review, then what was saved', async () => {
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
  expect(shown('start')).toBe(false)
  expect(screen('progress')!.querySelector('h2')?.textContent).toBe('Retrieving Warp History')
  expect(document.activeElement).toBe(cancelButton())
  expect(panel().getAttribute('aria-busy')).toBe('true')
  expect(progressStatus()).toBe('Searching this device, then checking with HoYoverse…')
  expect(steps()).toEqual([
    ['Find the warp history link in the game files', 'active'],
    ['Check the link with HoYoverse', 'active'],
    ['Download your rolls', 'waiting'],
    ['Prepare the review', 'waiting'],
  ])
  extraction.resolve(undefined)
  await settle()
  expect(progressStatus()).toBe('Retrieving your warp history…')
  expect(steps()).toEqual([
    ['Found the warp history link in the game files', 'done'],
    ['Checked the link with HoYoverse', 'done'],
    ['Downloading your rolls', 'active'],
    ['Prepare the review', 'waiting'],
  ])
  progress.onmessage({ kind: 'requesting', gacha_type: '11', page: 2, pages: 1, records: 1532 })
  await nextTick()
  expect(progressStatus()).toBe('Retrieving Character Event Warp, page 2 · 1,532 rolls so far')
  progress.onmessage({ kind: 'retry_pending', delay_ms: 1000 })
  await nextTick()
  expect(progressStatus()).toBe('HoYoverse didn’t respond, so we’ll try again in a moment…')
  retrieval.resolve(review(412, 88))
  await settle()
  expect(calls).toEqual(['extract_automatically', 'retrieve_history'])
  expect(shown('progress')).toBe(false)
  expect(heading()).toBe('Review Import')
  expect(panel().getAttribute('aria-busy')).toBe('false')
  expect(reviewHeading().textContent).toBe('Ready to save 412 new rolls')
  expect(document.activeElement).toBe(reviewHeading())
  expect(reviewPanel().textContent).toContain('UID 100000001')
  expect(reviewPanel().textContent).toContain('synthetic-server')
  expect(
    [...reviewPanel().querySelectorAll('.stat')].map((stat) => [
      stat.querySelector('.stat-label')?.textContent,
      stat.querySelector('.stat-value')?.textContent?.trim(),
    ]),
  ).toEqual([
    ['New rolls', '412'],
    ['Already saved', '88'],
    ['Conflicts', '0'],
    ['Retrieved period', '2 Apr 2026 – 28 Sep 2026'],
  ])
  expect([...reviewPanel().querySelectorAll('thead th')].map((cell) => cell.textContent)).toEqual([
    'Category',
    'New',
    'Already saved',
  ])
  expect(rows()).toEqual([
    ['Stellar Warp', '412', '88'],
    ['Departure Warp', '0', '0'],
    ['Character Event Warp', '0', '0'],
    ['Light Cone Event Warp', '0', '0'],
    ['Character Collaboration Warp', '0', '0'],
    ['Light Cone Collaboration Warp', '0', '0'],
  ])
  expect(reviewPanel().querySelector('.conflicts')).toBeNull()
  const commit = pending()
  serve({ commit_import: commit.handler })
  await click(reviewButton('Save 412 rolls'))
  await settle()
  expect(reviewButton('Save 412 rolls').disabled).toBe(true)
  expect(reviewButton('Discard').disabled).toBe(true)
  expect(panel().getAttribute('aria-busy')).toBe('true')
  commit.resolve({ inserted: 412, duplicates: 88, conflicts: 0 })
  await settle()
  expect(shown('review')).toBe(false)
  expect(heading()).toBe('Import')
  const saved = screen('saved')!
  expect(saved.querySelector('h2')?.textContent).toBe('412 Rolls Saved')
  expect(document.activeElement).toBe(saved.querySelector('h2'))
  expect(saved.textContent).toContain(
    'Added to UID 100000001 (synthetic-server). 88 rolls you already had were left as they were.',
  )
  await click(button(saved, 'Done'))
  await nextTick()
  expect(shown('saved')).toBe(false)
  expect(document.activeElement).toBe(findButton())
  // A later review starts with its buttons enabled again.
  serve({ retrieve_history: () => review(1) })
  findButton().click()
  await settle()
  expect(reviewButton('Save 1 roll').disabled).toBe(false)
  expect(reviewButton('Discard').disabled).toBe(false)
})

test('after saving, the history is one link away', async () => {
  serve({
    retrieve_history: () => review(2),
    commit_import: () => ({ inserted: 2, duplicates: 0, conflicts: 0 }),
  })
  await openImport()
  findButton().click()
  await settle()
  reviewButton('Save 2 rolls').click()
  await settle()
  await follow(named(screen('saved')!, 'View warp history'))
  expect(location.hash).toBe('#/honkai-star-rail/history')
  await openImport()
  expect(shown('start')).toBe(true)
})

test('discarding the review saves nothing and says so', async () => {
  const calls = serve({ retrieve_history: () => review(4) })
  await openImport()
  findButton().click()
  await settle()
  reviewButton('Discard').click()
  await settle()
  expect(calls).toEqual(['extract_automatically', 'retrieve_history', 'discard_import'])
  expect(shown('review')).toBe(false)
  expect(note()).toBe('Discarded the retrieved history. Nothing was saved.')
  expect(document.activeElement).toBe(findButton())
})

test('when everything is already saved, Done replaces Save and Discard', async () => {
  const calls = serve({ retrieve_history: () => review(0, 5) })
  await openImport()
  findButton().click()
  await settle()
  expect(reviewHeading().textContent).toBe('Everything here is already saved')
  expect(reviewButton('Save 0 rolls')).toBeUndefined()
  expect(reviewButton('Discard')).toBeUndefined()
  reviewButton('Done').click()
  await settle()
  expect(calls).toEqual(['extract_automatically', 'retrieve_history', 'discard_import'])
  expect(note()).toBe('Your saved history is already up to date.')
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
  expect(conflicts.textContent).toContain(
    'differ from saved rolls with the same ID, so nothing can be saved',
  )
  expect([...conflicts.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
    'Character Event Warp · 2026-05-01 12:00:00 · ID 1000000000000000001',
    'Stellar Warp · 2026-05-02 13:00:00 · ID 1000000000000000002',
  ])
  const save = reviewButton('Save 2 rolls')
  expect(save.disabled).toBe(true)
  expect(save.getAttribute('aria-describedby')).toBe(conflicts.querySelector('p')!.id)
  // The next review lists only its own conflicts, and Save describes nothing.
  reviewButton('Discard').click()
  await settle()
  serve({ retrieve_history: () => review(2) })
  findButton().click()
  await settle()
  expect(reviewPanel().querySelector('.conflicts')).toBeNull()
  expect(reviewButton('Save 2 rolls').hasAttribute('aria-describedby')).toBe(false)
})

test('a failed save explains what happened, then goes back to the start', async () => {
  serve({
    retrieve_history: () => review(2),
    commit_import: () => reject({ kind: 'conflict' }),
  })
  await openImport()
  findButton().click()
  await settle()
  reviewButton('Save 2 rolls').click()
  await settle()
  expect(shown('review')).toBe(false)
  expect(failedHeading().textContent).toBe('Nothing Was Saved')
  expect(document.activeElement).toBe(failedHeading())
  expect(screen('failed')!.textContent).toContain(
    'Some retrieved rolls differ from ones already saved. Nothing was saved.',
  )
  await click(button(screen('failed')!, 'Back'))
  await nextTick()
  expect(shown('failed')).toBe(false)
  expect(document.activeElement).toBe(findButton())
})

test('a failed retrieval says where it stopped, and Try again starts over', async () => {
  const calls = serve({
    retrieve_history: () => reject({ kind: 'network', gacha_type: '12', page: 2 }),
  })
  await openImport()
  findButton().click()
  await settle()
  expect(failedHeading().textContent).toBe('Couldn’t Reach HoYoverse')
  expect(screen('failed')!.textContent).toContain(
    'Retrieval stopped at Light Cone Event Warp, page 2. We couldn’t reach HoYoverse. Check your internet connection, then try again.',
  )
  expect(calls).toEqual(['extract_automatically', 'retrieve_history'])
  serve({ retrieve_history: () => review(1) })
  button(screen('failed')!, 'Try again').click()
  await settle()
  expect(reviewHeading().textContent).toBe('Ready to save 1 new roll')
})

test('cancelling during validation stops before retrieval and says so', async () => {
  const extraction = pending()
  const calls = serve({ extract_automatically: extraction.handler })
  await openImport()
  await click(findButton())
  await click(cancelButton())
  expect(cancelButton().disabled).toBe(true)
  expect(progressStatus()).toBe('Cancelling…')
  await settle()
  extraction.reject({ kind: 'cancelled' })
  await settle()
  expect(calls).toEqual(['extract_automatically', 'cancel_acquisition'])
  expect(shown('progress')).toBe(false)
  expect(note()).toBe('Retrieval cancelled. Nothing was saved.')
  expect(document.activeElement).toBe(findButton())
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
  expect(progressStatus()).toBe('Retrieving Departure Warp, page 1 · 0 rolls so far')
  retrieval.resolve(review(5))
  await settle()
  expect(reviewHeading().textContent).toBe('Ready to save 5 new rolls')
})

test('when the game files cannot be found, a cache file can be chosen instead', async () => {
  const calls = serve({
    extract_automatically: () => reject({ kind: 'no_cache' }),
    retrieve_history: () => review(6),
  })
  await openImport()
  findButton().click()
  await settle()
  expect(failedHeading().textContent).toBe('Couldn’t Find the Game Files')
  expect(screen('failed')!.textContent).toContain('found the game, but not its web cache')
  const retryFile = screen('failed')!.querySelector<HTMLInputElement>('input[type="file"]')!
  await choose(retryFile, new File(['synthetic'], 'data_2'))
  await settle()
  expect(calls).toEqual(['extract_automatically', 'extract_from_file', 'retrieve_history'])
  expect(reviewHeading().textContent).toBe('Ready to save 6 new rolls')
})

test('choosing a cache file extracts from it without an automatic search first', async () => {
  await openImport()
  const calls = serve({ retrieve_history: () => review(7) })
  fileInput().focus()
  await choose(fileInput(), new File(['synthetic'], 'data_2'))
  expect(progressStatus()).toBe('Reading the file, then checking with HoYoverse…')
  expect(steps()[0]).toEqual(['Find the warp history link in the provided file', 'active'])
  await settle()
  expect(calls).toEqual(['extract_from_file', 'retrieve_history'])
  expect(reviewHeading().textContent).toBe('Ready to save 7 new rolls')
  reviewButton('Discard').click()
  await settle()
  expect(document.activeElement).toBe(fileInput())
  mockIPC(() => reject({ kind: 'invalid_file' }))
  await choose(fileInput(), new File(['synthetic'], 'data_2'))
  await settle()
  expect(failedHeading().textContent).toBe('Couldn’t Read That File')
  expect(screen('failed')!.textContent).toContain(
    'That file couldn’t be read. Try choosing it again.',
  )
  // A file source cannot be retried as is, so the failure offers a file instead.
  expect(button(screen('failed')!, 'Try again')).toBeUndefined()
  await click(button(screen('failed')!, 'Back'))
  await nextTick()
  expect(document.activeElement).toBe(fileInput())
  // A change without a file, such as a cleared selection, starts nothing.
  Object.defineProperty(fileInput(), 'files', { value: [], configurable: true })
  fileInput().dispatchEvent(new Event('change'))
  await nextTick()
  expect(shown('start')).toBe(true)
})
