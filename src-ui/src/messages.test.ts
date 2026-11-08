import { expect, test } from 'vitest'
import type { Failure, FileAccountProblem, Found, OtherGame, PlainKind, Refusal } from './commands'
import {
  accountProblem,
  automaticMessages,
  backupFailure,
  cacheFileMessages,
  commitMessages,
  describe,
  historyFileFailure,
  importCopy,
  leftOut,
  noStarRailHistory,
  reviewCopy,
  historyFailure,
  lastImportParts,
  progressText,
  replaceFailure,
  restoreFailure,
  restoreSummary,
  retrievalFailure,
  savedDetail,
  savedTitle,
  titleOf,
} from './messages'

// Validation failures read the same for automatic and file extraction.
const validationFailures: [PlainKind, string][] = [
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

test.each<[PlainKind, string]>([
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

test.each<[PlainKind, string]>([
  [
    'no_request',
    'That file doesn’t contain a warp history request. Check it’s the game’s data_2 file, and open your warp history in the game first.',
  ],
  ['file_too_large', 'That file is larger than 16 MiB, so it isn’t a supported cache file.'],
  ['invalid_file', 'That file couldn’t be read. Try choosing it again.'],
  ...validationFailures,
])('a chosen file explains %s', (kind, message) => {
  expect(describe({ kind }, cacheFileMessages)).toBe(message)
})

const retrievalFailures: [PlainKind, string][] = [
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

test.each<[PlainKind, string]>([
  ['conflict', 'Some retrieved rolls differ from ones already saved. Nothing was saved.'],
  ['stale_preview', 'Your saved history changed since this review. Start retrieval again.'],
  ['no_preview', 'Nothing is waiting to be saved. Start retrieval again.'],
  ...retrievalFailures,
])('saving explains %s', (kind, message) => {
  expect(describe({ kind }, commitMessages)).toBe(message)
})

test.each<[PlainKind, string]>([
  [
    'file_too_large',
    'That file is larger than 64 MiB, so it isn’t a supported history file. Nothing was saved.',
  ],
  [
    'invalid_file',
    'That file couldn’t be read. Check that it’s still there, then choose it again.',
  ],
  [
    'not_history_file',
    'That file isn’t a UIGF history file. Choose a UIGF v4 JSON export. Nothing was saved.',
  ],
  ['storage', 'We couldn’t open the history saved on this device. Nothing was changed.'],
  ['invalid_request', 'The file’s accounts are no longer held. Choose the file again.'],
  ['unavailable', 'Something went wrong. Please try again.'],
])('a history file explains %s', (kind, message) => {
  expect(historyFileFailure({ kind })).toBe(message)
})

test('an unsupported history file says what it is and which versions are read', () => {
  const read = (found: Found) => historyFileFailure({ kind: 'unsupported_file', found })
  expect(read({ format: 'uigf', major: 5, minor: 0 })).toBe(
    'This is a UIGF v5.0 file. Astral Index reads UIGF v4.0 to v4.2. Nothing was saved.',
  )
  expect(read({ format: 'legacy_uigf' })).toBe(
    'This is an older UIGF file, from before v4.0. Export the history again as UIGF v4, then choose that file. Nothing was saved.',
  )
  expect(read({ format: 'srgf' })).toBe(
    'This is an SRGF file, the format UIGF v4 replaced. Export the history again as UIGF v4, then choose that file. Nothing was saved.',
  )
  expect(titleOf({ kind: 'unsupported_file', found: { format: 'srgf' } })).toBe(
    'This File’s Format Isn’t Supported',
  )
  expect(titleOf({ kind: 'not_history_file' })).toBe('Couldn’t Read That File')
})

test.each<[PlainKind, string]>([
  ['conflict', 'Some of the file’s rolls differ from ones already saved. Nothing was saved.'],
  ['stale_preview', 'Your saved history changed since this review. Choose the file again.'],
  ['no_preview', 'Nothing is waiting to be saved. Choose the file again.'],
  [
    'context_mismatch',
    'Saved history for this account uses a different time zone than the file. Nothing was saved.',
  ],
  ['storage', 'We couldn’t open the history saved on this device. Nothing was changed.'],
])('saving a file’s account explains %s, never naming HoYoverse', (kind, message) => {
  expect(describe({ kind }, importCopy.file.commit)).toBe(message)
})

test('each origin has its own notes and labels; retrieval’s are as before', () => {
  expect(importCopy.retrieval.commit).toBe(commitMessages)
  expect(importCopy.retrieval.cancelled).toBe('Retrieval cancelled. Nothing was saved.')
  expect(importCopy.file.cancelled).toBe('File import cancelled. Nothing was saved.')
  expect(importCopy.retrieval.discarded).toBe('Discarded the retrieved history. Nothing was saved.')
  expect(importCopy.file.discarded).toBe('Discarded the file’s rolls. Nothing was saved.')
  expect([importCopy.retrieval.period, importCopy.file.period]).toEqual([
    'Retrieved period',
    'Period in file',
  ])
  expect([importCopy.retrieval.rolls, importCopy.file.rolls]).toEqual([
    'These retrieved rolls',
    'These rolls from the file',
  ])
})

test('a review’s wording follows what saving would do', () => {
  const copy = (inserted: number, conflicts = 0, pool_ids_added = 0) =>
    reviewCopy({ inserted, duplicates: 3, conflicts, pool_ids_added })
  expect(copy(412)).toEqual({
    state: 'rolls',
    heading: 'Ready to save 412 new rolls',
    footnote: 'Saving adds 412 rolls. Rolls already saved are never changed.',
    save: 'Save 412 rolls',
  })
  expect(copy(2, 0, 96)).toEqual({
    state: 'rolls',
    heading: 'Ready to save 2 new rolls',
    banners: '96 of the skipped rolls also add their banner to saved rolls that lacked it.',
    footnote:
      'Saving adds 2 rolls and 96 banners. Rolls already saved are never changed otherwise.',
    save: 'Save 2 rolls',
  })
  expect(copy(1, 0, 1).banners).toBe(
    '1 of the skipped rolls also adds its banner to a saved roll that lacked it.',
  )
  expect(copy(0, 0, 12)).toEqual({
    state: 'banners',
    heading: 'Banners to add to 12 saved rolls',
    banners: 'These rolls are already saved, but 12 of them lack their banner, which saving adds.',
    footnote: 'No new rolls. Saving adds banners only; nothing else changes.',
    save: 'Save banners',
  })
  expect(copy(0, 0, 1)).toMatchObject({
    heading: 'Banner to add to 1 saved roll',
    banners: 'These rolls are already saved, but 1 of them lacks its banner, which saving adds.',
    save: 'Save banner',
  })
  // Done replaces Save when nothing is new.
  expect(copy(0)).toEqual({
    state: 'nothing',
    heading: 'Everything here is already saved',
    footnote: 'Nothing new to save. Your saved history already has these rolls.',
  })
  // Conflicts block saving, whatever else is new, so banners aren't mentioned.
  expect(copy(2, 1, 5)).toEqual({
    state: 'conflicting',
    heading: 'Some rolls conflict with your saved history',
    footnote: 'Nothing can be saved while rolls conflict.',
    save: 'Save 2 rolls',
  })
})

test.each<[FileAccountProblem, string]>([
  [{ kind: 'repeated' }, 'The file holds this UID more than once.'],
  [{ kind: 'invalid_timezone' }, 'Its time zone in the file isn’t a valid UTC offset.'],
  [{ kind: 'no_rolls' }, 'The file holds no rolls for it.'],
  [{ kind: 'no_server' }, 'No Star Rail server gives out UIDs like this one.'],
  [
    { kind: 'several_servers' },
    'It is saved on more than one server, so which one is meant can’t be told.',
  ],
  [{ kind: 'timezone_mismatch' }, 'Its time zone in the file differs from its server’s.'],
  [
    { kind: 'records', missing: { name: 12 }, invalid: 3, newer_categories: 0 },
    '12 records lack an item name; 3 records have values that can’t be read.',
  ],
  // The native side sends the fields in alphabetical order; they read in UIGF's.
  [
    {
      kind: 'records',
      missing: {
        gacha_id: 1,
        gacha_type: 2,
        id: 1,
        item_id: 1,
        item_type: 1,
        rank_type: 1,
        time: 1,
      },
      invalid: 1,
      newer_categories: 0,
    },
    '1 record lacks a roll ID; 2 records lack a category; 1 record lacks a banner; 1 record lacks an item ID; 1 record lacks a time; 1 record lacks an item type; 1 record lacks a rarity; 1 record has a value that can’t be read.',
  ],
  [
    { kind: 'records', missing: { name: 2 }, invalid: 0, newer_categories: 1 },
    '2 records lack an item name; 1 record is a collaboration roll, which this file’s UIGF version doesn’t have.',
  ],
  [
    { kind: 'records', missing: {}, invalid: 0, newer_categories: 4 },
    '4 records are collaboration rolls, which this file’s UIGF version doesn’t have.',
  ],
])('an account that can’t be imported says why: %j', (status, reason) => {
  expect(accountProblem(status)).toBe(reason)
})

test('a file’s accounts note what was left out', () => {
  const contents = (malformed_uids: number, other_games: OtherGame[]) => ({
    accounts: [],
    malformed_uids,
    other_games,
  })
  expect(leftOut(contents(0, []))).toEqual([])
  expect(leftOut(contents(1, ['hk4e']))).toEqual([
    '1 more account has a UID that isn’t a number, so it isn’t listed.',
    'The file’s Genshin Impact history was left out: only Star Rail is read from files.',
  ])
  expect(leftOut(contents(2, ['hk4e', 'nap', 'hk4e_ugc']))).toEqual([
    '2 more accounts have UIDs that aren’t numbers, so they aren’t listed.',
    'The file’s Genshin Impact, Zenless Zone Zero, and Miliastra Wonderland history was left out: only Star Rail is read from files.',
  ])
})

test('a file with no Star Rail accounts says what it holds instead', () => {
  expect(noStarRailHistory({ accounts: [], malformed_uids: 0, other_games: ['hk4e'] })).toBe(
    'The file holds only Genshin Impact history, which Astral Index can’t import from files yet. Nothing was saved.',
  )
  expect(noStarRailHistory({ accounts: [], malformed_uids: 0, other_games: [] })).toBe(
    'The file holds no Star Rail history. Nothing was saved.',
  )
  // Accounts whose UIDs aren't numbers are still Star Rail's, so they are named.
  expect(noStarRailHistory({ accounts: [], malformed_uids: 2, other_games: ['nap'] })).toBe(
    'The file’s 2 Star Rail accounts have UIDs that aren’t numbers. Nothing was saved.',
  )
  expect(noStarRailHistory({ accounts: [], malformed_uids: 1, other_games: [] })).toBe(
    'The file’s 1 Star Rail account has a UID that isn’t a number. Nothing was saved.',
  )
})

test('an API error shows its code with the next step, at every step', () => {
  const failure: Failure = { kind: 'api_error', code: -100 }
  expect(titleOf(failure)).toBe('HoYoverse Didn’t Accept the Link')
  const message =
    'HoYoverse didn’t accept your warp history link (error -100). Open your warp history in the game, then try again.'
  for (const messages of [automaticMessages, cacheFileMessages, commitMessages]) {
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
  const saved = (inserted: number, duplicates: number, pool_ids_added = 0) => ({
    summary: { inserted, duplicates, conflicts: 0, pool_ids_added },
    uid: '100000001',
    server: 'synthetic-server',
  })
  expect(savedTitle(saved(214, 1816))).toBe('214 Rolls Saved')
  expect(savedTitle(saved(1, 0))).toBe('1 Roll Saved')
  expect(savedTitle(saved(1200, 0))).toBe('1,200 Rolls Saved')
  // New rolls lead; only banners added to saved rolls say so instead.
  expect(savedTitle(saved(3, 40, 12))).toBe('3 Rolls Saved')
  expect(savedTitle(saved(0, 40, 12))).toBe('Banners Added to 12 Saved Rolls')
  expect(savedTitle(saved(0, 1, 1))).toBe('Banner Added to 1 Saved Roll')
  // The rolls already saved have their own tile, so the sentence leaves them out.
  expect(savedDetail(saved(214, 1816))).toBe('Added to UID 100000001 (synthetic-server).')
  expect(savedDetail({ ...saved(1, 0), server: 'prod_gf_cn' })).toBe(
    'Added to UID 100000001 (China).',
  )
})

test.each<[PlainKind, string]>([
  ['expired_key', 'The Warp History Link Has Expired'],
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

test('a backup that was not saved says why: the place, or the history itself', () => {
  expect(backupFailure({ kind: 'backup_failed' })).toBe(
    'The backup couldn’t be saved there. Choose another folder and try again.',
  )
  expect(backupFailure({ kind: 'backup_in_data_folder' })).toBe(
    'A backup can’t be saved in the folder that holds your history. Choose another folder.',
  )
  expect(backupFailure({ kind: 'history_damaged' })).toBe(
    'Your saved history failed its check, so no backup was made. Nothing was changed.',
  )
  expect(backupFailure({ kind: 'storage' })).toBe(
    'Your saved history couldn’t be read, so no backup was made. Nothing was changed.',
  )
  expect(backupFailure({ kind: 'history_not_upgraded', copy: null })).toBe(
    'Your history couldn’t be upgraded, so it can’t be backed up. Restore a backup instead.',
  )
  expect(backupFailure({ kind: 'unavailable' })).toBe('Something went wrong. Please try again.')
})

test('a refused or failed restore says why, and that nothing was changed', () => {
  const refused: [Refusal, string][] = [
    ['too_large', 'This file is too large to be an Astral Index backup.'],
    ['not_database', 'This file isn’t an Astral Index backup.'],
    ['other_app', 'This file is another app’s database, not an Astral Index backup.'],
    [
      'newer',
      'This backup was made by a newer version of Astral Index. Update the app, then restore it.',
    ],
    ['damaged', 'This backup is damaged and can’t be restored.'],
    ['unreadable', 'The file couldn’t be read. Check that it’s still there and try again.'],
  ]
  for (const [refusal, message] of refused) {
    expect(restoreFailure({ kind: 'restore_refused', refusal })).toBe(message)
  }
  expect(restoreFailure({ kind: 'restore_is_history' })).toBe(
    'This is your current history, not a backup.',
  )
  expect(restoreFailure({ kind: 'restore_failed' })).toBe(
    'The backup couldn’t be checked. Try again.',
  )
  expect(restoreFailure({ kind: 'storage' })).toBe(
    'Your current history couldn’t be read to compare with the backup. Nothing was changed.',
  )
  expect(restoreFailure({ kind: 'unavailable' })).toBe('Something went wrong. Please try again.')
  // An import held or running refuses the restore before any dialog opens.
  const finishImport = 'Finish or discard the import first, then restore the backup.'
  expect(restoreFailure({ kind: 'import_under_way' })).toBe(finishImport)
  // Every native kind has a heading, these included.
  expect(titleOf({ kind: 'restore_failed' })).toBe('Something Went Wrong')
  expect(titleOf({ kind: 'restore_changed' })).toBe('Something Went Wrong')
  expect(titleOf({ kind: 'import_under_way' })).toBe('Something Went Wrong')
  // A history that can't be upgraded has its own screen; a failure title still names it.
  expect(titleOf({ kind: 'history_not_upgraded', copy: null })).toBe(
    'Your History Couldn’t Be Upgraded',
  )
})

test('a confirmed restore that replaced nothing says why, and that the history is unchanged', () => {
  expect(replaceFailure({ kind: 'restore_changed' })).toBe(
    'Your history changed after the backup was checked, so nothing was replaced. Choose the backup again.',
  )
  expect(replaceFailure({ kind: 'restore_failed' })).toBe(
    'The backup couldn’t be restored. Your history is unchanged.',
  )
  expect(replaceFailure({ kind: 'storage' })).toBe(
    'Your current history couldn’t be read, so nothing was replaced.',
  )
  expect(replaceFailure({ kind: 'import_under_way' })).toBe(
    'Finish or discard the import first, then restore the backup.',
  )
  expect(replaceFailure({ kind: 'unavailable' })).toBe('Something went wrong. Please try again.')
})

test('the restore confirmation sums up what replaces what', () => {
  const holding = (...rolls: number[]) => ({
    accounts: rolls.map((count, index) => ({
      uid: `10000000${index}`,
      server: 'prod_official_asia',
      timezone: 8,
      rolls: count,
    })),
    last_import: null,
  })
  expect(restoreSummary(holding(2244, 51), holding(2030, 312, 88))).toBe(
    'Restoring replaces 2,295 rolls in 2 accounts with 2,430 rolls in 3 accounts.',
  )
  expect(restoreSummary(holding(1), holding(1))).toBe(
    'Restoring replaces 1 roll in 1 account with 1 roll in 1 account.',
  )
  // With no saved history, nothing is replaced.
  expect(restoreSummary(holding(), holding(15))).toBe('Restoring saves 15 rolls in 1 account.')
  // A history that couldn't be upgraded can't be counted.
  expect(restoreSummary(null, holding(15))).toBe(
    'Restoring replaces your current history with 15 rolls in 1 account.',
  )
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
  expect(lastImportParts({ ...last, source: 'uigf' }, 'UTC')[1]).toBe('Imported from a file')
})
