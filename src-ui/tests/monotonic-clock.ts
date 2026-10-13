// A wall clock that never runs backwards, for the frontend tests (see `setup.ts`).

/** Reads `read`, never returning less than its largest earlier reading. */
export function monotonic(read: () => number): () => number {
  let latest = -Infinity
  return () => (latest = Math.max(latest, read()))
}
