// The newest import's summary for the Import screen's "Last import" line. It reads
// this device only. A failed read leaves the line out: the History screen is where
// storage failures are reported.
import { readonly, shallowRef } from 'vue'
import { lastImport, type LastImport } from '../commands'

export function useLastImport() {
  const last = shallowRef<LastImport | null>(null)

  async function refresh() {
    const result = await lastImport()
    last.value = 'failure' in result ? null : result.last
  }

  return { last: readonly(last), refresh }
}
