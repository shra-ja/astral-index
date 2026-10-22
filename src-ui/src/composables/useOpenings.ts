// Opening the data folder or the issues page, which hands it to the system; the
// About dialog and the History Unavailable screen offer both. The folder comes from
// `useDataFolder`, which the caller may share.
import { readonly, shallowRef } from 'vue'
import { openIssuesPage } from '../commands'
import { useDataFolder } from './useDataFolder'

/** What can be opened. */
export type Opening = 'folder' | 'issues'

export function useOpenings(data = useDataFolder()) {
  // The opening that failed last, until another is tried or it is reset.
  const failed = shallowRef<Opening | null>(null)

  async function revealFolder() {
    failed.value = null
    await data.reveal()
    failed.value = data.revealFailed.value ? 'folder' : null
  }
  async function openIssues() {
    failed.value = null
    failed.value = (await openIssuesPage()) ? 'issues' : null
  }

  return {
    failed: readonly(failed),
    revealFolder,
    openIssues,
    reset: () => {
      failed.value = null
    },
  }
}
