import { beforeEach, expect, test, vi } from 'vitest'
import { lastImport } from '../commands'
import { useLastImport } from './useLastImport'

vi.mock('../commands')
beforeEach(() => {
  vi.resetAllMocks()
})

const last = {
  imported_at: 1790000000,
  source: 'hoyoverse' as const,
  uid: '100000001',
  server: 'synthetic-server',
  inserted: 96,
}

test('nothing is known until read, and each refresh reads again', async () => {
  vi.mocked(lastImport).mockResolvedValue({ last })
  const { last: shown, refresh } = useLastImport()
  expect(shown.value).toBeNull()
  await refresh()
  expect(shown.value).toEqual(last)
  vi.mocked(lastImport).mockResolvedValue({ last: { ...last, inserted: 3 } })
  await refresh()
  expect(shown.value?.inserted).toBe(3)
  expect(lastImport).toHaveBeenCalledTimes(2)
})

test('a failed read leaves the line out rather than showing an old import', async () => {
  vi.mocked(lastImport).mockResolvedValueOnce({ last })
  const { last: shown, refresh } = useLastImport()
  await refresh()
  vi.mocked(lastImport).mockResolvedValueOnce({ failure: { kind: 'storage' } })
  await refresh()
  expect(shown.value).toBeNull()
})
