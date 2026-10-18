// The restore flow is shared through the app, so a checked backup and its
// confirmation survive switching screens. The shell provides it; the Backup &
// Restore screen uses it.
import type { InjectionKey } from 'vue'
import type { useRestore } from './useRestore'

export const restoreKey: InjectionKey<ReturnType<typeof useRestore>> = Symbol('restore')
