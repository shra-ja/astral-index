// Typed client for the native extraction commands. Results carry categories only:
// request contexts, paths and native detail never reach the webview.
import { invoke } from '@tauri-apps/api/core';

/** Matches the native extractor's `MAX_CACHE_BYTES`. */
export const MAX_CACHE_BYTES = 16 * 1024 * 1024;

const nativeFailures = [
  'unsupported_host', 'discovery_failed', 'no_game_data', 'no_cache', 'no_request', 'file_too_large', 'invalid_file',
] as const;

/** A native failure category, or `unavailable` for anything unexpected. */
export type Failure = typeof nativeFailures[number] | 'unavailable';

async function run(call: () => Promise<unknown>): Promise<Failure | undefined> {
  try {
    await call();
    return undefined;
  } catch (error) {
    return nativeFailures.find(failure => failure === error) ?? 'unavailable';
  }
}

export function extractAutomatically(): Promise<Failure | undefined> {
  return run(() => invoke('extract_automatically'));
}

/** Check the size before reading, then send the bytes as a raw body. */
export async function extractFromFile(file: File): Promise<Failure | undefined> {
  if (file.size > MAX_CACHE_BYTES) return 'file_too_large';
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return 'invalid_file';
  }
  return run(() => invoke('extract_from_file', new Uint8Array(bytes)));
}
