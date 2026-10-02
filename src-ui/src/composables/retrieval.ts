// The retrieval flow is shared through the app, so a running retrieval and its
// review survive switching screens. The shell provides it; the Import screen uses it.
import type { InjectionKey } from 'vue'
import type { useRetrieval } from './useRetrieval'

export const retrievalKey: InjectionKey<ReturnType<typeof useRetrieval>> = Symbol('retrieval')
