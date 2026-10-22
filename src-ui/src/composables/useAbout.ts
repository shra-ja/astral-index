// The About dialog's details, its two openings and the third-party notices. The
// details and the folder come from `useDataFolder`; reading them and the notices
// stays on this device, and `useOpenings` hands the folder or the issues page to the
// system.
import { readonly, shallowRef } from 'vue'
import { loadNotices, type Notices } from '../notices'
import { useDataFolder } from './useDataFolder'
import { useOpenings } from './useOpenings'

export function useAbout(readNotices = loadNotices) {
  const data = useDataFolder()
  // The opening that failed last is reset when the dialog closes.
  const openings = useOpenings(data)

  // The notices are read once, when first shown; a build may have generated none.
  const notices = shallowRef<Notices | null>(null)
  const noticesMissing = shallowRef(false)
  async function showNotices() {
    if (notices.value || noticesMissing.value) return
    notices.value = await readNotices()
    noticesMissing.value = notices.value === null
  }

  return {
    info: data.info,
    read: data.read,
    failed: openings.failed,
    notices: readonly(notices),
    noticesMissing: readonly(noticesMissing),
    load: data.load,
    showNotices,
    revealFolder: openings.revealFolder,
    openIssues: openings.openIssues,
    reset: openings.reset,
  }
}
