// The import flow is shared through the app, so a running retrieval, a history file's
// accounts and a review survive switching screens. The shell provides it; the Import
// screen uses it.
import type { InjectionKey } from 'vue'
import type { useImport } from './useImport'

export const importFlowKey: InjectionKey<ReturnType<typeof useImport>> = Symbol('import flow')
