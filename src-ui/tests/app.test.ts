import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';
import type { Channel } from '@tauri-apps/api/core';

// Resolve the mocked IPC and the UI's follow-up rendering.
const settle = () => new Promise(resolve => setTimeout(resolve));

// Mount the whole app afresh, and wait for the router to show the first view.
beforeEach(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  vi.resetModules();
  await import('../src/main');
  await settle();
});
afterEach(clearMocks);

const panel = () => document.querySelector<HTMLElement>('.retrieval')!;
const findButton = () => panel().querySelector('button')!;
const fallback = () => panel().querySelector<HTMLElement>('.fallback')!;
const fileInput = () => fallback().querySelector<HTMLInputElement>('input[type="file"]')!;
const extractionStatus = () => panel().querySelector('[role="status"]')!.textContent;

// Vue updates the page on the next tick, so each helper waits for it.
function selectGame(value: string) {
  const select = document.querySelector('select')!;
  select.value = value;
  select.dispatchEvent(new Event('change'));
  return nextTick();
}
const selectStarRail = () => selectGame('honkai-star-rail');
function choose(file: File) {
  Object.defineProperty(fileInput(), 'files', { value: [file], configurable: true });
  fileInput().dispatchEvent(new Event('change'));
  return nextTick();
}
function click(element: HTMLElement) {
  element.click();
  return nextTick();
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
const cancelButton = () => panel().querySelector<HTMLButtonElement>('.cancel')!;
const start = () => panel().querySelector<HTMLElement>('.start')!;
const reviewPanel = () => panel().querySelector<HTMLElement>('.review')!;
// The review is rendered only while one is shown.
const reviewShown = () => panel().querySelector('.review') !== null;
const reviewHeading = () => reviewPanel().querySelector('h3')!;
const reviewButton = (name: string) =>
  [...reviewPanel().querySelectorAll('button')].find(button => button.textContent === name)!;
const rows = () => [...reviewPanel().querySelectorAll('tbody tr')]
  .map(row => [...row.children].map(cell => cell.textContent));

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
type Conflict = { id: string; gacha_type: string; time: string };
// A synthetic review with every count in Stellar Warp.
const review = (inserted: number, duplicates = 0, conflicts: Conflict[] = []) => ({
  kind: 'review', uid: '100000001', server: 'synthetic-server', timezone: 8,
  summary: { inserted, duplicates, conflicts: conflicts.length },
  categories: ['1', '2', '11', '12', '21', '22'].map((gacha_type, index) => index === 0
    ? { gacha_type, inserted, duplicates, conflicts: conflicts.length }
    : { gacha_type, inserted: 0, duplicates: 0, conflicts: 0 }),
  earliest: '2026-04-02 10:00:00', latest: '2026-09-28 21:30:00', conflicts,
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
  expect(document.body.textContent).toContain('Showing saved history is coming next.');
  expect(document.body.textContent).toContain('Local app');
  expect(document.body.textContent).not.toContain('Offline');
  expect(panel().hidden).toBe(true);
});

test('switches games and switches back without inventing history or statistics', async () => {
  await selectStarRail();
  expect(document.querySelector('[role="status"]')?.textContent).toContain('No Honkai: Star Rail rolls yet');
  await selectGame('genshin-impact');
  expect(document.querySelector('[role="status"]')?.textContent).toContain('No Genshin Impact rolls yet');
  expect(document.body.textContent).not.toMatch(/pity|guarantee|win rate/i);
});

test('Star Rail offers retrieval, automatically or from a file, and says it contacts HoYoverse', async () => {
  await selectStarRail();
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

test('starting retrieval validates, retrieves with progress, then reviews and saves', async () => {
  const extraction = pending();
  const retrieval = pending();
  let progress!: Progress;
  const calls = serve({
    extract_automatically: extraction.handler,
    retrieve_history: args => { progress = progressOf(args); return retrieval.handler(); },
  });
  await selectStarRail();
  findButton().focus();
  await click(findButton());
  expect(start().hidden).toBe(true);
  expect(cancelButton().hidden).toBe(false);
  expect(document.activeElement).toBe(cancelButton());
  expect(panel().getAttribute('aria-busy')).toBe('true');
  expect(extractionStatus()).toBe('Searching this device, then checking with HoYoverse…');
  extraction.resolve(undefined);
  await settle();
  expect(extractionStatus()).toBe('Retrieving your warp history…');
  progress.onmessage({ kind: 'requesting', gacha_type: '11', page: 2, pages: 1, records: 1532 });
  await nextTick();
  expect(extractionStatus()).toBe('Retrieving Character Event Warp, page 2 · 1,532 rolls so far');
  progress.onmessage({ kind: 'retry_pending', delay_ms: 1000 });
  await nextTick();
  expect(extractionStatus()).toBe('HoYoverse didn’t respond, so we’ll try again in a moment…');
  progress.onmessage({ kind: 'requesting', gacha_type: '1', page: 1, pages: 0, records: 1 });
  await nextTick();
  expect(extractionStatus()).toBe('Retrieving Stellar Warp, page 1 · 1 roll so far');
  retrieval.resolve(review(412, 88));
  await settle();
  expect(calls).toEqual(['extract_automatically', 'retrieve_history']);
  expect(reviewShown()).toBe(true);
  expect(start().hidden).toBe(true);
  expect(cancelButton().hidden).toBe(true);
  expect(panel().getAttribute('aria-busy')).toBe('false');
  expect(extractionStatus()).toBe('');
  expect(reviewHeading().textContent).toBe('Ready to save 412 new rolls');
  expect(document.activeElement).toBe(reviewHeading());
  expect(reviewPanel().textContent).toContain('UID 100000001 · synthetic-server · 2026-04-02 to 2026-09-28 (server time)');
  expect([...reviewPanel().querySelectorAll('thead th')].map(cell => cell.textContent))
    .toEqual(['Warp', 'New', 'Already saved', 'Conflicts']);
  expect(rows()).toEqual([
    ['Stellar Warp', '412', '88', '0'],
    ['Departure Warp', '0', '0', '0'],
    ['Character Event Warp', '0', '0', '0'],
    ['Light Cone Event Warp', '0', '0', '0'],
    ['Character Collaboration Warp', '0', '0', '0'],
    ['Light Cone Collaboration Warp', '0', '0', '0'],
  ]);
  expect(reviewPanel().querySelector<HTMLElement>('.conflicts')!.hidden).toBe(true);
  expect(reviewButton('Done').hidden).toBe(true);
  expect(reviewButton('Discard').hidden).toBe(false);
  const commit = pending();
  serve({ commit_import: commit.handler });
  await click(reviewButton('Save to this device'));
  expect(extractionStatus()).toBe('Saving…');
  // The review panel re-renders on the next tick.
  await settle();
  expect(reviewButton('Save to this device').disabled).toBe(true);
  expect(reviewButton('Discard').disabled).toBe(true);
  expect(panel().getAttribute('aria-busy')).toBe('true');
  commit.resolve({ inserted: 412, duplicates: 88, conflicts: 0 });
  await settle();
  expect(extractionStatus()).toBe('Saved 412 new rolls to this device. 88 were already saved.');
  expect(reviewShown()).toBe(false);
  expect(start().hidden).toBe(false);
  expect(panel().getAttribute('aria-busy')).toBe('false');
  expect(document.activeElement).toBe(findButton());
  // A later review starts with its buttons enabled again.
  serve({ retrieve_history: () => review(1) });
  findButton().click();
  await settle();
  expect(reviewButton('Save to this device').disabled).toBe(false);
  expect(reviewButton('Discard').disabled).toBe(false);
});

test('one roll reads naturally, and a save with nothing already stored says only what was added', async () => {
  serve({ retrieve_history: () => review(1), commit_import: () => ({ inserted: 1, duplicates: 1, conflicts: 0 }) });
  await selectStarRail();
  findButton().click();
  await settle();
  expect(reviewHeading().textContent).toBe('Ready to save 1 new roll');
  reviewButton('Save to this device').click();
  await settle();
  expect(extractionStatus()).toBe('Saved 1 new roll to this device. 1 was already saved.');
  serve({ retrieve_history: () => review(3), commit_import: () => ({ inserted: 3, duplicates: 0, conflicts: 0 }) });
  findButton().click();
  await settle();
  reviewButton('Save to this device').click();
  await settle();
  expect(extractionStatus()).toBe('Saved 3 new rolls to this device.');
});

test('discarding the review saves nothing', async () => {
  const calls = serve({ retrieve_history: () => review(4) });
  await selectStarRail();
  findButton().click();
  await settle();
  reviewButton('Discard').click();
  await settle();
  expect(calls).toEqual(['extract_automatically', 'retrieve_history', 'discard_import']);
  expect(extractionStatus()).toBe('Discarded the retrieved history. Nothing was saved.');
  expect(reviewShown()).toBe(false);
  expect(start().hidden).toBe(false);
  expect(document.activeElement).toBe(findButton());
});

test('when everything is already saved, Done replaces Save and Discard', async () => {
  const calls = serve({ retrieve_history: () => review(0, 5) });
  await selectStarRail();
  findButton().click();
  await settle();
  expect(reviewHeading().textContent).toBe('Everything here is already saved');
  expect(reviewButton('Save to this device').hidden).toBe(true);
  expect(reviewButton('Discard').hidden).toBe(true);
  expect(reviewButton('Done').hidden).toBe(false);
  reviewButton('Done').click();
  await settle();
  expect(calls).toEqual(['extract_automatically', 'retrieve_history', 'discard_import']);
  expect(extractionStatus()).toBe('Your saved history is already up to date.');
  expect(reviewShown()).toBe(false);
});

test('conflicting rolls are listed and cannot be saved', async () => {
  serve({
    retrieve_history: () => review(2, 0, [
      { id: '1000000000000000001', gacha_type: '11', time: '2026-05-01 12:00:00' },
      { id: '1000000000000000002', gacha_type: '1', time: '2026-05-02 13:00:00' },
    ]),
  });
  await selectStarRail();
  findButton().click();
  await settle();
  expect(reviewHeading().textContent).toBe('Some rolls conflict with your saved history');
  const conflicts = reviewPanel().querySelector<HTMLElement>('.conflicts')!;
  expect(conflicts.hidden).toBe(false);
  expect(conflicts.textContent).toContain('differ from saved rolls with the same ID, so nothing can be saved');
  expect([...conflicts.querySelectorAll('li')].map(item => item.textContent)).toEqual([
    'Character Event Warp · 2026-05-01 12:00:00 · ID 1000000000000000001',
    'Stellar Warp · 2026-05-02 13:00:00 · ID 1000000000000000002',
  ]);
  const save = reviewButton('Save to this device');
  expect(save.hidden).toBe(false);
  expect(save.disabled).toBe(true);
  expect(save.getAttribute('aria-describedby')).toBe(conflicts.querySelector('p')!.id);
  expect(reviewButton('Discard').hidden).toBe(false);
  // The next review lists only its own conflicts, and Save describes nothing.
  reviewButton('Discard').click();
  await settle();
  serve({ retrieve_history: () => review(2) });
  findButton().click();
  await settle();
  // The panel renders each review afresh, so look its elements up again.
  const next = reviewPanel().querySelector<HTMLElement>('.conflicts')!;
  expect(next.querySelectorAll('li')).toHaveLength(0);
  expect(next.hidden).toBe(true);
  expect(reviewButton('Save to this device').hasAttribute('aria-describedby')).toBe(false);
});

test('each save failure explains what happened and returns to the start', async () => {
  await selectStarRail();
  for (const [kind, message] of [
    ['conflict', 'Some retrieved rolls differ from ones already saved. Nothing was saved.'],
    ['stale_preview', 'Your saved history changed since this review. Start retrieval again.'],
    ['no_preview', 'Nothing is waiting to be saved. Start retrieval again.'],
    ['storage', 'We couldn’t open the history saved on this device. Nothing was changed.'],
    ['context_mismatch', 'Saved history for this account uses a different time zone than HoYoverse reports.'],
    ['something_new', 'Something went wrong. Please try again.'],
  ]) {
    serve({ retrieve_history: () => review(2), commit_import: () => { throw { kind }; } });
    findButton().click();
    await settle();
    reviewButton('Save to this device').click();
    await settle();
    expect(extractionStatus()).toBe(message.endsWith('reports.') ? `${message} Nothing was saved.` : message);
    expect(reviewShown()).toBe(false);
    expect(start().hidden).toBe(false);
  }
});

test('each category is named in progress, and one new roll reads naturally', async () => {
  const names: string[] = [];
  serve({
    retrieve_history: args => {
      return (async () => {
        for (const gacha_type of ['1', '2', '11', '12', '21', '22']) {
          progressOf(args).onmessage({ kind: 'requesting', gacha_type, page: 1, pages: 0, records: 0 });
          await nextTick();
          names.push(extractionStatus()!);
        }
        return review(1);
      })();
    },
  });
  await selectStarRail();
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
  expect(reviewHeading().textContent).toBe('Ready to save 1 new roll');
});

test('no history is reported without anything to save', async () => {
  const calls = serve({ retrieve_history: () => ({ kind: 'no_history' }) });
  await selectStarRail();
  findButton().click();
  await settle();
  expect(extractionStatus()).toBe('HoYoverse returned no warp history for this account. Nothing was saved.');
  expect(calls).toEqual(['extract_automatically', 'retrieve_history']);
});

test('each retrieval failure explains itself and where retrieval stopped', async () => {
  await selectStarRail();
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
  await selectStarRail();
  await click(findButton());
  await click(cancelButton());
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
  await selectStarRail();
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
  await selectStarRail();
  findButton().click();
  await settle();
  await click(cancelButton());
  // Progress already on its way no longer replaces the cancelling message.
  progress.onmessage({ kind: 'requesting', gacha_type: '1', page: 2, pages: 1, records: 1000 });
  await nextTick();
  expect(extractionStatus()).toBe('Cancelling…');
  retrieval.resolve(review(3));
  await settle();
  expect(calls).toEqual(['extract_automatically', 'retrieve_history', 'cancel_acquisition', 'discard_import']);
  expect(extractionStatus()).toBe('Retrieval cancelled. Nothing was saved.');
  // The next attempt starts afresh.
  serve({ retrieve_history: () => review(2) });
  findButton().click();
  await settle();
  expect(reviewHeading().textContent).toBe('Ready to save 2 new rolls');
});

test('if cancelling cannot be sent, retrieval carries on and can be cancelled again', async () => {
  const retrieval = pending();
  let progress!: Progress;
  serve({
    retrieve_history: args => { progress = progressOf(args); return retrieval.handler(); },
    cancel_acquisition: () => { throw 'cancel_acquisition not allowed'; },
  });
  await selectStarRail();
  findButton().click();
  await settle();
  cancelButton().click();
  await settle();
  expect(cancelButton().disabled).toBe(false);
  progress.onmessage({ kind: 'requesting', gacha_type: '2', page: 1, pages: 0, records: 0 });
  await nextTick();
  expect(extractionStatus()).toBe('Retrieving Departure Warp, page 1 · 0 rolls so far');
  retrieval.resolve(review(5));
  await settle();
  expect(reviewHeading().textContent).toBe('Ready to save 5 new rolls');
});

test('each automatic failure explains what to do next', async () => {
  await selectStarRail();
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
  await selectStarRail();
  const calls = serve({ retrieve_history: () => review(7) });
  fileInput().focus();
  await choose(new File(['synthetic'], 'data_2'));
  expect(extractionStatus()).toBe('Reading the file, then checking with HoYoverse…');
  expect(start().hidden).toBe(true);
  await settle();
  expect(calls).toEqual(['extract_from_file', 'retrieve_history']);
  expect(reviewHeading().textContent).toBe('Ready to save 7 new rolls');
  reviewButton('Discard').click();
  await settle();
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
  await selectStarRail();
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
  await selectStarRail();
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

test('switching back to Genshin Impact hides the Star Rail controls', async () => {
  await selectStarRail();
  await selectGame('genshin-impact');
  expect(panel().hidden).toBe(true);
  expect(document.body.textContent).toContain('Showing saved history is coming next.');
});
