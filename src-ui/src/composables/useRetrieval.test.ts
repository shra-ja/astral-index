import { beforeEach, expect, test, vi } from 'vitest'
import {
  cancelAcquisition,
  commitImport,
  discardImport,
  extractAutomatically,
  extractFromFile,
  retrieveHistory,
  type Failure,
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
  vi.mocked(extractFromFile).mockResolvedValue(undefined)
  vi.mocked(cancelAcquisition).mockResolvedValue(undefined)
  vi.mocked(discardImport).mockResolvedValue(undefined)
})

// Resolve the mocked commands and the flow's follow-up steps.
const settle = () => new Promise((resolve) => setTimeout(resolve))
// A synthetic review with every count in Stellar Warp.
const review = (inserted: number): Review => ({
  uid: '100000001',
  server: 'synthetic-server',
  timezone: 8,
  summary: { inserted, duplicates: 0, conflicts: 0 },
  new_five_star: 1,
  new_four_star: 3,
  categories: [{ gacha_type: '1', inserted, duplicates: 0, conflicts: 0 }],
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
  await flow.readFile(new File(['synthetic'], 'data_2'))
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
  const file = new File(['synthetic'], 'data_2')
  vi.mocked(extractFromFile).mockResolvedValue({ kind: 'no_request' })
  const flow = useRetrieval()
  void flow.readFile(file)
  expect(flow.source.value).toBe('file')
  expect(flow.status.value).toBe('Reading the file, then checking with HoYoverse…')
  await settle()
  expect(extractFromFile).toHaveBeenCalledWith(file)
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
  commit.resolve({ summary: { inserted: 2, duplicates: 88, conflicts: 0 } })
  await settle()
  // History then shows the account just saved into, whichever was chosen before.
  expect(forgetAccountChoice).toHaveBeenCalledExactlyOnceWith('honkai-star-rail')
  expect(flow.phase.value).toBe('idle')
  expect(flow.review.value).toBeUndefined()
  expect(flow.outcome.value).toEqual({
    kind: 'saved',
    summary: { inserted: 2, duplicates: 88, conflicts: 0 },
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
