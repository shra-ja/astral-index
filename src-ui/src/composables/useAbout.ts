// The About dialog's details, its two openings and the third-party notices. The
// details and the folder come from `useDataFolder`; reading them and the notices
// stays on this device, and opening hands the folder or the issues page to the
// system.
import { readonly, shallowRef } from 'vue'
import { openIssuesPage } from '../commands'
import { loadNotices, type Notices } from '../notices'
import { useDataFolder } from './useDataFolder'

/** What the About dialog can open. */
export type Opening = 'folder' | 'issues'

export function useAbout(readNotices = loadNotices) {
  const data = useDataFolder()
  // The opening that failed last, until another is tried or the dialog closes.
  const failed = shallowRef<Opening | null>(null)

  // The notices are read once, when first shown; a build may have generated none.
  const notices = shallowRef<Notices | null>(null)
  const noticesMissing = shallowRef(false)
  async function showNotices() {
    if (notices.value || noticesMissing.value) return
    notices.value = await readNotices()
    noticesMissing.value = notices.value === null
  }

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
    info: data.info,
    read: data.read,
    failed: readonly(failed),
    notices: readonly(notices),
    noticesMissing: readonly(noticesMissing),
    load: data.load,
    showNotices,
    revealFolder,
    openIssues,
    reset: () => {
      failed.value = null
    },
  }
}
