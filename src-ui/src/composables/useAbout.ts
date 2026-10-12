// The About dialog's details and its two openings. Reading the details stays on this
// device; opening hands the folder or the issues page to the system.
import { readonly, shallowRef } from 'vue'
import { appInfo, openIssuesPage, revealDataFolder, type AppInfo } from '../commands'

/** What the About dialog can open. */
export type Opening = 'folder' | 'issues'

export function useAbout() {
  const info = shallowRef<AppInfo | null>(null)
  // The opening that failed last, until another is tried or the dialog closes.
  const failed = shallowRef<Opening | null>(null)

  async function load() {
    const result = await appInfo()
    info.value = 'failure' in result ? null : result.info
  }

  async function open(opening: Opening) {
    failed.value = null
    const failure = await (opening === 'folder' ? revealDataFolder() : openIssuesPage())
    failed.value = failure ? opening : null
  }

  return {
    info: readonly(info),
    failed: readonly(failed),
    load,
    revealFolder: () => open('folder'),
    openIssues: () => open('issues'),
    reset: () => {
      failed.value = null
    },
  }
}
