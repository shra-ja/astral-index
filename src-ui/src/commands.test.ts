import { clearMocks, mockIPC } from '@tauri-apps/api/mocks'
import { afterEach, expect, test } from 'vitest'
import type { Channel } from '@tauri-apps/api/core'
import {
  cancelAcquisition,
  commitImport,
  discardImport,
  extractAutomatically,
  extractFromFile,
  historyPage,
  lastImport,
  MAX_CACHE_BYTES,
  retrieveHistory,
} from './commands'

// Tauri rejects a command with the native failure as plain data, not an Error.
function reject(failure: unknown): never {
  throw failure
}

afterEach(clearMocks)

test('automatic extraction resolves without detail on success', async () => {
  const calls: string[] = []
  mockIPC((cmd) => {
    calls.push(cmd)
  })
  expect(await extractAutomatically()).toBeUndefined()
  expect(calls).toEqual(['extract_automatically'])
})

test('known native kinds pass through and anything else becomes unavailable', async () => {
  for (const kind of [
    'unsupported_host',
    'discovery_failed',
    'no_game_data',
    'no_cache',
    'no_request',
    'expired_key',
    'rate_limited',
    'network',
    'rejected',
    'invalid_response',
    'internal',
    'cancelled',
    'no_context',
    'history_too_large',
    'mixed_accounts',
    'missing_server',
    'storage',
    'context_mismatch',
    'conflict',
    'stale_preview',
    'no_preview',
    'invalid_request',
  ]) {
    mockIPC(() => reject({ kind }))
    expect(await extractAutomatically()).toEqual({ kind })
  }
  mockIPC(() => reject({ kind: 'api_error', code: -100 }))
  expect(await extractAutomatically()).toEqual({ kind: 'api_error', code: -100 })
  // Only API errors carry a code, and it must be an integer.
  for (const unexpected of [
    'no_request',
    'extract_automatically not allowed',
    new Error('private detail'),
    undefined,
    null,
    { kind: 'something_new' },
    { kind: 'api_error' },
    { kind: 'api_error', code: '-100' },
    { kind: 'api_error', code: 1.5 },
    { kind: 'network', code: 1 },
  ]) {
    mockIPC(() => reject(unexpected))
    expect(await extractAutomatically()).toEqual({ kind: 'unavailable' })
  }
})

test('file extraction sends the raw bytes, never a path', async () => {
  let received: unknown
  mockIPC((cmd, payload) => {
    received = [cmd, payload]
  })
  const file = new File(['synthetic cache'], 'data_2')
  expect(await extractFromFile(file)).toBeUndefined()
  const [cmd, payload] = received as [string, Uint8Array]
  expect(cmd).toBe('extract_from_file')
  expect(payload).toBeInstanceOf(Uint8Array)
  expect(new TextDecoder().decode(payload)).toBe('synthetic cache')
})

test('file extraction rejects oversized files before reading them', async () => {
  let called = false
  mockIPC(() => {
    called = true
  })
  const file = new File([], 'data_2')
  Object.defineProperty(file, 'size', { value: MAX_CACHE_BYTES + 1 })
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => {
      throw new Error('read')
    },
  })
  expect(await extractFromFile(file)).toEqual({ kind: 'file_too_large' })
  expect(called).toBe(false)
  mockIPC(() => reject({ kind: 'no_request' }))
  expect(await extractFromFile(new File(['x'], 'data_2'))).toEqual({ kind: 'no_request' })
})

test('a file that cannot be read in the webview is reported as invalid', async () => {
  mockIPC(() => undefined)
  const file = new File(['x'], 'data_2')
  Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.reject(new Error('private')) })
  expect(await extractFromFile(file)).toEqual({ kind: 'invalid_file' })
})

test('cancelling asks the native side to stop and reports only unexpected failures', async () => {
  const calls: string[] = []
  mockIPC((cmd) => {
    calls.push(cmd)
  })
  expect(await cancelAcquisition()).toBeUndefined()
  expect(calls).toEqual(['cancel_acquisition'])
  mockIPC(() => reject('cancel_acquisition not allowed'))
  expect(await cancelAcquisition()).toEqual({ kind: 'unavailable' })
})

test('retrieval streams progress, then returns the review or no history', async () => {
  const events: unknown[] = []
  const requesting = { kind: 'requesting', gacha_type: '1', page: 1, pages: 0, records: 0 }
  const upToDate = { kind: 'up_to_date', gacha_type: '1' }
  let command = ''
  let mode: unknown
  mockIPC((cmd, args) => {
    command = cmd
    mode = (args as { mode: unknown }).mode
    ;(args as { onProgress: Channel<unknown> }).onProgress.onmessage(requesting)
    ;(args as { onProgress: Channel<unknown> }).onProgress.onmessage(upToDate)
    return { kind: 'no_history' }
  })
  expect(await retrieveHistory('new', (event) => events.push(event))).toEqual({
    retrieved: { kind: 'no_history' },
  })
  expect(command).toBe('retrieve_history')
  expect(mode).toBe('new')
  expect(events).toEqual([requesting, upToDate])
  const review = { kind: 'review', uid: '100000001', server: 'synthetic-server' }
  mockIPC((_, args) => (args as { mode: string }).mode === 'full' && review)
  expect(await retrieveHistory('full', () => undefined)).toEqual({ retrieved: review })
})

test('retrieval failures keep only a valid category and page', async () => {
  mockIPC(() => reject({ kind: 'expired_key', gacha_type: '2', page: 1 }))
  expect(await retrieveHistory('full', () => undefined)).toEqual({
    failure: { kind: 'expired_key', location: { gacha_type: '2', page: 1 } },
  })
  for (const location of [
    {},
    { gacha_type: '99', page: 1 },
    { gacha_type: '2', page: 0 },
    { gacha_type: '2', page: 1.5 },
  ]) {
    mockIPC(() => reject({ kind: 'network', ...location }))
    expect(await retrieveHistory('full', () => undefined)).toEqual({ failure: { kind: 'network' } })
  }
})

test('committing returns what was added, and failures stay safe categories', async () => {
  const summary = { inserted: 2, duplicates: 5, conflicts: 0 }
  const calls: string[] = []
  mockIPC((cmd) => {
    calls.push(cmd)
    return summary
  })
  expect(await commitImport()).toEqual({ summary })
  expect(calls).toEqual(['commit_import'])
  mockIPC(() => reject({ kind: 'stale_preview' }))
  expect(await commitImport()).toEqual({ failure: { kind: 'stale_preview' } })
})

test('discarding asks the native side to drop the preview', async () => {
  const calls: string[] = []
  mockIPC((cmd) => {
    calls.push(cmd)
  })
  expect(await discardImport()).toBeUndefined()
  expect(calls).toEqual(['discard_import'])
})

test('a history page is read by category, page and size, and never fetches', async () => {
  const history = {
    account: { uid: '100000001', server: 'synthetic-server', timezone: 8 },
    total: 1,
    categories: [{ gacha_type: '11', total: 1 }],
    rolls: [
      {
        number: 1,
        id: '1000',
        name: 'Synthetic item',
        item_type: 'Character',
        rank_type: '5',
        time: '2026-09-28 21:14:03',
      },
    ],
  }
  const calls: [string, unknown][] = []
  mockIPC((cmd, args) => {
    calls.push([cmd, args])
    return history
  })
  expect(await historyPage('11', 2, 50)).toEqual({ history })
  expect(calls).toEqual([['history_page', { category: '11', page: 2, pageSize: 50 }]])
  mockIPC(() => reject({ kind: 'invalid_request' }))
  expect(await historyPage('99', 1, 20)).toEqual({ failure: { kind: 'invalid_request' } })
})

test('the last import is read from this device, and is null before the first', async () => {
  const last = {
    imported_at: 1790000000,
    source: 'hoyoverse',
    uid: '100000001',
    server: 'synthetic-server',
    inserted: 96,
  }
  const calls: string[] = []
  mockIPC((cmd) => {
    calls.push(cmd)
    return last
  })
  expect(await lastImport()).toEqual({ last })
  expect(calls).toEqual(['last_import'])
  mockIPC(() => null)
  expect(await lastImport()).toEqual({ last: null })
  mockIPC(() => reject({ kind: 'storage' }))
  expect(await lastImport()).toEqual({ failure: { kind: 'storage' } })
})
