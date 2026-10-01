// What the retrieval flow tells the user about failures, progress and saving.
import type { Counts, Failure, Kind, Progress } from './commands'
import { plural, warps } from './format'

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
export const fileMessages: Messages = {
  ...validationMessages,
  no_request:
    'That file doesn’t contain a warp history request. Check it’s the game’s data_2 file, and open your warp history in the game first.',
  file_too_large: 'That file is larger than 16 MiB, so it isn’t a supported cache file.',
  invalid_file: 'That file couldn’t be read. Try choosing it again.',
}

/** The message for a failure at the step whose messages are given. */
export function describe(failure: Failure, messages: Messages) {
  if (failure.kind === 'api_error') {
    return `HoYoverse didn’t accept your warp history link (error ${failure.code}). Open your warp history in the game, then try again.`
  }
  return messages[failure.kind] ?? unexpected
}

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
  return progress.kind === 'requesting'
    ? `Retrieving ${warps[progress.gacha_type]}, page ${progress.page} · ${plural(progress.records, 'roll')} so far`
    : 'HoYoverse didn’t respond, so we’ll try again in a moment…'
}

export function savedText({ inserted, duplicates }: Counts) {
  const already =
    duplicates === 0
      ? ''
      : ` ${duplicates.toLocaleString('en')} ${duplicates === 1 ? 'was' : 'were'} already saved.`
  return `Saved ${plural(inserted, 'new roll')} to this device.${already}`
}
