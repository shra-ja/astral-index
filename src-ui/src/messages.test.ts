import { expect, test } from 'vitest'
import type { Failure, Kind } from './commands'
import {
  automaticMessages,
  commitMessages,
  describe,
  fileMessages,
  historyFailure,
  lastImportParts,
  progressText,
  retrievalFailure,
  savedDetail,
  savedTitle,
  titleOf,
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
  expect(progressText({ kind: 'up_to_date', gacha_type: '12' })).toBe(
    'Light Cone Event Warp is up to date: it reached rolls already saved.',
  )
})

test('a save is headed by what was added, and says which account it went to', () => {
  const saved = (inserted: number, duplicates: number) => ({
    summary: { inserted, duplicates, conflicts: 0 },
    uid: '100000001',
    server: 'synthetic-server',
  })
  expect(savedTitle(saved(214, 1816))).toBe('214 Rolls Saved')
  expect(savedTitle(saved(1, 0))).toBe('1 Roll Saved')
  expect(savedTitle(saved(1200, 0))).toBe('1,200 Rolls Saved')
  // The rolls already saved have their own tile, so the sentence leaves them out.
  expect(savedDetail(saved(214, 1816))).toBe('Added to UID 100000001 (synthetic-server).')
  expect(savedDetail({ ...saved(1, 0), server: 'prod_gf_cn' })).toBe(
    'Added to UID 100000001 (China).',
  )
})

test.each<[Kind, string]>([
  ['expired_key', 'The Warp History Link Has Expired'],
  ['api_error', 'HoYoverse Didn’t Accept the Link'],
  ['unsupported_host', 'Couldn’t Find the Game Files'],
  ['discovery_failed', 'Couldn’t Find the Game Files'],
  ['no_game_data', 'Couldn’t Find the Game Files'],
  ['no_cache', 'Couldn’t Find the Game Files'],
  ['no_request', 'Couldn’t Find a Warp History Link'],
  ['file_too_large', 'Couldn’t Read That File'],
  ['invalid_file', 'Couldn’t Read That File'],
  ['network', 'Couldn’t Reach HoYoverse'],
  ['internal', 'Couldn’t Reach HoYoverse'],
  ['rate_limited', 'HoYoverse Is Busy'],
  ['rejected', 'HoYoverse Sent an Unexpected Response'],
  ['invalid_response', 'HoYoverse Sent an Unexpected Response'],
  ['conflict', 'Nothing Was Saved'],
  ['stale_preview', 'Nothing Was Saved'],
  ['no_preview', 'Nothing Was Saved'],
  ['storage', 'Nothing Was Saved'],
  ['context_mismatch', 'Nothing Was Saved'],
  ['history_too_large', 'Retrieval Didn’t Finish'],
  ['mixed_accounts', 'Retrieval Didn’t Finish'],
  ['missing_server', 'Retrieval Didn’t Finish'],
  ['no_context', 'Retrieval Didn’t Finish'],
  ['cancelled', 'Retrieval Cancelled'],
  ['invalid_request', 'Something Went Wrong'],
  ['unavailable', 'Something Went Wrong'],
])('a %s failure is headed %s', (kind, title) => {
  expect(titleOf({ kind })).toBe(title)
})

test('reading saved history explains damage, and anything else asks to try again', () => {
  expect(historyFailure({ kind: 'storage' })).toBe(
    'We couldn’t read the history saved on this device. Nothing was changed.',
  )
  for (const kind of ['invalid_request', 'unavailable'] as const) {
    expect(historyFailure({ kind })).toBe('Something went wrong. Please try again.')
  }
})

test('the last import says where it came from, which account and how many rolls it added', () => {
  const last = {
    imported_at: 1790000000,
    source: 'hoyoverse' as const,
    uid: '100000001',
    server: 'prod_official_asia',
    inserted: 96,
  }
  expect(lastImportParts(last, 'UTC')).toEqual([
    '21 Sep 2026, 14:13',
    'Retrieved from HoYoverse',
    'UID 100000001 (Asia)',
    '96 new rolls saved',
  ])
  expect(lastImportParts({ ...last, inserted: 1 }, 'UTC')[3]).toBe('1 new roll saved')
})
