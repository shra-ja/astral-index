// What the retrieval flow tells the user about failures, progress and saving, and
// what the About dialog and Backup & Restore say when something couldn’t be done.
import type {
  Counts,
  Failure,
  FileAccountProblem,
  FileContents,
  Found,
  Kind,
  LastImport,
  OtherGame,
  Progress,
  Refusal,
  RollField,
} from './commands'
import type { Opening } from './composables/useOpenings'
import { localDateTime, noun, plural, serverName, warps } from './format'

/** Messages by failure kind, for one step of the flow. */
export type Messages = Partial<Record<Kind, string>>

export const cancelled = 'Retrieval cancelled. Nothing was saved.'
const retry = 'then try again, or choose the cache file below.'
const unexpected = 'Something went wrong. Please try again.'
// Validation reads the same whichever way the link was found.
const validationMessages: Messages = {
  expired_key:
    'Your warp history link has expired. Open your warp history in the game to refresh it, then try again.',
  rate_limited: 'HoYoverse is receiving too many requests. Wait a few minutes, then try again.',
  network: 'We couldn’t reach HoYoverse. Check your internet connection, then try again.',
  rejected: 'HoYoverse gave an unexpected response. Try again later.',
  invalid_response: 'HoYoverse sent a response we couldn’t read. Try again later.',
  internal: 'We couldn’t start the connection to HoYoverse. Nothing was sent. Please try again.',
  cancelled,
}
const retrievalMessages: Messages = {
  ...validationMessages,
  history_too_large:
    'Your history is larger than the 16 MiB we can retrieve at once. Nothing was saved.',
  mixed_accounts:
    'HoYoverse returned history for more than one account, so nothing was kept. Try again.',
  missing_server: 'HoYoverse didn’t say which server this history belongs to, so nothing was kept.',
  storage: 'We couldn’t open the history saved on this device. Nothing was changed.',
  context_mismatch:
    'Saved history for this account uses a different time zone than HoYoverse reports. Nothing was saved.',
  no_context: 'Nothing is waiting to be saved. Start retrieval again.',
}
export const commitMessages: Messages = {
  ...retrievalMessages,
  conflict: 'Some retrieved rolls differ from ones already saved. Nothing was saved.',
  stale_preview: 'Your saved history changed since this review. Start retrieval again.',
  no_preview: 'Nothing is waiting to be saved. Start retrieval again.',
}
export const automaticMessages: Messages = {
  ...validationMessages,
  unsupported_host:
    'Automatic search needs Windows, or WSL with access to Windows. Choose the cache file below instead.',
  discovery_failed: `We couldn’t look up your Windows user folder. Try again, or choose the cache file below.`,
  no_game_data: `We couldn’t find Honkai: Star Rail’s game logs. Launch the game once, ${retry}`,
  no_cache: `We found the game, but not its web cache. Open your warp history in the game, ${retry}`,
  no_request: `We couldn’t find a warp history request. Open your warp history in the game, ${retry}`,
}
export const cacheFileMessages: Messages = {
  ...validationMessages,
  no_request:
    'That file doesn’t contain a warp history request. Check it’s the game’s data_2 file, and open your warp history in the game first.',
  file_too_large: 'That file is larger than 16 MiB, so it isn’t a supported cache file.',
  invalid_file: 'That file couldn’t be read. Try choosing it again.',
}

// Reading a history file: nothing is sent anywhere, so only the file and the saved
// history can fail.
const historyFileMessages: Messages = {
  file_too_large:
    'That file is larger than 64 MiB, so it isn’t a supported history file. Nothing was saved.',
  invalid_file: 'That file couldn’t be read. Check that it’s still there, then choose it again.',
  not_history_file:
    'That file isn’t a UIGF history file. Choose a UIGF v4 JSON export. Nothing was saved.',
  storage: retrievalMessages.storage,
  invalid_request: 'The file’s accounts are no longer held. Choose the file again.',
}
const exportAgain = 'Export the history again as UIGF v4, then choose that file. Nothing was saved.'
/** What an unsupported file is, and what to do instead. */
function unsupported(found: Found) {
  switch (found.format) {
    case 'uigf':
      return `This is a UIGF v${found.major}.${found.minor} file. Astral Index reads UIGF v4.0 to v4.2. Nothing was saved.`
    case 'legacy_uigf':
      return `This is an older UIGF file, from before v4.0. ${exportAgain}`
    case 'srgf':
      return `This is an SRGF file, the format UIGF v4 replaced. ${exportAgain}`
  }
}

/** Why a history file couldn’t be read or one of its accounts previewed. */
export const historyFileFailure = (failure: Failure) =>
  failure.kind === 'unsupported_file'
    ? unsupported(failure.found!)
    : describe(failure, historyFileMessages)

/** Where an import’s rolls come from, as its wording tells: retrieval from HoYoverse,
 * whether the link was found on this device or in a cache file, or a history file. */
export type Origin = 'retrieval' | 'file'
/** What an import says that depends on where its rolls come from. */
interface OriginCopy {
  /** Why saving failed. */
  commit: Messages
  /** The note when the import was cancelled, or its review discarded. */
  cancelled: string
  discarded: string
  /** The review’s label for the period its rolls cover. */
  period: string
  /** How the review’s conflicts note names the incoming rolls. */
  rolls: string
}
export const importCopy: Record<Origin, OriginCopy> = {
  retrieval: {
    commit: commitMessages,
    cancelled,
    discarded: 'Discarded the retrieved history. Nothing was saved.',
    period: 'Retrieved period',
    rolls: 'These retrieved rolls',
  },
  // Saving a file’s account never involves HoYoverse, so none of retrieval’s wording.
  file: {
    commit: {
      ...historyFileMessages,
      conflict: 'Some of the file’s rolls differ from ones already saved. Nothing was saved.',
      stale_preview: 'Your saved history changed since this review. Choose the file again.',
      no_preview: 'Nothing is waiting to be saved. Choose the file again.',
      context_mismatch:
        'Saved history for this account uses a different time zone than the file. Nothing was saved.',
    },
    cancelled: 'File import cancelled. Nothing was saved.',
    discarded: 'Discarded the file’s rolls. Nothing was saved.',
    period: 'Period in file',
    rolls: 'These rolls from the file',
  },
}

/** What saving a review would do: nothing, while rolls conflict; nothing, as all is
 * saved; add banners (pool IDs) to saved rolls only; or add rolls, and maybe banners. */
export type ReviewState = 'conflicting' | 'nothing' | 'banners' | 'rolls'
export function reviewState({ inserted, conflicts, pool_ids_added }: Counts): ReviewState {
  if (conflicts > 0) return 'conflicting'
  if (inserted > 0) return 'rolls'
  return pool_ids_added > 0 ? 'banners' : 'nothing'
}

/** A review’s heading, its note on banners, its footnote and its Save button’s label. */
export function reviewCopy(counts: Counts) {
  const { inserted, pool_ids_added: added } = counts
  const state = reviewState(counts)
  const one = added === 1
  const rolls = plural(inserted, 'roll')
  const banners =
    state === 'banners'
      ? `These rolls are already saved, but ${added.toLocaleString('en')} of them ${one ? 'lacks its' : 'lack their'} banner, which saving adds.`
      : `${added.toLocaleString('en')} of the skipped rolls also ${one ? 'adds its banner to a saved roll' : 'add their banner to saved rolls'} that lacked it.`
  const copy = {
    conflicting: {
      heading: 'Some rolls conflict with your saved history',
      footnote: 'Nothing can be saved while rolls conflict.',
    },
    nothing: {
      heading: 'Everything here is already saved',
      footnote: 'Nothing new to save. Your saved history already has these rolls.',
    },
    banners: {
      heading: `${noun(added, 'Banner')} to add to ${plural(added, 'saved roll')}`,
      footnote: 'No new rolls. Saving adds banners only; nothing else changes.',
    },
    rolls: {
      heading: `Ready to save ${plural(inserted, 'new roll')}`,
      footnote:
        added > 0
          ? `Saving adds ${rolls} and ${plural(added, 'banner')}. Rolls already saved are never changed otherwise.`
          : `Saving adds ${rolls}. Rolls already saved are never changed.`,
    },
  }[state]
  return {
    state,
    ...copy,
    ...(added > 0 && state !== 'conflicting' && { banners }),
    save: state === 'banners' ? `Save ${noun(added, 'banner')}` : `Save ${rolls}`,
  }
}

/** What a record lacks, by the UIGF field. */
const fields: Record<RollField, string> = {
  id: 'a roll ID',
  gacha_type: 'a category',
  gacha_id: 'a banner',
  item_id: 'an item ID',
  time: 'a time',
  name: 'an item name',
  item_type: 'an item type',
  rank_type: 'a rarity',
}
// "1 record lacks…" or "2 records lack…".
const records = (count: number, one: string, many: string) =>
  `${plural(count, 'record')} ${count === 1 ? one : many}`

/** Why a file’s account can’t be imported. */
export function accountProblem(status: FileAccountProblem) {
  switch (status.kind) {
    case 'repeated':
      return 'The file holds this UID more than once.'
    case 'invalid_timezone':
      return 'Its time zone in the file isn’t a valid UTC offset.'
    case 'no_rolls':
      return 'The file holds no rolls for it.'
    case 'no_server':
      return 'No Star Rail server gives out UIDs like this one.'
    case 'several_servers':
      return 'It is saved on more than one server, so which one is meant can’t be told.'
    case 'timezone_mismatch':
      return 'Its time zone in the file differs from its server’s.'
    case 'records': {
      // In UIGF's order, whatever order the native side sent them in.
      const parts = (Object.keys(fields) as RollField[]).flatMap((field) => {
        const count = status.missing[field]
        return count ? [records(count, `lacks ${fields[field]}`, `lack ${fields[field]}`)] : []
      })
      if (status.invalid > 0)
        parts.push(
          records(
            status.invalid,
            'has a value that can’t be read',
            'have values that can’t be read',
          ),
        )
      if (status.newer_categories > 0)
        parts.push(
          records(
            status.newer_categories,
            'is a collaboration roll, which this file’s UIGF version doesn’t have',
            'are collaboration rolls, which this file’s UIGF version doesn’t have',
          ),
        )
      return `${parts.join('; ')}.`
    }
  }
}

/** Other games’ names, by their UIGF section. */
const otherGames: Record<OtherGame, string> = {
  hk4e: 'Genshin Impact',
  nap: 'Zenless Zone Zero',
  hk4e_ugc: 'Miliastra Wonderland',
}
const gameList = (keys: OtherGame[]) =>
  new Intl.ListFormat('en').format(keys.map((key) => otherGames[key]))

/** What the file held that isn’t listed among its accounts. */
export function leftOut({ malformed_uids, other_games }: FileContents) {
  const notes: string[] = []
  if (malformed_uids === 1)
    notes.push('1 more account has a UID that isn’t a number, so it isn’t listed.')
  else if (malformed_uids > 1)
    notes.push(
      `${malformed_uids.toLocaleString('en')} more accounts have UIDs that aren’t numbers, so they aren’t listed.`,
    )
  if (other_games.length > 0)
    notes.push(
      `The file’s ${gameList(other_games)} history was left out: only Star Rail is read from files.`,
    )
  return notes
}

/** Why a file with no Star Rail accounts to list can’t be imported. */
export function noStarRailHistory({ malformed_uids, other_games }: FileContents) {
  if (malformed_uids > 0)
    return `The file’s ${plural(malformed_uids, 'Star Rail account')} ${
      malformed_uids === 1 ? 'has a UID that isn’t a number' : 'have UIDs that aren’t numbers'
    }. Nothing was saved.`
  if (other_games.length > 0)
    return `The file holds only ${gameList(other_games)} history, which Astral Index can’t import from files yet. Nothing was saved.`
  return 'The file holds no Star Rail history. Nothing was saved.'
}

/** The failure screen’s heading for a file with no Star Rail accounts to list. */
export const noStarRailTitle = 'No Star Rail History in This File'

const gameFiles = 'Couldn’t Find the Game Files'
const unreadable = 'Couldn’t Read That File'
const unreachable = 'Couldn’t Reach HoYoverse'
const unexpectedResponse = 'HoYoverse Sent an Unexpected Response'
const unsaved = 'Nothing Was Saved'
const unfinished = 'Retrieval Didn’t Finish'
/** Headings for the failure screen, by failure kind. */
const titles: Record<Kind, string> = {
  unsupported_host: gameFiles,
  discovery_failed: gameFiles,
  no_game_data: gameFiles,
  no_cache: gameFiles,
  no_request: 'Couldn’t Find a Warp History Link',
  file_too_large: unreadable,
  invalid_file: unreadable,
  expired_key: 'The Warp History Link Has Expired',
  api_error: 'HoYoverse Didn’t Accept the Link',
  rate_limited: 'HoYoverse Is Busy',
  network: unreachable,
  internal: unreachable,
  rejected: unexpectedResponse,
  invalid_response: unexpectedResponse,
  cancelled: 'Retrieval Cancelled',
  no_context: unfinished,
  history_too_large: unfinished,
  mixed_accounts: unfinished,
  missing_server: unfinished,
  storage: unsaved,
  context_mismatch: unsaved,
  conflict: unsaved,
  stale_preview: unsaved,
  no_preview: unsaved,
  invalid_request: 'Something Went Wrong',
  // Only the About dialog opens things, and it says what failed itself.
  open_failed: 'Something Went Wrong',
  // Only the Backup & Restore screen saves backups, and it says what failed itself.
  backup_failed: 'Something Went Wrong',
  backup_in_data_folder: 'Something Went Wrong',
  history_damaged: 'Something Went Wrong',
  // Restore's failures, too, are told on its own screen.
  restore_refused: 'Something Went Wrong',
  restore_is_history: 'Something Went Wrong',
  restore_failed: 'Something Went Wrong',
  restore_changed: 'Something Went Wrong',
  import_under_way: 'Something Went Wrong',
  // The History Unavailable screen explains it; any failure screen still names it.
  history_not_upgraded: 'Your History Couldn’t Be Upgraded',
  not_history_file: unreadable,
  unsupported_file: 'This File’s Format Isn’t Supported',
  unavailable: 'Something Went Wrong',
}

/** The failure screen's heading for a failure. */
export const titleOf = (failure: Failure) => titles[failure.kind]

/** The message for a failure at the step whose messages are given. */
export function describe(failure: Failure, messages: Messages) {
  if (failure.kind === 'api_error') {
    return `HoYoverse didn’t accept your warp history link (error ${failure.code}). Open your warp history in the game, then try again.`
  }
  return messages[failure.kind] ?? unexpected
}

/** Why a backup wasn’t saved. */
export const backupFailure = (failure: Failure) =>
  describe(failure, {
    backup_failed: 'The backup couldn’t be saved there. Choose another folder and try again.',
    backup_in_data_folder:
      'A backup can’t be saved in the folder that holds your history. Choose another folder.',
    history_damaged:
      'Your saved history failed its check, so no backup was made. Nothing was changed.',
    storage: 'Your saved history couldn’t be read, so no backup was made. Nothing was changed.',
    history_not_upgraded:
      'Your history couldn’t be upgraded, so it can’t be backed up. Restore a backup instead.',
  })

/** Why a backup was refused for restoring. */
const refusals: Record<Refusal, string> = {
  too_large: 'This file is too large to be an Astral Index backup.',
  not_database: 'This file isn’t an Astral Index backup.',
  other_app: 'This file is another app’s database, not an Astral Index backup.',
  newer:
    'This backup was made by a newer version of Astral Index. Update the app, then restore it.',
  damaged: 'This backup is damaged and can’t be restored.',
  unreadable: 'The file couldn’t be read. Check that it’s still there and try again.',
}

/** A restore refused while an import runs or awaits the user, choosing or confirming. */
const importUnderWay = 'Finish or discard the import first, then restore the backup.'

/** Why a backup can’t be restored; nothing of the history was changed. */
export const restoreFailure = (failure: Failure) =>
  failure.kind === 'restore_refused'
    ? refusals[failure.refusal!]
    : describe(failure, {
        restore_is_history: 'This is your current history, not a backup.',
        restore_failed: 'The backup couldn’t be checked. Try again.',
        storage:
          'Your current history couldn’t be read to compare with the backup. Nothing was changed.',
        import_under_way: importUnderWay,
      })

/** Why a confirmed restore replaced nothing; the history is as it was. */
export const replaceFailure = (failure: Failure) =>
  describe(failure, {
    restore_changed:
      'Your history changed after the backup was checked, so nothing was replaced. Choose the backup again.',
    restore_failed: 'The backup couldn’t be restored. Your history is unchanged.',
    storage: 'Your current history couldn’t be read, so nothing was replaced.',
    import_under_way: importUnderWay,
  })

/** What a history holds, as far as the summary needs it. */
type Holding = { accounts: readonly { rolls: number }[] }
/** A history's rolls and accounts, as "2,430 rolls in 3 accounts". */
const holding = ({ accounts }: Holding) =>
  `${plural(
    accounts.reduce((sum, account) => sum + account.rolls, 0),
    'roll',
  )} in ${plural(accounts.length, 'account')}`

/** The restore confirmation's summary of what replaces what. */
export const restoreSummary = (current: Holding | null, backup: Holding) =>
  current === null
    ? `Restoring replaces your current history with ${holding(backup)}.`
    : current.accounts.length === 0
      ? `Restoring saves ${holding(backup)}.`
      : `Restoring replaces ${holding(current)} with ${holding(backup)}.`

/** Why saved history couldn’t be shown. */
export const historyFailure = (failure: Failure) =>
  describe(failure, {
    storage: 'We couldn’t read the history saved on this device. Nothing was changed.',
  })

/** A retrieval failure, saying where retrieval stopped unless the user stopped it. */
export function retrievalFailure(failure: Failure) {
  const { kind, location } = failure
  const stopped =
    location && kind !== 'cancelled'
      ? `Retrieval stopped at ${warps[location.gacha_type]}, page ${location.page}. `
      : ''
  return stopped + describe(failure, retrievalMessages)
}

export function progressText(progress: Progress) {
  switch (progress.kind) {
    case 'requesting':
      return `Retrieving ${warps[progress.gacha_type]}, page ${progress.page} · ${plural(progress.records, 'roll')} so far`
    case 'up_to_date':
      return `${warps[progress.gacha_type]} is up to date: it reached rolls already saved.`
    case 'retry_pending':
      return 'HoYoverse didn’t respond, so we’ll try again in a moment…'
  }
}

/** What a save reports: the counts and the account the rolls were added to. */
interface Saved {
  summary: Counts
  uid: string
  server: string
}

/** "214 Rolls Saved", or what only banners added to saved rolls did. */
export const savedTitle = ({ summary }: Saved) =>
  reviewState(summary) === 'banners'
    ? `${noun(summary.pool_ids_added, 'Banner')} Added to ${plural(summary.pool_ids_added, 'Saved Roll')}`
    : `${plural(summary.inserted, 'Roll')} Saved`

/** Which account the rolls were added to; the counts have tiles of their own. */
export const savedDetail = ({ uid, server }: Saved) =>
  `Added to UID ${uid} (${serverName(server)}).`

/** How each source of an import is described. */
const sources: Record<LastImport['source'], string> = {
  hoyoverse: 'Retrieved from HoYoverse',
  uigf: 'Imported from a file',
}

/** The Import screen's "Last import" line, as separate parts: when, how, where, what. */
export const lastImportParts = (last: LastImport, timeZone?: string) => [
  localDateTime(last.imported_at, timeZone),
  sources[last.source],
  `UID ${last.uid} (${serverName(last.server)})`,
  `${plural(last.inserted, 'new roll')} saved`,
]

// A failed opening of the issues page gives its address instead.
const issuesFailure =
  'The issues page couldn’t be opened. Its address is github.com/shra-ja/astral-index/issues.'

/** The History Unavailable screen's failed openings. */
export const unavailableOpeningFailures: Record<Opening, string> = {
  folder: 'The data folder couldn’t be opened.',
  issues: issuesFailure,
}

/** The About dialog's failed openings; the path stays on screen, and the address is given. */
export const openingFailures: Record<Opening, string> = {
  folder: 'The folder couldn’t be opened. Its path is shown above.',
  issues: issuesFailure,
}
