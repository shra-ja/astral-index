import { beforeEach, expect, test, vi } from 'vitest'
import { appInfo, revealDataFolder } from '../commands'
import { useDataFolder } from './useDataFolder'

vi.mock('../commands')
beforeEach(() => {
  vi.resetAllMocks()
})

const info = {
  version: '1.2.0',
  build: { kind: 'release' as const },
  folder: '/local/astral-index',
  file: '/local/astral-index/history.sqlite',
  portable: false,
}

test('the details are pending until read, then read or failed', async () => {
  vi.mocked(appInfo).mockResolvedValue({ info })
  const data = useDataFolder()
  expect([data.info.value, data.read.value]).toEqual([null, 'pending'])
  await data.load()
  expect([data.info.value, data.read.value]).toEqual([info, 'read'])
  // A failed read shows no details rather than stale ones, and says it failed.
  vi.mocked(appInfo).mockResolvedValue({ failure: { kind: 'unavailable' } })
  await data.load()
  expect([data.info.value, data.read.value]).toEqual([null, 'failed'])
})

test('a failed opening is remembered until the next attempt', async () => {
  vi.mocked(revealDataFolder).mockResolvedValue({ kind: 'open_failed' })
  const data = useDataFolder()
  await data.reveal()
  expect(data.revealFailed.value).toBe(true)
  vi.mocked(revealDataFolder).mockResolvedValue(undefined)
  await data.reveal()
  expect(data.revealFailed.value).toBe(false)
  expect(revealDataFolder).toHaveBeenCalledTimes(2)
})
