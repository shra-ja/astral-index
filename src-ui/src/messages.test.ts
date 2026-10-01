import { expect, test } from 'vitest'
import type { Failure, Kind } from './commands'
import {
  automaticMessages,
  commitMessages,
  describe,
  fileMessages,
  progressText,
  retrievalFailure,
  savedText,
} from './messages'

// Validation failures read the same for automatic and file extraction.
const validationFailures: [Kind, string][] = [
  [
    'expired_key',
    'Your warp history link has expired. Open your warp history in the game to refresh it, then try again.',
  ],
  ['rate_limited', 'HoYoverse is receiving too many requests. Wait a few minutes, then try again.'],
  ['network', 'We couldn’t reach HoYoverse. Check your internet connection, then try again.'],
  ['rejected', 'HoYoverse gave an unexpected response. Try again later.'],
  ['invalid_response', 'HoYoverse sent a response we couldn’t read. Try again later.'],
  [
    'internal',
    'We couldn’t start the connection to HoYoverse. Nothing was sent. Please try again.',
  ],
  ['cancelled', 'Retrieval cancelled. Nothing was saved.'],
  ['unavailable', 'Something went wrong. Please try again.'],
]
const retry = 'then try again, or choose the cache file below.'

test.each<[Kind, string]>([
  [
    'unsupported_host',
    'Automatic search needs Windows, or WSL with access to Windows. Choose the cache file below instead.',
  ],
  [
    'discovery_failed',
    'We couldn’t look up your Windows user folder. Try again, or choose the cache file below.',
  ],
  [
    'no_game_data',
    `We couldn’t find Honkai: Star Rail’s game logs. Launch the game once, ${retry}`,
  ],
  [
    'no_cache',
    `We found the game, but not its web cache. Open your warp history in the game, ${retry}`,
  ],
  [
    'no_request',
    `We couldn’t find a warp history request. Open your warp history in the game, ${retry}`,
  ],
  ...validationFailures,
])('the automatic search explains %s', (kind, message) => {
  expect(describe({ kind }, automaticMessages)).toBe(message)
})

test.each<[Kind, string]>([
  [
    'no_request',
    'That file doesn’t contain a warp history request. Check it’s the game’s data_2 file, and open your warp history in the game first.',
  ],
  ['file_too_large', 'That file is larger than 16 MiB, so it isn’t a supported cache file.'],
  ['invalid_file', 'That file couldn’t be read. Try choosing it again.'],
  ...validationFailures,
])('a chosen file explains %s', (kind, message) => {
  expect(describe({ kind }, fileMessages)).toBe(message)
})

const retrievalFailures: [Kind, string][] = [
  [
    'history_too_large',
    'Your history is larger than the 16 MiB we can retrieve at once. Nothing was saved.',
  ],
  [
    'mixed_accounts',
    'HoYoverse returned history for more than one account, so nothing was kept. Try again.',
  ],
  [
    'missing_server',
    'HoYoverse didn’t say which server this history belongs to, so nothing was kept.',
  ],
  ['storage', 'We couldn’t open the history saved on this device. Nothing was changed.'],
  [
    'context_mismatch',
    'Saved history for this account uses a different time zone than HoYoverse reports. Nothing was saved.',
  ],
  ['no_context', 'Nothing is waiting to be saved. Start retrieval again.'],
  ...validationFailures,
]

test.each(retrievalFailures)('retrieval explains %s', (kind, message) => {
  expect(retrievalFailure({ kind })).toBe(message)
})

test('retrieval says where it stopped, unless the user stopped it', () => {
  expect(retrievalFailure({ kind: 'network', location: { gacha_type: '12', page: 2 } })).toBe(
    'Retrieval stopped at Light Cone Event Warp, page 2. We couldn’t reach HoYoverse. Check your internet connection, then try again.',
  )
  // Stopping is the user's choice, not a place in the history.
  expect(retrievalFailure({ kind: 'cancelled', location: { gacha_type: '1', page: 1 } })).toBe(
    'Retrieval cancelled. Nothing was saved.',
  )
})

test.each<[Kind, string]>([
  ['conflict', 'Some retrieved rolls differ from ones already saved. Nothing was saved.'],
  ['stale_preview', 'Your saved history changed since this review. Start retrieval again.'],
  ['no_preview', 'Nothing is waiting to be saved. Start retrieval again.'],
  ...retrievalFailures,
])('saving explains %s', (kind, message) => {
  expect(describe({ kind }, commitMessages)).toBe(message)
})

test('an API error shows its code with the next step, at every step', () => {
  const failure: Failure = { kind: 'api_error', code: -100 }
  const message =
    'HoYoverse didn’t accept your warp history link (error -100). Open your warp history in the game, then try again.'
  for (const messages of [automaticMessages, fileMessages, commitMessages]) {
    expect(describe(failure, messages)).toBe(message)
  }
  expect(retrievalFailure({ ...failure, location: { gacha_type: '1', page: 1 } })).toBe(
    `Retrieval stopped at Stellar Warp, page 1. ${message}`,
  )
})

test('progress names each warp and page with the rolls so far, or a pending retry', () => {
  expect(
    ['1', '2', '11', '12', '21', '22'].map((gacha_type) =>
      progressText({ kind: 'requesting', gacha_type, page: 1, pages: 0, records: 0 }),
    ),
  ).toEqual([
    'Retrieving Stellar Warp, page 1 · 0 rolls so far',
    'Retrieving Departure Warp, page 1 · 0 rolls so far',
    'Retrieving Character Event Warp, page 1 · 0 rolls so far',
    'Retrieving Light Cone Event Warp, page 1 · 0 rolls so far',
    'Retrieving Character Collaboration Warp, page 1 · 0 rolls so far',
    'Retrieving Light Cone Collaboration Warp, page 1 · 0 rolls so far',
  ])
  expect(
    progressText({ kind: 'requesting', gacha_type: '11', page: 2, pages: 1, records: 1532 }),
  ).toBe('Retrieving Character Event Warp, page 2 · 1,532 rolls so far')
  expect(progressText({ kind: 'requesting', gacha_type: '1', page: 1, pages: 0, records: 1 })).toBe(
    'Retrieving Stellar Warp, page 1 · 1 roll so far',
  )
  expect(progressText({ kind: 'retry_pending', delay_ms: 1000 })).toBe(
    'HoYoverse didn’t respond, so we’ll try again in a moment…',
  )
})

test('a save says what was added, and what was already saved only when there was some', () => {
  expect(savedText({ inserted: 412, duplicates: 88, conflicts: 0 })).toBe(
    'Saved 412 new rolls to this device. 88 were already saved.',
  )
  expect(savedText({ inserted: 1, duplicates: 1, conflicts: 0 })).toBe(
    'Saved 1 new roll to this device. 1 was already saved.',
  )
  expect(savedText({ inserted: 3, duplicates: 0, conflicts: 0 })).toBe(
    'Saved 3 new rolls to this device.',
  )
  expect(savedText({ inserted: 1200, duplicates: 1500, conflicts: 0 })).toBe(
    'Saved 1,200 new rolls to this device. 1,500 were already saved.',
  )
})
