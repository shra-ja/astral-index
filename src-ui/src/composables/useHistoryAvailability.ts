// Whether the saved history can be used. A history from an older release that
// couldn't be upgraded can't be shown or added to until a restore replaces it, and
// meanwhile the app shows the History Unavailable screen in place of the game
// screens (feature 0037). The shell owns it, for the router and that screen.
import { getCurrentScope, onScopeDispose, readonly, shallowRef, type InjectionKey } from 'vue'
import { historyStatus, watchHistoryUnavailable } from '../commands'
import type { Restored } from './useRestore'

/** A history that couldn't be upgraded: the copy kept first, or null if none could be. */
export interface Unavailable {
  copy: string | null
}

export function useHistoryAvailability() {
  const unavailable = shallowRef<Unavailable | null>(null)
  // How a restore from the History Unavailable screen went, for Backup & Restore to
  // show once.
  let handed: Restored | null = null
  // The status at startup, and any later command, report it the same way.
  const stop = watchHistoryUnavailable((copy) => (unavailable.value = { copy }))
  if (getCurrentScope()) onScopeDispose(stop)
  return {
    unavailable: readonly(unavailable),
    /** Ask once, at startup, before a game screen shows. */
    check: async () => {
      await historyStatus()
    },
    /** A restore replaced the history, so it can be used again. */
    restored: () => {
      unavailable.value = null
    },
    /** Pass how a restore went to Backup & Restore, shown next. */
    handOver: (outcome: Restored) => {
      handed = outcome
    },
    /** How that restore went, once. */
    takeRestored: () => {
      const outcome = handed
      handed = null
      return outcome
    },
  }
}

export type HistoryAvailability = ReturnType<typeof useHistoryAvailability>
export const availabilityKey: InjectionKey<HistoryAvailability> = Symbol('history availability')
