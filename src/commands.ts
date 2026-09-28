// Typed client for the native extraction commands. Results carry categories only:
// request contexts, paths and native detail never reach the webview.
import { invoke } from '@tauri-apps/api/core';

/** Matches the native extractor's `MAX_CACHE_BYTES`. */
export const MAX_CACHE_BYTES = 16 * 1024 * 1024;

const nativeKinds = [
  'unsupported_host', 'discovery_failed', 'no_game_data', 'no_cache', 'no_request', 'file_too_large', 'invalid_file',
  'expired_key', 'api_error', 'rate_limited', 'network', 'rejected', 'invalid_response', 'internal', 'cancelled',
] as const;

/** A native failure kind, or `unavailable` for anything unexpected. */
export type Kind = typeof nativeKinds[number] | 'unavailable';
/** Only `api_error` carries a code: the first nonzero code HoYoverse returned. */
export interface Failure { kind: Kind; code?: number }

// Accept only the native shape; only API errors carry a code, and it must be an integer.
function parse(error: unknown): Failure {
  const { kind, code } = (typeof error === 'object' && error !== null ? error : {}) as Record<string, unknown>;
  const known = nativeKinds.find(candidate => candidate === kind);
  if (!known || (known === 'api_error') !== Number.isSafeInteger(code)) return { kind: 'unavailable' };
  return known === 'api_error' ? { kind: known, code: code as number } : { kind: known };
}

async function run(call: () => Promise<unknown>): Promise<Failure | undefined> {
  try {
    await call();
    return undefined;
  } catch (error) {
    return parse(error);
  }
}

/** Find the saved request on this device, then validate it with HoYoverse. */
export function extractAutomatically(): Promise<Failure | undefined> {
  return run(() => invoke('extract_automatically'));
}

/** Stop the running extraction or acquisition; the native side keeps no context. */
export function cancelAcquisition(): Promise<Failure | undefined> {
  return run(() => invoke('cancel_acquisition'));
}

/** Check the size before reading, then send the bytes as a raw body for validation. */
export async function extractFromFile(file: File): Promise<Failure | undefined> {
  if (file.size > MAX_CACHE_BYTES) return { kind: 'file_too_large' };
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return { kind: 'invalid_file' };
  }
  return run(() => invoke('extract_from_file', new Uint8Array(bytes)));
}
