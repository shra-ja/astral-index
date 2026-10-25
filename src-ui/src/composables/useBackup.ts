// Saving a backup: the native side suggests a name, asks where, writes and checks
// the file, and returns its name; nothing is fetched.
import { readonly, shallowRef } from 'vue'
import { saveBackup } from '../commands'
import { backupFailure } from '../messages'

/** Where saving a backup stands. */
export type BackupState = 'idle' | 'saving' | 'saved' | 'failed'

export function useBackup() {
  const state = shallowRef<BackupState>('idle')
  // The saved file's name, or why the last backup failed.
  const name = shallowRef<string | null>(null)
  const message = shallowRef<string | null>(null)

  async function save() {
    if (state.value === 'saving') return
    state.value = 'saving'
    name.value = null
    message.value = null
    const result = await saveBackup()
    if ('saved' in result) {
      name.value = result.saved
      state.value = 'saved'
    } else if ('cancelled' in result) {
      state.value = 'idle'
    } else {
      message.value = backupFailure(result.failure)
      state.value = 'failed'
    }
  }

  return { state: readonly(state), name: readonly(name), message: readonly(message), save }
}
