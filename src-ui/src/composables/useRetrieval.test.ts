import { beforeEach, expect, test, vi } from 'vitest';
import {
  cancelAcquisition, commitImport, discardImport, extractAutomatically, extractFromFile, retrieveHistory,
  type Failure, type Progress, type Retrieved, type Review,
} from '../commands';
import { useRetrieval } from './useRetrieval';

vi.mock('../commands');
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(extractAutomatically).mockResolvedValue(undefined);
  vi.mocked(extractFromFile).mockResolvedValue(undefined);
  vi.mocked(cancelAcquisition).mockResolvedValue(undefined);
  vi.mocked(discardImport).mockResolvedValue(undefined);
});

// Resolve the mocked commands and the flow's follow-up steps.
const settle = () => new Promise(resolve => setTimeout(resolve));
// A synthetic review with every count in Stellar Warp.
const review = (inserted: number): Review => ({
  uid: '100000001', server: 'synthetic-server', timezone: 8,
  summary: { inserted, duplicates: 0, conflicts: 0 },
  categories: [{ gacha_type: '1', inserted, duplicates: 0, conflicts: 0 }],
  earliest: '2026-04-02 10:00:00', latest: '2026-09-28 21:30:00', conflicts: [],
});
const retrieved = (inserted: number) => ({ retrieved: { kind: 'review', ...review(inserted) } as Retrieved });
// A command result that stays pending until the test settles it.
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
// Serve retrieval from a pending result, capturing the progress callback.
function pendingRetrieval() {
  const result = pending<Awaited<ReturnType<typeof retrieveHistory>>>();
  let progress!: (progress: Progress) => void;
  vi.mocked(retrieveHistory).mockImplementation(onProgress => { progress = onProgress; return result.promise; });
  return { resolve: result.resolve, progress: (update: Progress) => progress(update) };
}
// A flow showing the review of a retrieval with the given number of new rolls.
async function reviewing(inserted = 2) {
  vi.mocked(retrieveHistory).mockResolvedValue(retrieved(inserted));
  const flow = useRetrieval();
  flow.searchDevice();
  await settle();
  return flow;
}

test('starts idle, with nothing to say or review', () => {
  const flow = useRetrieval();
  expect(flow.phase.value).toBe('idle');
  expect(flow.status.value).toBe('');
  expect(flow.review.value).toBeUndefined();
  expect(flow.cancelling.value).toBe(false);
});

test('searching the device validates, retrieves with progress, then shows the review', async () => {
  const extraction = pending<Failure | undefined>();
  vi.mocked(extractAutomatically).mockReturnValue(extraction.promise);
  const retrieval = pendingRetrieval();
  const flow = useRetrieval();
  flow.searchDevice();
  expect(flow.phase.value).toBe('acquiring');
  expect(flow.source.value).toBe('device');
  expect(flow.status.value).toBe('Searching this device, then checking with HoYoverse…');
  extraction.resolve(undefined);
  await settle();
  expect(flow.status.value).toBe('Retrieving your warp history…');
  retrieval.progress({ kind: 'requesting', gacha_type: '11', page: 2, pages: 1, records: 1532 });
  expect(flow.status.value).toBe('Retrieving Character Event Warp, page 2 · 1,532 rolls so far');
  retrieval.resolve(retrieved(412));
  await settle();
  expect(flow.phase.value).toBe('reviewing');
  expect(flow.status.value).toBe('');
  expect(flow.review.value).toEqual(expect.objectContaining(review(412)));
  expect(extractFromFile).not.toHaveBeenCalled();
});

test('a chosen file is read instead of searching, and its failures are explained as a file', async () => {
  const file = new File(['synthetic'], 'data_2');
  vi.mocked(extractFromFile).mockResolvedValue({ kind: 'no_request' });
  const flow = useRetrieval();
  flow.readFile(file);
  expect(flow.source.value).toBe('file');
  expect(flow.status.value).toBe('Reading the file, then checking with HoYoverse…');
  await settle();
  expect(extractFromFile).toHaveBeenCalledWith(file);
  expect(extractAutomatically).not.toHaveBeenCalled();
  expect(retrieveHistory).not.toHaveBeenCalled();
  expect(flow.phase.value).toBe('idle');
  expect(flow.status.value).toContain('That file doesn’t contain a warp history request.');
});

test('a failed search is explained, and nothing is retrieved', async () => {
  vi.mocked(extractAutomatically).mockResolvedValue({ kind: 'no_cache' });
  const flow = useRetrieval();
  flow.searchDevice();
  await settle();
  expect(flow.phase.value).toBe('idle');
  expect(flow.status.value).toContain('We found the game, but not its web cache.');
  expect(retrieveHistory).not.toHaveBeenCalled();
});

test('a failed retrieval says where it stopped', async () => {
  vi.mocked(retrieveHistory).mockResolvedValue({ failure: { kind: 'network', location: { gacha_type: '1', page: 3 } } });
  const flow = useRetrieval();
  flow.searchDevice();
  await settle();
  expect(flow.phase.value).toBe('idle');
  expect(flow.status.value).toBe(
    'Retrieval stopped at Stellar Warp, page 3. We couldn’t reach HoYoverse. Check your internet connection, then try again.',
  );
});

test('no history is reported without a review', async () => {
  vi.mocked(retrieveHistory).mockResolvedValue({ retrieved: { kind: 'no_history' } });
  const flow = useRetrieval();
  flow.searchDevice();
  await settle();
  expect(flow.phase.value).toBe('idle');
  expect(flow.review.value).toBeUndefined();
  expect(flow.status.value).toBe('HoYoverse returned no warp history for this account. Nothing was saved.');
});

test('cancelling during validation stops before retrieval, even if validation succeeds', async () => {
  const extraction = pending<Failure | undefined>();
  vi.mocked(extractAutomatically).mockReturnValue(extraction.promise);
  const flow = useRetrieval();
  flow.searchDevice();
  flow.cancel();
  expect(flow.cancelling.value).toBe(true);
  expect(flow.status.value).toBe('Cancelling…');
  expect(cancelAcquisition).toHaveBeenCalledOnce();
  extraction.resolve(undefined);
  await settle();
  expect(retrieveHistory).not.toHaveBeenCalled();
  expect(flow.phase.value).toBe('idle');
  expect(flow.status.value).toBe('Retrieval cancelled. Nothing was saved.');
});

test('a cancel that arrives as retrieval finishes discards it, and the next attempt starts afresh', async () => {
  const retrieval = pendingRetrieval();
  const flow = useRetrieval();
  flow.searchDevice();
  await settle();
  flow.cancel();
  // Progress already on its way no longer replaces the cancelling message.
  retrieval.progress({ kind: 'requesting', gacha_type: '1', page: 2, pages: 1, records: 1000 });
  expect(flow.status.value).toBe('Cancelling…');
  retrieval.resolve(retrieved(3));
  await settle();
  expect(discardImport).toHaveBeenCalledOnce();
  expect(flow.review.value).toBeUndefined();
  expect(flow.status.value).toBe('Retrieval cancelled. Nothing was saved.');
  vi.mocked(retrieveHistory).mockResolvedValue(retrieved(2));
  flow.searchDevice();
  expect(flow.cancelling.value).toBe(false);
  await settle();
  expect(flow.review.value?.summary.inserted).toBe(2);
});

test('if cancelling cannot be sent, retrieval carries on and can be cancelled again', async () => {
  vi.mocked(cancelAcquisition).mockResolvedValue({ kind: 'unavailable' });
  const retrieval = pendingRetrieval();
  const flow = useRetrieval();
  flow.searchDevice();
  await settle();
  await flow.cancel();
  expect(flow.cancelling.value).toBe(false);
  retrieval.progress({ kind: 'requesting', gacha_type: '2', page: 1, pages: 0, records: 0 });
  expect(flow.status.value).toBe('Retrieving Departure Warp, page 1 · 0 rolls so far');
  retrieval.resolve(retrieved(5));
  await settle();
  expect(flow.phase.value).toBe('reviewing');
});

test('saving reports what was added and ends the review', async () => {
  const flow = await reviewing();
  const commit = pending<Awaited<ReturnType<typeof commitImport>>>();
  vi.mocked(commitImport).mockReturnValue(commit.promise);
  flow.save();
  expect(flow.phase.value).toBe('saving');
  expect(flow.status.value).toBe('Saving…');
  commit.resolve({ summary: { inserted: 2, duplicates: 88, conflicts: 0 } });
  await settle();
  expect(flow.phase.value).toBe('idle');
  expect(flow.review.value).toBeUndefined();
  expect(flow.status.value).toBe('Saved 2 new rolls to this device. 88 were already saved.');
});

test('a failed save is explained and ends the review', async () => {
  const flow = await reviewing();
  vi.mocked(commitImport).mockResolvedValue({ failure: { kind: 'stale_preview' } });
  await flow.save();
  expect(flow.phase.value).toBe('idle');
  expect(flow.review.value).toBeUndefined();
  expect(flow.status.value).toBe('Your saved history changed since this review. Start retrieval again.');
});

test.each([
  ['discard', 'Discarded the retrieved history. Nothing was saved.'],
  ['done', 'Your saved history is already up to date.'],
] as const)('%s drops the retrieved history without saving', async (action, message) => {
  const flow = await reviewing();
  const discarding = pending<undefined>();
  vi.mocked(discardImport).mockReturnValue(discarding.promise);
  flow[action]();
  expect(flow.phase.value).toBe('leaving');
  discarding.resolve(undefined);
  await settle();
  expect(commitImport).not.toHaveBeenCalled();
  expect(flow.phase.value).toBe('idle');
  expect(flow.review.value).toBeUndefined();
  expect(flow.status.value).toBe(message);
});
