// Restoring a backup: the native side asks which file, copies it into the data
// folder and checks it there, then holds it while the confirmation compares it with
// the current history (decision 0031). Nothing of the history changes, and nothing
// is fetched. The Backup & Restore screen owns it: leaving the screen ends the restore.
import { getCurrentScope, onScopeDispose, readonly, shallowRef } from 'vue'
import { cancelRestore, chooseRestore, type CheckedBackup } from '../commands'
import { restoreFailure } from '../messages'

export function useRestore() {
  // While a backup is being chosen and checked.
  const checking = shallowRef(false)
  // The checked backup the confirmation shows, while it is held.
  const checked = shallowRef<CheckedBackup | null>(null)
  // Why the last backup was refused.
  const message = shallowRef<string | null>(null)
  let closed = false
  if (getCurrentScope()) onScopeDispose(() => (closed = true))

  async function choose() {
    if (checking.value) return
    checking.value = true
    message.value = null
    const result = await chooseRestore()
    checking.value = false
    if ('checked' in result) {
      // A backup checked after its screen has closed has no confirmation to show.
      if (closed) await cancelRestore()
      else checked.value = result.checked
    } else if ('failure' in result) {
      message.value = restoreFailure(result.failure)
    }
  }

  /** Close the confirmation. The native side drops its copy; if it can't be told,
   * the next choice or the next start removes the copy anyway. */
  async function cancel() {
    checked.value = null
    await cancelRestore()
  }

  return {
    checking: readonly(checking),
    checked: readonly(checked),
    message: readonly(message),
    choose,
    cancel,
  }
}
