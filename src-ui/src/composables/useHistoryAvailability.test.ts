import { effectScope } from 'vue'
import { beforeEach, expect, test, vi } from 'vitest'
import { historyStatus, watchHistoryUnavailable } from '../commands'
import { useHistoryAvailability } from './useHistoryAvailability'

vi.mock('../commands')
let tell: (copy: string | null) => void = () => undefined
const stop = vi.fn()
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(watchHistoryUnavailable).mockImplementation((watcher) => {
    tell = watcher
    return stop
  })
  vi.mocked(historyStatus).mockResolvedValue(undefined)
})

test('the history is usable until a command finds it couldn’t be upgraded', async () => {
  const scope = effectScope()
  const availability = scope.run(() => useHistoryAvailability())!
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
  // The shell's end stops the watching.
  scope.stop()
  expect(stop).toHaveBeenCalledTimes(1)
})

test('outside a scope it keeps watching, with nothing to stop it', () => {
  const availability = useHistoryAvailability()
  tell(null)
  expect(availability.unavailable.value).toEqual({ copy: null })
  expect(stop).not.toHaveBeenCalled()
})
