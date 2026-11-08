import { beforeEach, expect, test, vi } from 'vitest'
import {
  cancelAcquisition,
  chooseCacheFile,
  chooseHistoryFile,
  commitImport,
  discardImport,
  extractAutomatically,
  extractFromFile,
  previewFileAccount,
  readHistoryFile,
  retrieveHistory,
  type Failure,
  type FileAccount,
  type FileContents,
  type Progress,
  type Retrieved,
  type Review,
} from '../commands'
import { forgetAccountChoice } from './useHistory'
import { useRetrieval } from './useRetrieval'

vi.mock('../commands')
vi.mock('./useHistory')
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(extractAutomatically).mockResolvedValue(undefined)
  vi.mocked(chooseCacheFile).mockResolvedValue({ chosen: 'data_2' })
  vi.mocked(extractFromFile).mockResolvedValue(undefined)
  vi.mocked(cancelAcquisition).mockResolvedValue(undefined)
  vi.mocked(discardImport).mockResolvedValue(undefined)
  vi.mocked(chooseHistoryFile).mockResolvedValue({ chosen: 'export.json' })
})

// Resolve the mocked commands and the flow's follow-up steps.
const settle = () => new Promise((resolve) => setTimeout(resolve))
// A synthetic review with every count in Stellar Warp.
const review = (inserted: number): Review => ({
  uid: '100000001',
  server: 'synthetic-server',
  timezone: 8,
  summary: { inserted, duplicates: 0, conflicts: 0, pool_ids_added: 0 },
  new_five_star: 1,
  new_four_star: 3,
  categories: [{ gacha_type: '1', inserted, duplicates: 0, conflicts: 0, pool_ids_added: 0 }],
  earliest: '2026-04-02 10:00:00',
  latest: '2026-09-28 21:30:00',
  conflicts: [],
})
const retrieved = (inserted: number) => ({
  retrieved: { kind: 'review', ...review(inserted) } as Retrieved,
})
// A command result that stays pending until the test settles it.
function pending<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
// Serve retrieval from a pending result, capturing the progress callback.
function pendingRetrieval() {
  const result = pending<Awaited<ReturnType<typeof retrieveHistory>>>()
  let progress!: (progress: Progress) => void
  vi.mocked(retrieveHistory).mockImplementation((_, onProgress) => {
    progress = onProgress
    return result.promise
  })
  return { resolve: result.resolve, progress: (update: Progress) => progress(update) }
}
// A flow showing the review of a retrieval with the given number of new rolls.
async function reviewing(inserted = 2) {
  vi.mocked(retrieveHistory).mockResolvedValue(retrieved(inserted))
  const flow = useRetrieval()
  void flow.searchDevice()
  await settle()
  return flow
}

test('starts idle, with nothing to say or review', () => {
  const flow = useRetrieval()
  expect(flow.phase.value).toBe('idle')
  expect(flow.status.value).toBe('')
  expect(flow.review.value).toBeUndefined()
  expect(flow.outcome.value).toBeUndefined()
  expect(flow.cancelling.value).toBe(false)
})

test('searching the device validates, retrieves with progress, then shows the review', async () => {
  const extraction = pending<Failure | undefined>()
  vi.mocked(extractAutomatically).mockReturnValue(extraction.promise)
  const retrieval = pendingRetrieval()
  const flow = useRetrieval()
  void flow.searchDevice()
  expect(flow.phase.value).toBe('acquiring')
  expect(flow.source.value).toBe('device')
  expect(flow.stage.value).toBe('finding')
  expect(flow.status.value).toBe('Searching this device, then checking with HoYoverse…')
  extraction.resolve(undefined)
  await settle()
  expect(flow.stage.value).toBe('downloading')
  expect(flow.status.value).toBe('Retrieving your warp history…')
  retrieval.progress({ kind: 'requesting', gacha_type: '11', page: 2, pages: 1, records: 1532 })
  expect(flow.status.value).toBe('Retrieving Character Event Warp, page 2 · 1,532 rolls so far')
  retrieval.resolve(retrieved(412))
  await settle()
  expect(flow.phase.value).toBe('reviewing')
  expect(flow.status.value).toBe('')
  expect(flow.review.value).toEqual(expect.objectContaining(review(412)))
  expect(extractFromFile).not.toHaveBeenCalled()
})

test('downloading keeps each category’s last page, the rolls so far and any retry wait', async () => {
  const retrieval = pendingRetrieval()
  const flow = useRetrieval()
  void flow.searchDevice()
  await settle()
  // Nothing has been requested yet.
  expect(flow.download.value).toBeUndefined()
  for (const page of [1, 2, 3]) {
    retrieval.progress({ kind: 'requesting', gacha_type: '1', page, pages: page - 1, records: 0 })
  }
  // A quick refresh ended Stellar Warp at saved rolls.
  retrieval.progress({ kind: 'up_to_date', gacha_type: '1' })
  retrieval.progress({ kind: 'requesting', gacha_type: '2', page: 1, pages: 3, records: 45 })
  retrieval.progress({ kind: 'retry_pending', delay_ms: 2000 })
  expect(flow.download.value).toEqual({
    category: '2',
    page: 1,
    pages: { '1': 3, '2': 1 },
    records: 45,
    retrying: true,
    upToDate: ['1'],
  })
  retrieval.progress({ kind: 'requesting', gacha_type: '2', page: 1, pages: 3, records: 45 })
  expect(flow.download.value?.retrying).toBe(false)
  retrieval.resolve(retrieved(45))
  await settle()
  // The next retrieval starts from nothing.
  void flow.discard()
  await settle()
  void flow.searchDevice()
  expect(flow.download.value).toBeUndefined()
})

test('retrieval asks for new rolls only, unless the full history is chosen', async () => {
  vi.mocked(retrieveHistory).mockResolvedValue({ retrieved: { kind: 'no_history' } })
  const flow = useRetrieval()
  expect(flow.mode.value).toBe('new')
  await flow.searchDevice()
  flow.chooseMode('full')
  expect(flow.mode.value).toBe('full')
  await flow.chooseCache()
  expect(vi.mocked(retrieveHistory).mock.calls.map(([mode]) => mode)).toEqual(['new', 'full'])
})

test('a retry before the first page leaves nothing to show', async () => {
  const retrieval = pendingRetrieval()
  const flow = useRetrieval()
  void flow.searchDevice()
  await settle()
  retrieval.progress({ kind: 'retry_pending', delay_ms: 2000 })
  expect(flow.download.value).toBeUndefined()
})

test('a chosen file is read instead of searching, and its failures are explained as a file', async () => {
  let answer: (choice: { chosen: string }) => void = () => undefined
  vi.mocked(chooseCacheFile).mockReturnValue(new Promise((resolve) => (answer = resolve)))
  let extracted: (failure: Failure) => void = () => undefined
  vi.mocked(extractFromFile).mockReturnValue(new Promise((resolve) => (extracted = resolve)))
  const flow = useRetrieval()
  // Nothing shows while the native dialog is open.
  const choosing = flow.chooseCache()
  await settle()
  expect(flow.phase.value).toBe('idle')
  answer({ chosen: 'data_2' })
  await settle()
  expect(flow.source.value).toBe('cache')
  expect(flow.status.value).toBe('Reading the file, then checking with HoYoverse…')
  extracted({ kind: 'no_request' })
  await choosing
  expect(extractFromFile).toHaveBeenCalledWith()
  expect(extractAutomatically).not.toHaveBeenCalled()
  expect(retrieveHistory).not.toHaveBeenCalled()
  expect(flow.phase.value).toBe('idle')
  expect(flow.outcome.value).toEqual({
    kind: 'failed',
    title: 'Couldn’t Find a Warp History Link',
    message: expect.stringContaining('That file doesn’t contain a warp history request.'),
  })
})

test('a failed search is explained, and nothing is retrieved', async () => {
  vi.mocked(extractAutomatically).mockResolvedValue({ kind: 'no_cache' })
  const flow = useRetrieval()
  void flow.searchDevice()
  await settle()
  expect(flow.phase.value).toBe('idle')
  expect(flow.outcome.value).toEqual({
    kind: 'failed',
    title: 'Couldn’t Find the Game Files',
    message: expect.stringContaining('We found the game, but not its web cache.'),
  })
  expect(retrieveHistory).not.toHaveBeenCalled()
})

test('a failed retrieval says where it stopped', async () => {
  vi.mocked(retrieveHistory).mockResolvedValue({
    failure: { kind: 'network', location: { gacha_type: '1', page: 3 } },
  })
  const flow = useRetrieval()
  void flow.searchDevice()
  await settle()
  expect(flow.phase.value).toBe('idle')
  expect(flow.outcome.value).toEqual({
    kind: 'failed',
    title: 'Couldn’t Reach HoYoverse',
    message:
      'Retrieval stopped at Stellar Warp, page 3. We couldn’t reach HoYoverse. Check your internet connection, then try again.',
  })
})

test('no history is reported without a review', async () => {
  vi.mocked(retrieveHistory).mockResolvedValue({ retrieved: { kind: 'no_history' } })
  const flow = useRetrieval()
  void flow.searchDevice()
  await settle()
  expect(flow.phase.value).toBe('idle')
  expect(flow.review.value).toBeUndefined()
  expect(flow.outcome.value).toEqual({
    kind: 'note',
    message: 'HoYoverse returned no warp history for this account. Nothing was saved.',
  })
})

test('cancelling during validation stops before retrieval, even if validation succeeds', async () => {
  const extraction = pending<Failure | undefined>()
  vi.mocked(extractAutomatically).mockReturnValue(extraction.promise)
  const flow = useRetrieval()
  void flow.searchDevice()
  void flow.cancel()
  expect(flow.cancelling.value).toBe(true)
  expect(flow.status.value).toBe('Cancelling…')
  expect(cancelAcquisition).toHaveBeenCalledOnce()
  extraction.resolve(undefined)
  await settle()
  expect(retrieveHistory).not.toHaveBeenCalled()
  expect(flow.phase.value).toBe('idle')
  expect(flow.outcome.value).toEqual({
    kind: 'note',
    message: 'Retrieval cancelled. Nothing was saved.',
  })
})

test('a cancel that the native side reports as a failure is a note, not a failure', async () => {
  vi.mocked(extractAutomatically).mockResolvedValue({ kind: 'cancelled' })
  const flow = useRetrieval()
  void flow.searchDevice()
  await settle()
  expect(flow.outcome.value).toEqual({
    kind: 'note',
    message: 'Retrieval cancelled. Nothing was saved.',
  })
})

test('a cancel that arrives as retrieval finishes discards it, and the next attempt starts afresh', async () => {
  const retrieval = pendingRetrieval()
  const flow = useRetrieval()
  void flow.searchDevice()
  await settle()
  void flow.cancel()
  // Progress already on its way no longer replaces the cancelling message.
  retrieval.progress({ kind: 'requesting', gacha_type: '1', page: 2, pages: 1, records: 1000 })
  expect(flow.status.value).toBe('Cancelling…')
  retrieval.resolve(retrieved(3))
  await settle()
  expect(discardImport).toHaveBeenCalledOnce()
  expect(flow.review.value).toBeUndefined()
  expect(flow.outcome.value?.kind).toBe('note')
  vi.mocked(retrieveHistory).mockResolvedValue(retrieved(2))
  void flow.searchDevice()
  expect(flow.cancelling.value).toBe(false)
  expect(flow.outcome.value).toBeUndefined()
  await settle()
  expect(flow.review.value?.summary.inserted).toBe(2)
})

test('if cancelling cannot be sent, retrieval carries on and can be cancelled again', async () => {
  vi.mocked(cancelAcquisition).mockResolvedValue({ kind: 'unavailable' })
  const retrieval = pendingRetrieval()
  const flow = useRetrieval()
  void flow.searchDevice()
  await settle()
  await flow.cancel()
  expect(flow.cancelling.value).toBe(false)
  retrieval.progress({ kind: 'requesting', gacha_type: '2', page: 1, pages: 0, records: 0 })
  expect(flow.status.value).toBe('Retrieving Departure Warp, page 1 · 0 rolls so far')
  retrieval.resolve(retrieved(5))
  await settle()
  expect(flow.phase.value).toBe('reviewing')
})

test('saving reports what was added and ends the review', async () => {
  const flow = await reviewing()
  const commit = pending<Awaited<ReturnType<typeof commitImport>>>()
  vi.mocked(commitImport).mockReturnValue(commit.promise)
  void flow.save()
  expect(flow.phase.value).toBe('saving')
  expect(flow.status.value).toBe('Saving…')
  expect(forgetAccountChoice).not.toHaveBeenCalled()
  commit.resolve({ summary: { inserted: 2, duplicates: 88, conflicts: 0, pool_ids_added: 0 } })
  await settle()
  // History then shows the account just saved into, whichever was chosen before.
  expect(forgetAccountChoice).toHaveBeenCalledExactlyOnceWith('honkai-star-rail')
  expect(flow.phase.value).toBe('idle')
  expect(flow.review.value).toBeUndefined()
  expect(flow.outcome.value).toEqual({
    kind: 'saved',
    summary: { inserted: 2, duplicates: 88, conflicts: 0, pool_ids_added: 0 },
    fiveStar: 1,
    fourStar: 3,
    uid: '100000001',
    server: 'synthetic-server',
  })
  flow.dismiss()
  expect(flow.outcome.value).toBeUndefined()
})

test('a failed save is explained and ends the review', async () => {
  const flow = await reviewing()
  vi.mocked(commitImport).mockResolvedValue({ failure: { kind: 'stale_preview' } })
  await flow.save()
  expect(forgetAccountChoice).not.toHaveBeenCalled()
  expect(flow.phase.value).toBe('idle')
  expect(flow.review.value).toBeUndefined()
  expect(flow.outcome.value).toEqual({
    kind: 'failed',
    title: 'Nothing Was Saved',
    message: 'Your saved history changed since this review. Start retrieval again.',
  })
})

test.each([
  ['discard', 'Discarded the retrieved history. Nothing was saved.'],
  ['done', 'Your saved history is already up to date.'],
] as const)('%s drops the retrieved history without saving', async (action, message) => {
  const flow = await reviewing()
  const discarding = pending<undefined>()
  vi.mocked(discardImport).mockReturnValue(discarding.promise)
  void flow[action]()
  expect(flow.phase.value).toBe('leaving')
  discarding.resolve(undefined)
  await settle()
  expect(commitImport).not.toHaveBeenCalled()
  expect(flow.phase.value).toBe('idle')
  expect(flow.review.value).toBeUndefined()
  expect(flow.outcome.value).toEqual({ kind: 'note', message })
})

test('closing the dialog without choosing leaves the screen as it was', async () => {
  vi.mocked(chooseCacheFile).mockResolvedValue({ cancelled: true })
  const flow = useRetrieval()
  await flow.chooseCache()
  expect(flow.phase.value).toBe('idle')
  expect(flow.outcome.value).toBeUndefined()
  expect(extractFromFile).not.toHaveBeenCalled()
})

test('a dialog that fails is explained as the file', async () => {
  vi.mocked(chooseCacheFile).mockResolvedValue({ failure: { kind: 'invalid_file' } })
  const flow = useRetrieval()
  await flow.chooseCache()
  expect(flow.source.value).toBe('cache')
  expect(flow.outcome.value).toEqual({
    kind: 'failed',
    title: expect.any(String),
    message: expect.stringContaining('That file couldn’t be read.'),
  })
  expect(extractFromFile).not.toHaveBeenCalled()
})

test('while the dialog is open, nothing else starts: no second dialog and no search', async () => {
  vi.mocked(extractFromFile).mockResolvedValue({ kind: 'no_request' })
  let answer: (choice: { chosen: string }) => void = () => undefined
  vi.mocked(chooseCacheFile).mockReturnValue(new Promise((resolve) => (answer = resolve)))
  const flow = useRetrieval()
  const choosing = flow.chooseCache()
  expect(flow.choosing.value).toBe(true)
  await flow.chooseCache()
  await flow.searchDevice()
  expect(chooseCacheFile).toHaveBeenCalledTimes(1)
  expect(extractAutomatically).not.toHaveBeenCalled()
  answer({ chosen: 'data_2' })
  await choosing
  expect(flow.choosing.value).toBe(false)
  expect(extractFromFile).toHaveBeenCalledTimes(1)
  // A closed or failed dialog frees the screen too.
  vi.mocked(chooseCacheFile).mockResolvedValue({ cancelled: true })
  await flow.chooseCache()
  expect(flow.choosing.value).toBe(false)
})

// A history file's accounts: importable ones by UID, then anything else given.
const importable = (uid: string): FileAccount => ({
  uid,
  kind: 'importable',
  server: 'prod_official_asia',
  rolls: 2,
})
const contents = (accounts: FileAccount[], more: Partial<FileContents> = {}): FileContents => ({
  accounts,
  malformed_uids: 0,
  other_games: [],
  ...more,
})
// A flow showing the accounts of a file holding two importable ones.
async function picking() {
  vi.mocked(readHistoryFile).mockResolvedValue({
    contents: contents([importable('800000001'), importable('800000002')]),
  })
  const flow = useRetrieval()
  await flow.importFile()
  return flow
}

test('a history file is chosen, read natively and its accounts shown to pick from', async () => {
  const dialog = pending<Awaited<ReturnType<typeof chooseHistoryFile>>>()
  vi.mocked(chooseHistoryFile).mockReturnValue(dialog.promise)
  const reading = pending<Awaited<ReturnType<typeof readHistoryFile>>>()
  vi.mocked(readHistoryFile).mockReturnValue(reading.promise)
  const flow = useRetrieval()
  const importing = flow.importFile()
  // Nothing shows while the dialog is open or the file is read, and nothing else starts.
  expect(flow.choosing.value).toBe(true)
  await flow.searchDevice()
  await flow.chooseCache()
  await flow.importFile()
  dialog.resolve({ chosen: 'export.json' })
  await settle()
  expect(flow.phase.value).toBe('idle')
  expect(flow.choosing.value).toBe(true)
  expect(flow.source.value).toBe('file')
  expect(flow.fileName.value).toBe('export.json')
  const read = contents([importable('800000001'), importable('800000002')])
  reading.resolve({ contents: read })
  await importing
  expect(flow.choosing.value).toBe(false)
  expect(flow.phase.value).toBe('picking')
  expect(flow.accounts.value).toEqual(read)
  expect(chooseHistoryFile).toHaveBeenCalledTimes(1)
  expect(readHistoryFile).toHaveBeenCalledTimes(1)
  expect(previewFileAccount).not.toHaveBeenCalled()
  expect(extractAutomatically).not.toHaveBeenCalled()
  expect(chooseCacheFile).not.toHaveBeenCalled()
})

test('picking an account previews it for the review, and the file is used up', async () => {
  const flow = await picking()
  const preview = pending<Awaited<ReturnType<typeof previewFileAccount>>>()
  vi.mocked(previewFileAccount).mockReturnValue(preview.promise)
  void flow.reviewAccount('800000002')
  expect(flow.phase.value).toBe('previewing')
  expect(previewFileAccount).toHaveBeenCalledExactlyOnceWith('800000002')
  preview.resolve({ review: review(2) })
  await settle()
  expect(flow.phase.value).toBe('reviewing')
  expect(flow.review.value).toEqual(review(2))
  expect(flow.accounts.value).toBeUndefined()
  expect(flow.fileName.value).toBe('export.json')
})

test('a file holding one importable account and nothing left out goes straight to its review', async () => {
  vi.mocked(readHistoryFile).mockResolvedValue({ contents: contents([importable('800000001')]) })
  vi.mocked(previewFileAccount).mockResolvedValue({ review: review(2) })
  const flow = useRetrieval()
  await flow.importFile()
  expect(previewFileAccount).toHaveBeenCalledExactlyOnceWith('800000001')
  expect(flow.phase.value).toBe('reviewing')
  expect(flow.accounts.value).toBeUndefined()
  expect(flow.choosing.value).toBe(false)
})

test.each<[string, FileContents]>([
  ['an account that can’t be imported', contents([{ uid: '800000001', kind: 'no_rolls' }])],
  ['a malformed UID', contents([importable('800000001')], { malformed_uids: 1 })],
  ['another game', contents([importable('800000001')], { other_games: ['hk4e'] })],
  ['two accounts', contents([importable('800000001'), { uid: '800000002', kind: 'repeated' }])],
])('a file with %s shows its accounts, to explain it', async (_, read) => {
  vi.mocked(readHistoryFile).mockResolvedValue({ contents: read })
  const flow = useRetrieval()
  await flow.importFile()
  expect(flow.phase.value).toBe('picking')
  expect(flow.accounts.value).toEqual(read)
  expect(previewFileAccount).not.toHaveBeenCalled()
})

test('a file with no Star Rail accounts to list fails, saying what it holds', async () => {
  vi.mocked(readHistoryFile).mockResolvedValue({
    contents: contents([], { other_games: ['hk4e'] }),
  })
  const flow = useRetrieval()
  await flow.importFile()
  expect(flow.phase.value).toBe('idle')
  expect(flow.accounts.value).toBeUndefined()
  expect(flow.outcome.value).toEqual({
    kind: 'failed',
    title: 'No Star Rail History in This File',
    message: expect.stringContaining('The file holds only Genshin Impact history'),
  })
})

test('a history file that can’t be chosen or read is explained as a history file', async () => {
  const flow = useRetrieval()
  vi.mocked(chooseHistoryFile).mockResolvedValue({ failure: { kind: 'invalid_file' } })
  await flow.importFile()
  expect(flow.source.value).toBe('file')
  expect(flow.outcome.value).toEqual({
    kind: 'failed',
    title: 'Couldn’t Read That File',
    message: 'That file couldn’t be read. Check that it’s still there, then choose it again.',
  })
  expect(readHistoryFile).not.toHaveBeenCalled()
  expect(flow.choosing.value).toBe(false)
  vi.mocked(chooseHistoryFile).mockResolvedValue({ chosen: 'export.json' })
  vi.mocked(readHistoryFile).mockResolvedValue({
    failure: { kind: 'unsupported_file', found: { format: 'srgf' } },
  })
  await flow.importFile()
  expect(flow.outcome.value).toEqual({
    kind: 'failed',
    title: 'This File’s Format Isn’t Supported',
    message: expect.stringContaining('This is an SRGF file'),
  })
  expect(flow.choosing.value).toBe(false)
  // Another import starting meanwhile cancels the read, which is a note.
  vi.mocked(readHistoryFile).mockResolvedValue({ failure: { kind: 'cancelled' } })
  await flow.importFile()
  expect(flow.outcome.value).toEqual({
    kind: 'note',
    message: 'File import cancelled. Nothing was saved.',
  })
})

test('closing the history file’s dialog leaves the screen as it was', async () => {
  const flow = useRetrieval()
  vi.mocked(chooseHistoryFile).mockResolvedValue({ cancelled: true })
  await flow.importFile()
  expect(flow.phase.value).toBe('idle')
  expect(flow.source.value).toBe('device')
  expect(flow.outcome.value).toBeUndefined()
  expect(flow.choosing.value).toBe(false)
  expect(readHistoryFile).not.toHaveBeenCalled()
})

test('a failed preview is explained, and the accounts are gone', async () => {
  const flow = await picking()
  vi.mocked(previewFileAccount).mockResolvedValue({ failure: { kind: 'storage' } })
  await flow.reviewAccount('800000001')
  expect(flow.phase.value).toBe('idle')
  expect(flow.accounts.value).toBeUndefined()
  expect(flow.outcome.value).toEqual({
    kind: 'failed',
    title: 'Nothing Was Saved',
    message: 'We couldn’t open the history saved on this device. Nothing was changed.',
  })
})

test('leaving the accounts drops the file without importing anything', async () => {
  const flow = await picking()
  const discarding = pending<undefined>()
  vi.mocked(discardImport).mockReturnValue(discarding.promise)
  void flow.closeFile()
  expect(flow.phase.value).toBe('leaving')
  discarding.resolve(undefined)
  await settle()
  expect(previewFileAccount).not.toHaveBeenCalled()
  expect(flow.phase.value).toBe('idle')
  expect(flow.accounts.value).toBeUndefined()
  expect(flow.outcome.value).toEqual({
    kind: 'note',
    message: 'Nothing was imported from the file.',
  })
})

// The file's account, previewed and shown for review.
async function reviewingFile() {
  vi.mocked(readHistoryFile).mockResolvedValue({ contents: contents([importable('800000001')]) })
  vi.mocked(previewFileAccount).mockResolvedValue({ review: review(2) })
  const flow = useRetrieval()
  await flow.importFile()
  return flow
}

test('a file’s account saves as retrieval’s does, explaining failures as a file', async () => {
  let flow = await reviewingFile()
  const summary = { inserted: 2, duplicates: 0, conflicts: 0, pool_ids_added: 1 }
  vi.mocked(commitImport).mockResolvedValue({ summary })
  await flow.save()
  expect(forgetAccountChoice).toHaveBeenCalledExactlyOnceWith('honkai-star-rail')
  expect(flow.outcome.value).toEqual(expect.objectContaining({ kind: 'saved', summary }))
  flow = await reviewingFile()
  vi.mocked(commitImport).mockResolvedValue({ failure: { kind: 'stale_preview' } })
  await flow.save()
  expect(flow.outcome.value).toEqual({
    kind: 'failed',
    title: 'Nothing Was Saved',
    message: 'Your saved history changed since this review. Choose the file again.',
  })
  flow = await reviewingFile()
  await flow.discard()
  expect(flow.outcome.value).toEqual({
    kind: 'note',
    message: 'Discarded the file’s rolls. Nothing was saved.',
  })
})
