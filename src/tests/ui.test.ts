import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

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
  expect(panel().textContent).toContain('checks it with HoYoverse');
  expect(panel().textContent).not.toContain('Nothing is sent anywhere');
});

test('automatic extraction shows progress, then success without revealing details', async () => {
  let resolve!: () => void;
  mockIPC(() => new Promise<void>(done => { resolve = done; }));
  selectStarRail();
  findButton().click();
  expect(findButton().disabled).toBe(true);
  expect(panel().getAttribute('aria-busy')).toBe('true');
  expect(extractionStatus()).toBe('Searching this device, then checking with HoYoverse…');
  resolve();
  await settle();
  expect(findButton().disabled).toBe(false);
  expect(panel().getAttribute('aria-busy')).toBe('false');
  expect(extractionStatus()).toBe('HoYoverse accepted your warp history link. Retrieving your history is coming next.');
  expect(fallback().hidden).toBe(false);
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
    mockIPC(() => { throw { kind: failure }; });
    findButton().click();
    await settle();
    expect(extractionStatus()).toContain(message);
    expect(fallback().hidden).toBe(false);
    expect(findButton().disabled).toBe(false);
  }
});

test('choosing a cache file extracts from it without an automatic search first', async () => {
  selectStarRail();
  const sent: unknown[] = [];
  mockIPC((cmd, payload) => { sent.push(cmd, payload); });
  choose(new File(['synthetic'], 'data_2'));
  expect(extractionStatus()).toBe('Reading the file, then checking with HoYoverse…');
  expect(fileInput().disabled).toBe(true);
  await settle();
  expect(sent[0]).toBe('extract_from_file');
  expect(extractionStatus()).toContain('HoYoverse accepted your warp history link.');
  expect(fileInput().disabled).toBe(false);
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
  expect(fileInput().disabled).toBe(false);
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
  mockIPC(() => undefined);
  const writes: string[] = [];
  Object.defineProperty(fileInput(), 'value', {
    configurable: true, get: () => 'data_2', set: (value: string) => { writes.push(value); },
  });
  choose(new File(['synthetic'], 'data_2'));
  await settle();
  expect(extractionStatus()).toContain('HoYoverse accepted your warp history link.');
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
