// The third-party notices, which every build generates and nothing commits
// (decision 0025). They are loaded only when the About dialog shows them, so they stay
// out of the startup bundle; development, which does not build, may have none.

/** A component the app ships, with the licences it is under. */
export interface NoticeComponent {
  name: string
  version: string
  kind: 'crate' | 'npm' | 'font'
  /** Where its published source is. */
  source: string
  /** Each licence that applies, with the index of its text. */
  licences: { id: string; text: number }[]
}
/** Every licence text once, and the components that use them. */
export interface Notices {
  texts: string[]
  components: NoticeComponent[]
}

// A lookup, not an import, so a missing file leaves it empty rather than failing.
const generated = import.meta.glob<Notices>('./assets/third-party-notices.json', {
  import: 'default',
})

/** The notices from the files found, or none when the build generated none. */
export async function noticesFrom(
  files: Record<string, () => Promise<Notices>>,
): Promise<Notices | null> {
  const load = Object.values(files)[0]
  return load ? load() : null
}

/** The notices this build generated, if any. */
export const loadNotices = () => noticesFrom(generated)
