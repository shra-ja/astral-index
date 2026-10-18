// Restoring a backup: the native side asks which file, copies it into the data
// folder and checks it there, then holds it while the confirmation compares it with
// the current history (decision 0031). Nothing of the history changes, and nothing
// is fetched.
import { readonly, shallowRef } from 'vue'
import { cancelRestore, chooseRestore, type CheckedBackup } from '../commands'
import { restoreFailure } from '../messages'

/** Where restoring stands: choosing and checking a backup, or confirming one. */
export type RestoreState = 'idle' | 'checking' | 'confirming'

export function useRestore() {
  const state = shallowRef<RestoreState>('idle')
  // The checked backup the confirmation shows, or why the last one was refused.
  const checked = shallowRef<CheckedBackup | null>(null)
  const message = shallowRef<string | null>(null)

  async function choose() {
    if (state.value === 'checking') return
    state.value = 'checking'
    message.value = null
    const result = await chooseRestore()
    if ('checked' in result) {
      checked.value = result.checked
      state.value = 'confirming'
    } else {
      if ('failure' in result) message.value = restoreFailure(result.failure)
      state.value = 'idle'
    }
  }

  /** Close the confirmation. The native side drops its copy; if it can't be told,
   * the next choice replaces the copy anyway. */
  async function cancel() {
    checked.value = null
    state.value = 'idle'
    await cancelRestore()
  }

  return {
    state: readonly(state),
    checked: readonly(checked),
    message: readonly(message),
    choose,
    cancel,
  }
}
