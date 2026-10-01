// Typed client for the native extraction commands. Results carry categories only:
// request contexts, paths and native detail never reach the webview.
import { Channel, invoke } from '@tauri-apps/api/core'

/** Matches the native extractor's `MAX_CACHE_BYTES`. */
export const MAX_CACHE_BYTES = 16 * 1024 * 1024

const nativeKinds = [
  'unsupported_host',
  'discovery_failed',
  'no_game_data',
  'no_cache',
  'no_request',
  'file_too_large',
  'invalid_file',
  'expired_key',
  'api_error',
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
] as const
/** The `gacha_type` codes of the six known categories. */
const categories = ['1', '2', '11', '12', '21', '22']

/** A native failure kind, or `unavailable` for anything unexpected. */
export type Kind = (typeof nativeKinds)[number] | 'unavailable'
/** The category and page being requested when retrieval failed. */
export interface Location {
  gacha_type: string
  page: number
}
/** Only `api_error` carries a code: the first nonzero code HoYoverse returned. */
export interface Failure {
  kind: Kind
  code?: number
  location?: Location
}

/** Counts of new, already stored and conflicting rolls. */
export interface Counts {
  inserted: number
  duplicates: number
  conflicts: number
}
/** What committing the retrieved history would change, from the native review. */
export interface Review {
  uid: string
  server: string
  timezone: number | null
  summary: Counts
  categories: (Counts & { gacha_type: string })[]
  earliest: string
  latest: string
  conflicts: { id: string; gacha_type: string; time: string }[]
}
export type Retrieved = ({ kind: 'review' } & Review) | { kind: 'no_history' }
/** Retrieval progress: the page about to be requested, with totals so far, or a pending retry. */
export type Progress =
  | { kind: 'requesting'; gacha_type: string; page: number; pages: number; records: number }
  | { kind: 'retry_pending'; delay_ms: number }

// Accept only the native shape; only API errors carry a code, and it must be an integer.
// A location is kept only when both its category and page are valid.
function parse(error: unknown): Failure {
  const { kind, code, gacha_type, page } = (
    typeof error === 'object' && error !== null ? error : {}
  ) as Record<string, unknown>
  const known = nativeKinds.find((candidate) => candidate === kind)
  if (!known || (known === 'api_error') !== Number.isSafeInteger(code))
    return { kind: 'unavailable' }
  const failure: Failure =
    known === 'api_error' ? { kind: known, code: code as number } : { kind: known }
  if (
    typeof gacha_type === 'string' &&
    categories.includes(gacha_type) &&
    Number.isSafeInteger(page) &&
    (page as number) > 0
  ) {
    failure.location = { gacha_type, page: page as number }
  }
  return failure
}

async function run(call: () => Promise<unknown>): Promise<Failure | undefined> {
  try {
    await call()
    return undefined
  } catch (error) {
    return parse(error)
  }
}

/** Find the saved request on this device, then validate it with HoYoverse. */
export function extractAutomatically(): Promise<Failure | undefined> {
  return run(() => invoke('extract_automatically'))
}

/** Stop the running extraction or acquisition; the native side keeps no context. */
export function cancelAcquisition(): Promise<Failure | undefined> {
  return run(() => invoke('cancel_acquisition'))
}

/** Retrieve history from the validated context, reporting progress as it goes. */
export async function retrieveHistory(
  onProgress: (progress: Progress) => void,
): Promise<{ retrieved: Retrieved } | { failure: Failure }> {
  try {
    return {
      retrieved: await invoke<Retrieved>('retrieve_history', {
        onProgress: new Channel(onProgress),
      }),
    }
  } catch (error) {
    return { failure: parse(error) }
  }
}

/** Write the retrieved history to this device; the native side keeps no preview afterwards. */
export async function commitImport(): Promise<{ summary: Counts } | { failure: Failure }> {
  try {
    return { summary: await invoke<Counts>('commit_import') }
  } catch (error) {
    return { failure: parse(error) }
  }
}

/** Drop the retrieved history without writing anything. */
export function discardImport(): Promise<Failure | undefined> {
  return run(() => invoke('discard_import'))
}

/** Check the size before reading, then send the bytes as a raw body for validation. */
export async function extractFromFile(file: File): Promise<Failure | undefined> {
  if (file.size > MAX_CACHE_BYTES) return { kind: 'file_too_large' }
  let bytes: ArrayBuffer
  try {
    bytes = await file.arrayBuffer()
  } catch {
    return { kind: 'invalid_file' }
  }
  return run(() => invoke('extract_from_file', new Uint8Array(bytes)))
}
