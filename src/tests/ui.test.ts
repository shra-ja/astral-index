import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Channel } from '@tauri-apps/api/core';

beforeEach(async () => {
  document.body.innerHTML = '<main></main>';
  vi.resetModules();
  await import('../main');
});
afterEach(clearMocks);

const panel = () => document.querySelector<HTMLElement>('.retrieval')!;
const findButton = () => panel().querySelector('button')!;
const fallback = () => panel().querySelector<HTMLElement>('.fallback')!;
const fileInput = () => fallback().querySelector<HTMLInputElement>('input[type="file"]')!;
const extractionStatus = () => panel().querySelector('[role="status"]')!.textContent;

function selectStarRail() {
  const select = document.querySelector('select')!;
  select.value = 'honkai-star-rail';
  select.dispatchEvent(new Event('change'));
}
function choose(file: File) {
  Object.defineProperty(fileInput(), 'files', { value: [file], configurable: true });
  fileInput().dispatchEvent(new Event('change'));
}
// Validation failures read the same for automatic and file extraction.
const validationFailures = [
  ['expired_key', 'Your warp history link has expired. Open your warp history in the game to refresh it'],
  ['rate_limited', 'HoYoverse is receiving too many requests'],
  ['network', 'couldn’t reach HoYoverse. Check your internet connection'],
  ['rejected', 'HoYoverse gave an unexpected response'],
  ['invalid_response', 'HoYoverse sent a response we couldn’t read'],
  ['internal', 'couldn’t start the connection to HoYoverse. Nothing was sent'],
];
// Resolve the mocked IPC and the UI's follow-up rendering.
const settle = () => new Promise(resolve => setTimeout(resolve));
const cancelButton = () => panel().querySelector<HTMLButtonElement>('.cancel')!;
const start = () => panel().querySelector<HTMLElement>('.start')!;

type Handler = (args: Record<string, unknown>) => unknown;
// Route each mocked command to its handler, recording the commands called.
function serve(handlers: Record<string, Handler>) {
  const calls: string[] = [];
  mockIPC((cmd, args) => {
    calls.push(cmd);
    return handlers[cmd]?.(args as Record<string, unknown>);
  });
  return calls;
}
type Progress = Channel<unknown>;
const progressOf = (args: Record<string, unknown>) => args.onProgress as Progress;
const review = (inserted: number) => ({
  kind: 'review', uid: '100000001', server: 'synthetic-server', timezone: 8,
  summary: { inserted, duplicates: 0, conflicts: 0 }, categories: [],
  earliest: '2026-01-01 00:00:00', latest: '2026-01-02 00:00:00', conflicts: [],
});
// A command that stays pending until the test resolves or rejects it.
function pending() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { handler: () => promise, resolve, reject };
}

test('starts with accessible game selection and a local-app empty state', () => {
  expect(document.querySelector('h1')?.textContent).toBe('Your rolls, kept local.');
  const select = document.querySelector('select')!;
  expect(document.querySelector('label')?.htmlFor).toBe(select.id);
  expect([...select.options].map(option => option.textContent)).toEqual([
    'Genshin Impact', 'Honkai: Star Rail',
  ]);
  expect(select.value).toBe('genshin-impact');
  expect(document.querySelector('[role="status"]')?.textContent).toContain('No Genshin Impact rolls yet');
  expect(document.body.textContent).toContain('History retrieval is coming next.');
  expect(document.body.textContent).toContain('Local app');
  expect(document.body.textContent).not.toContain('Offline');
  expect(panel().hidden).toBe(true);
});

test('switches games and switches back without inventing history or statistics', () => {
  const select = document.querySelector('select')!;
  select.value = 'honkai-star-rail';
  select.dispatchEvent(new Event('change'));
  expect(document.querySelector('[role="status"]')?.textContent).toContain('No Honkai: Star Rail rolls yet');
  select.value = 'genshin-impact';
  select.dispatchEvent(new Event('change'));
  expect(document.querySelector('[role="status"]')?.textContent).toContain('No Genshin Impact rolls yet');
  expect(document.body.textContent).not.toMatch(/pity|guarantee|win rate/i);
});

test('Star Rail offers retrieval, automatically or from a file, and says it contacts HoYoverse', () => {
  selectStarRail();
  expect(panel().hidden).toBe(false);
  expect(findButton().textContent).toBe('Start retrieval');
  expect(findButton().type).toBe('button');
  expect(fallback().hidden).toBe(false);
  expect(document.querySelector<HTMLLabelElement>('.fallback label')?.htmlFor).toBe(fileInput().id);
  expect(extractionStatus()).toBe('');
  expect(cancelButton().hidden).toBe(true);
  expect(cancelButton().type).toBe('button');
  expect(panel().textContent).toContain('checks it with HoYoverse');
  expect(panel().textContent).not.toContain('Nothing is sent anywhere');
});

test('starting retrieval validates, retrieves with progress, then reports what was found', async () => {
  const extraction = pending();
  const retrieval = pending();
  let progress!: Progress;
  const calls = serve({
    extract_automatically: extraction.handler,
    retrieve_history: args => { progress = progressOf(args); return retrieval.handler(); },
  });
  selectStarRail();
  findButton().focus();
  findButton().click();
  expect(start().hidden).toBe(true);
  expect(cancelButton().hidden).toBe(false);
  expect(document.activeElement).toBe(cancelButton());
  expect(panel().getAttribute('aria-busy')).toBe('true');
  expect(extractionStatus()).toBe('Searching this device, then checking with HoYoverse…');
  extraction.resolve(undefined);
  await settle();
  expect(extractionStatus()).toBe('Retrieving your warp history…');
  progress.onmessage({ kind: 'requesting', gacha_type: '11', page: 2, pages: 1, records: 1532 });
  expect(extractionStatus()).toBe('Retrieving Character Event Warp, page 2 · 1,532 rolls so far');
  progress.onmessage({ kind: 'retry_pending', delay_ms: 1000 });
  expect(extractionStatus()).toBe('HoYoverse didn’t respond, so we’ll try again in a moment…');
  progress.onmessage({ kind: 'requesting', gacha_type: '1', page: 1, pages: 0, records: 1 });
  expect(extractionStatus()).toBe('Retrieving Stellar Warp, page 1 · 1 roll so far');
  retrieval.resolve(review(412));
  await settle();
  // Saving comes with the review screen; until then nothing is left waiting natively.
  expect(calls).toEqual(['extract_automatically', 'retrieve_history', 'discard_import']);
  expect(extractionStatus()).toBe('Found 412 new rolls. Saving is coming next.');
  expect(start().hidden).toBe(false);
  expect(cancelButton().hidden).toBe(true);
  expect(panel().getAttribute('aria-busy')).toBe('false');
  expect(document.activeElement).toBe(findButton());
});

test('each category is named in progress, and one new roll reads naturally', async () => {
  const names: string[] = [];
  serve({
    retrieve_history: args => {
      for (const gacha_type of ['1', '2', '11', '12', '21', '22']) {
        progressOf(args).onmessage({ kind: 'requesting', gacha_type, page: 1, pages: 0, records: 0 });
        names.push(extractionStatus()!);
      }
      return review(1);
    },
  });
  selectStarRail();
  findButton().click();
  await settle();
  expect(names).toEqual([
    'Retrieving Stellar Warp, page 1 · 0 rolls so far',
    'Retrieving Departure Warp, page 1 · 0 rolls so far',
    'Retrieving Character Event Warp, page 1 · 0 rolls so far',
    'Retrieving Light Cone Event Warp, page 1 · 0 rolls so far',
    'Retrieving Character Collaboration Warp, page 1 · 0 rolls so far',
    'Retrieving Light Cone Collaboration Warp, page 1 · 0 rolls so far',
  ]);
  expect(extractionStatus()).toBe('Found 1 new roll. Saving is coming next.');
});

test('no history is reported without anything to save', async () => {
  const calls = serve({ retrieve_history: () => ({ kind: 'no_history' }) });
  selectStarRail();
  findButton().click();
  await settle();
  expect(extractionStatus()).toBe('HoYoverse returned no warp history for this account. Nothing was saved.');
  expect(calls).toEqual(['extract_automatically', 'retrieve_history']);
});

test('each retrieval failure explains itself and where retrieval stopped', async () => {
  selectStarRail();
  for (const [kind, message] of [
    ['cancelled', 'Retrieval cancelled. Nothing was saved.'],
    ['history_too_large', 'Your history is larger than the 16 MiB we can retrieve at once. Nothing was saved.'],
    ['mixed_accounts', 'HoYoverse returned history for more than one account, so nothing was kept. Try again.'],
    ['missing_server', 'HoYoverse didn’t say which server this history belongs to, so nothing was kept.'],
    ['storage', 'We couldn’t open the history saved on this device. Nothing was changed.'],
    ['context_mismatch', 'Saved history for this account uses a different time zone than HoYoverse reports. Nothing was saved.'],
    ['no_context', 'Nothing is waiting to be saved. Start retrieval again.'],
    ['something_new', 'Something went wrong. Please try again.'],
    ...validationFailures,
  ]) {
    const calls = serve({ retrieve_history: () => { throw { kind }; } });
    findButton().click();
    await settle();
    expect(extractionStatus()).toContain(message);
    expect(extractionStatus()).not.toContain('stopped');
    expect(calls).toEqual(['extract_automatically', 'retrieve_history']);
    expect(start().hidden).toBe(false);
  }
  serve({ retrieve_history: () => { throw { kind: 'network', gacha_type: '12', page: 2 }; } });
  findButton().click();
  await settle();
  expect(extractionStatus()).toBe(
    'Retrieval stopped at Light Cone Event Warp, page 2. We couldn’t reach HoYoverse. Check your internet connection, then try again.',
  );
  serve({ retrieve_history: () => { throw { kind: 'api_error', code: -1, gacha_type: '1', page: 1 }; } });
  findButton().click();
  await settle();
  expect(extractionStatus()).toContain('Retrieval stopped at Stellar Warp, page 1. HoYoverse didn’t accept your warp history link (error -1).');
  // Stopping is the user's choice, not a place in the history.
  serve({ retrieve_history: () => { throw { kind: 'cancelled', gacha_type: '1', page: 1 }; } });
  findButton().click();
  await settle();
  expect(extractionStatus()).toBe('Retrieval cancelled. Nothing was saved.');
});

test('cancelling during validation stops before retrieval', async () => {
  const extraction = pending();
  const calls = serve({ extract_automatically: extraction.handler });
  selectStarRail();
  findButton().click();
  cancelButton().click();
  expect(cancelButton().disabled).toBe(true);
  expect(extractionStatus()).toBe('Cancelling…');
  await settle();
  extraction.reject({ kind: 'cancelled' });
  await settle();
  expect(calls).toEqual(['extract_automatically', 'cancel_acquisition']);
  expect(extractionStatus()).toBe('Retrieval cancelled. Nothing was saved.');
  expect(cancelButton().hidden).toBe(true);
  expect(start().hidden).toBe(false);
});

test('a cancel that arrives as validation succeeds still stops before retrieval', async () => {
  const extraction = pending();
  const calls = serve({ extract_automatically: extraction.handler });
  selectStarRail();
  findButton().click();
  cancelButton().click();
  extraction.resolve(undefined);
  await settle();
  expect(calls).toEqual(['extract_automatically', 'cancel_acquisition']);
  expect(extractionStatus()).toBe('Retrieval cancelled. Nothing was saved.');
});

test('a cancel that arrives as retrieval finishes keeps nothing', async () => {
  const retrieval = pending();
  let progress!: Progress;
  const calls = serve({ retrieve_history: args => { progress = progressOf(args); return retrieval.handler(); } });
  selectStarRail();
  findButton().click();
  await settle();
  cancelButton().click();
  // Progress already on its way no longer replaces the cancelling message.
  progress.onmessage({ kind: 'requesting', gacha_type: '1', page: 2, pages: 1, records: 1000 });
  expect(extractionStatus()).toBe('Cancelling…');
  retrieval.resolve(review(3));
  await settle();
  expect(calls).toEqual(['extract_automatically', 'retrieve_history', 'cancel_acquisition', 'discard_import']);
  expect(extractionStatus()).toBe('Retrieval cancelled. Nothing was saved.');
  // The next attempt starts afresh.
  serve({ retrieve_history: () => review(2) });
  findButton().click();
  await settle();
  expect(extractionStatus()).toBe('Found 2 new rolls. Saving is coming next.');
});

test('if cancelling cannot be sent, retrieval carries on and can be cancelled again', async () => {
  const retrieval = pending();
  let progress!: Progress;
  serve({
    retrieve_history: args => { progress = progressOf(args); return retrieval.handler(); },
    cancel_acquisition: () => { throw 'cancel_acquisition not allowed'; },
  });
  selectStarRail();
  findButton().click();
  await settle();
  cancelButton().click();
  await settle();
  expect(cancelButton().disabled).toBe(false);
  progress.onmessage({ kind: 'requesting', gacha_type: '2', page: 1, pages: 0, records: 0 });
  expect(extractionStatus()).toBe('Retrieving Departure Warp, page 1 · 0 rolls so far');
  retrieval.resolve(review(5));
  await settle();
  expect(extractionStatus()).toBe('Found 5 new rolls. Saving is coming next.');
});

test('each automatic failure explains what to do next', async () => {
  selectStarRail();
  for (const [failure, message] of [
    ['unsupported_host', 'Automatic search needs Windows'],
    ['discovery_failed', 'couldn’t look up your Windows user folder'],
    ['no_game_data', 'couldn’t find Honkai: Star Rail’s game logs'],
    ['no_cache', 'found the game, but not its web cache'],
    ['no_request', 'couldn’t find a warp history request'],
    ['something_new', 'Something went wrong'],
    ...validationFailures,
  ]) {
    const calls = serve({ extract_automatically: () => { throw { kind: failure }; } });
    findButton().click();
    await settle();
    expect(extractionStatus()).toContain(message);
    expect(calls).toEqual(['extract_automatically']);
    expect(start().hidden).toBe(false);
  }
});

test('choosing a cache file extracts from it without an automatic search first', async () => {
  selectStarRail();
  const calls = serve({ retrieve_history: () => review(7) });
  fileInput().focus();
  choose(new File(['synthetic'], 'data_2'));
  expect(extractionStatus()).toBe('Reading the file, then checking with HoYoverse…');
  expect(start().hidden).toBe(true);
  await settle();
  expect(calls).toEqual(['extract_from_file', 'retrieve_history', 'discard_import']);
  expect(extractionStatus()).toBe('Found 7 new rolls. Saving is coming next.');
  expect(document.activeElement).toBe(fileInput());
  for (const [failure, message] of [
    ['no_request', 'doesn’t contain a warp history request'],
    ['file_too_large', 'larger than 16 MiB'],
    ['invalid_file', 'couldn’t be read'],
    ['something_new', 'Something went wrong'],
    ...validationFailures,
  ]) {
    mockIPC(() => { throw { kind: failure }; });
    choose(new File(['synthetic'], 'data_2'));
    await settle();
    expect(extractionStatus()).toContain(message);
  }
  // A change without a file, such as a cleared selection, leaves the last result.
  Object.defineProperty(fileInput(), 'files', { value: [], configurable: true });
  fileInput().dispatchEvent(new Event('change'));
  expect(extractionStatus()).toContain('Nothing was sent');
  expect(start().hidden).toBe(false);
});

test('an API error shows its code with the next step', async () => {
  selectStarRail();
  mockIPC(() => { throw { kind: 'api_error', code: -100 }; });
  findButton().click();
  await settle();
  expect(extractionStatus()).toBe(
    'HoYoverse didn’t accept your warp history link (error -100). Open your warp history in the game, then try again.',
  );
  choose(new File(['synthetic'], 'data_2'));
  await settle();
  expect(extractionStatus()).toContain('(error -100)');
});

test('the chosen file stays shown after extraction and is cleared only to choose again', async () => {
  selectStarRail();
  serve({ retrieve_history: () => ({ kind: 'no_history' }) });
  const writes: string[] = [];
  Object.defineProperty(fileInput(), 'value', {
    configurable: true, get: () => 'data_2', set: (value: string) => { writes.push(value); },
  });
  choose(new File(['synthetic'], 'data_2'));
  await settle();
  expect(extractionStatus()).toContain('no warp history');
  expect(writes).toEqual([]);
  // Clearing before the dialog opens lets the same file be chosen again.
  fileInput().click();
  expect(writes).toEqual(['']);
});

test('switching back to Genshin Impact hides the Star Rail controls', () => {
  selectStarRail();
  const select = document.querySelector('select')!;
  select.value = 'genshin-impact';
  select.dispatchEvent(new Event('change'));
  expect(panel().hidden).toBe(true);
  expect(document.body.textContent).toContain('History retrieval is coming next.');
});
