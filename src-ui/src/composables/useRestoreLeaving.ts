// Leaving a screen while a restore is held or running (decision 0031): leaving while
// a backup is held asks first, and leaving cancels the restore; a restore under way is
// quick and can't be stopped, so leaving waits for it. The screen shows the question
// while `asking` is set, and passes the user's answer back.
import { readonly, shallowRef } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import type { useRestore } from './useRestore'

export function useRestoreLeaving(restore: ReturnType<typeof useRestore>) {
  const asking = shallowRef<((leave: boolean) => void) | null>(null)
  onBeforeRouteLeave(() => {
    if (restore.restoring.value) return false
    return restore.checked.value
      ? new Promise<boolean>((resolve) => (asking.value = resolve))
      : true
  })
  async function answer(leave: boolean) {
    const resolve = asking.value!
    asking.value = null
    if (leave) await restore.cancel()
    resolve(leave)
  }
  return { asking: readonly(asking), answer }
}
