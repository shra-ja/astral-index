import { beforeEach, expect, test, vi } from 'vitest'
import { historyStatus, watchHistoryUnavailable } from '../commands'
import { useHistoryAvailability } from './useHistoryAvailability'

vi.mock('../commands')
let tell: (copy: string | null) => void = () => undefined
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(watchHistoryUnavailable).mockImplementation((watcher) => {
    tell = watcher
    return () => true
  })
  vi.mocked(historyStatus).mockResolvedValue(undefined)
})

test('the history is usable until a command finds it couldn’t be upgraded', async () => {
  const availability = useHistoryAvailability()
  expect(availability.unavailable.value).toBeNull()
  await availability.check()
  expect(historyStatus).toHaveBeenCalledTimes(1)
  // The status, or any later command, reports it through the watcher.
  tell('history-v2-20261021-143000.sqlite')
  expect(availability.unavailable.value).toEqual({ copy: 'history-v2-20261021-143000.sqlite' })
  tell(null)
  expect(availability.unavailable.value).toEqual({ copy: null })
  // A restore that replaced it makes it usable again, and hands how it went to the
  // screen shown next, once.
  availability.restored()
  expect(availability.unavailable.value).toBeNull()
  const outcome = { kind: 'restored' as const, name: 'backup.sqlite', safetyCopy: null }
  availability.handOver(outcome)
  expect(availability.takeRestored()).toEqual(outcome)
  expect(availability.takeRestored()).toBeNull()
})
