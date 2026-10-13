// The About dialog's details, its two openings and the third-party notices. Reading
// the details and notices stays on this device; opening hands the folder or the
// issues page to the system.
import { readonly, shallowRef } from 'vue'
import { appInfo, openIssuesPage, revealDataFolder, type AppInfo } from '../commands'
import { loadNotices, type Notices } from '../notices'

/** What the About dialog can open. */
export type Opening = 'folder' | 'issues'

export function useAbout(readNotices = loadNotices) {
  const info = shallowRef<AppInfo | null>(null)
  // The opening that failed last, until another is tried or the dialog closes.
  const failed = shallowRef<Opening | null>(null)

  async function load() {
    const result = await appInfo()
    info.value = 'failure' in result ? null : result.info
  }

  // The notices are read once, when first shown; a build may have generated none.
  const notices = shallowRef<Notices | null>(null)
  const noticesMissing = shallowRef(false)
  async function showNotices() {
    if (notices.value || noticesMissing.value) return
    notices.value = await readNotices()
    noticesMissing.value = notices.value === null
  }

  async function open(opening: Opening) {
    failed.value = null
    const failure = await (opening === 'folder' ? revealDataFolder() : openIssuesPage())
    failed.value = failure ? opening : null
  }

  return {
    info: readonly(info),
    failed: readonly(failed),
    notices: readonly(notices),
    noticesMissing: readonly(noticesMissing),
    load,
    showNotices,
    revealFolder: () => open('folder'),
    openIssues: () => open('issues'),
    reset: () => {
      failed.value = null
    },
  }
}
