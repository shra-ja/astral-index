// Restoring a backup: the native side asks which file, copies it into the data
// folder and checks it there, then holds it while the confirmation compares it with
// the current history (decision 0031). Confirming replaces the history, keeping it
// as a safety copy first, which the native side names from the local time; nothing
// is fetched. The Backup & Restore screen owns it: leaving the
// screen ends the restore.
import { getCurrentScope, onScopeDispose, readonly, shallowRef } from 'vue'
import { cancelRestore, chooseRestore, confirmRestore, type CheckedBackup } from '../commands'
import { replaceFailure, restoreFailure } from '../messages'
import { forgetAccountChoices } from './useHistory'

/** How the last choice or restore ended, for the Restore card's status line. */
export type RestoreOutcome =
  | { kind: 'restored'; name: string; safetyCopy: string | null }
  | { kind: 'failed'; message: string }

/** A restore that replaced the history. */
export type Restored = Extract<RestoreOutcome, { kind: 'restored' }>

export interface RestoreOptions {
  /** How a restore made elsewhere went, for the Restore card to show. */
  initial?: RestoreOutcome | null
  /** Told of every restore that replaced the history. */
  onRestored?: (restored: Restored) => void
}

export function useRestore({ initial = null, onRestored }: RestoreOptions = {}) {
  // While a backup is being chosen and checked.
  const checking = shallowRef(false)
  // The checked backup the confirmation shows, while it is held.
  const checked = shallowRef<CheckedBackup | null>(null)
  // While the held backup replaces the history.
  const restoring = shallowRef(false)
  const outcome = shallowRef<RestoreOutcome | null>(initial)
  let closed = false
  if (getCurrentScope()) onScopeDispose(() => (closed = true))

  async function choose() {
    if (checking.value) return
    checking.value = true
    outcome.value = null
    const result = await chooseRestore()
    checking.value = false
    if ('checked' in result) {
      // A backup checked after its screen has closed has no confirmation to show.
      if (closed) await cancelRestore()
      else checked.value = result.checked
    } else if ('failure' in result) {
      outcome.value = { kind: 'failed', message: restoreFailure(result.failure) }
    }
  }

  /** Close the confirmation. The native side drops its copy; if it can't be told,
   * the next choice or the next start removes the copy anyway. */
  async function cancel() {
    checked.value = null
    await cancelRestore()
  }

  /** Replace the history with the held backup. The native side uses up its copy
   * whatever the outcome, so the confirmation closes either way. */
  async function confirm() {
    const held = checked.value
    if (!held || restoring.value) return
    restoring.value = true
    const result = await confirmRestore()
    restoring.value = false
    checked.value = null
    if ('failure' in result) {
      outcome.value = { kind: 'failed', message: replaceFailure(result.failure) }
    } else {
      const restored: Restored = {
        kind: 'restored',
        name: held.name,
        safetyCopy: result.safetyCopy,
      }
      outcome.value = restored
      // The restored history may lack the accounts chosen in the switchers.
      forgetAccountChoices()
      onRestored?.(restored)
    }
  }

  return {
    checking: readonly(checking),
    checked: readonly(checked),
    restoring: readonly(restoring),
    outcome: readonly(outcome),
    choose,
    cancel,
    confirm,
  }
}
