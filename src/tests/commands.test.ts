import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, expect, test } from 'vitest';
import { extractAutomatically, extractFromFile, MAX_CACHE_BYTES } from '../commands';

afterEach(clearMocks);

test('automatic extraction resolves without detail on success', async () => {
  const calls: string[] = [];
  mockIPC(cmd => { calls.push(cmd); });
  expect(await extractAutomatically()).toBeUndefined();
  expect(calls).toEqual(['extract_automatically']);
});

test('known native categories pass through and anything else becomes unavailable', async () => {
  for (const failure of ['unsupported_host', 'discovery_failed', 'no_game_data', 'no_cache', 'no_request']) {
    mockIPC(() => { throw failure; });
    expect(await extractAutomatically()).toBe(failure);
  }
  for (const unexpected of ['extract_automatically not allowed', new Error('private detail'), undefined]) {
    mockIPC(() => { throw unexpected; });
    expect(await extractAutomatically()).toBe('unavailable');
  }
});

test('file extraction sends the raw bytes, never a path', async () => {
  let received: unknown;
  mockIPC((cmd, payload) => { received = [cmd, payload]; });
  const file = new File(['synthetic cache'], 'data_2');
  expect(await extractFromFile(file)).toBeUndefined();
  const [cmd, payload] = received as [string, Uint8Array];
  expect(cmd).toBe('extract_from_file');
  expect(payload).toBeInstanceOf(Uint8Array);
  expect(new TextDecoder().decode(payload)).toBe('synthetic cache');
});

test('file extraction rejects oversized files before reading them', async () => {
  let called = false;
  mockIPC(() => { called = true; });
  const file = new File([], 'data_2');
  Object.defineProperty(file, 'size', { value: MAX_CACHE_BYTES + 1 });
  Object.defineProperty(file, 'arrayBuffer', { value: () => { throw new Error('read'); } });
  expect(await extractFromFile(file)).toBe('file_too_large');
  expect(called).toBe(false);
  mockIPC(() => { throw 'no_request'; });
  expect(await extractFromFile(new File(['x'], 'data_2'))).toBe('no_request');
});

test('a file that cannot be read in the webview is reported as invalid', async () => {
  mockIPC(() => undefined);
  const file = new File(['x'], 'data_2');
  Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.reject(new Error('private')) });
  expect(await extractFromFile(file)).toBe('invalid_file');
});
