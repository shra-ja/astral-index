// Where history is stored: the app's details, read on this device, and opening the
// folder, which hands it to the system. Both the About dialog and the Backup &
// Restore screen show it.
import { readonly, shallowRef } from 'vue'
import { appInfo, revealDataFolder, type AppInfo } from '../commands'

/** Whether the app's details have been read, so a screen can tell waiting from failing. */
export type Read = 'pending' | 'read' | 'failed'

export function useDataFolder() {
  const info = shallowRef<AppInfo | null>(null)
  const read = shallowRef<Read>('pending')
  // Whether the last attempt to open the folder failed.
  const revealFailed = shallowRef(false)

  async function load() {
    const result = await appInfo()
    info.value = 'failure' in result ? null : result.info
    read.value = 'failure' in result ? 'failed' : 'read'
  }

  async function reveal() {
    revealFailed.value = false
    revealFailed.value = (await revealDataFolder()) !== undefined
  }

  return {
    info: readonly(info),
    read: readonly(read),
    revealFailed: readonly(revealFailed),
    load,
    reveal,
  }
}
