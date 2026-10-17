import { beforeEach, expect, test, vi } from 'vitest'
import { saveBackup } from '../commands'
import { useBackup } from './useBackup'

vi.mock('../commands')
beforeEach(() => {
  vi.resetAllMocks()
})

const today = () => new Date(2026, 9, 16, 21, 30)
const NAME = 'Astral-Index-backup-2026-10-16.sqlite'

test('saving sends today’s local date, then names the saved file', async () => {
  let finish!: (value: { saved: string }) => void
  vi.mocked(saveBackup).mockReturnValue(new Promise((resolve) => (finish = resolve)))
  const backup = useBackup(today)
  expect(backup.state.value).toBe('idle')
  const saving = backup.save()
  expect(backup.state.value).toBe('saving')
  // A second press while saving asks nothing more.
  void backup.save()
  expect(saveBackup).toHaveBeenCalledTimes(1)
  expect(saveBackup).toHaveBeenCalledWith('2026-10-16')
  finish({ saved: NAME })
  await saving
  expect(backup.state.value).toBe('saved')
  expect(backup.name.value).toBe(NAME)
  expect(backup.message.value).toBeNull()
})

test('cancelling the dialog leaves nothing to report', async () => {
  vi.mocked(saveBackup).mockResolvedValue({ saved: NAME })
  const backup = useBackup(today)
  await backup.save()
  vi.mocked(saveBackup).mockResolvedValue({ cancelled: true })
  await backup.save()
  expect(backup.state.value).toBe('idle')
  expect(backup.name.value).toBeNull()
})

test('a failed backup says why, until the next attempt', async () => {
  vi.mocked(saveBackup).mockResolvedValue({ failure: { kind: 'backup_failed' } })
  const backup = useBackup(today)
  await backup.save()
  expect(backup.state.value).toBe('failed')
  expect(backup.message.value).toBe(
    'The backup couldn’t be saved there. Choose another folder and try again.',
  )
  vi.mocked(saveBackup).mockResolvedValue({ saved: NAME })
  await backup.save()
  expect(backup.message.value).toBeNull()
  expect(backup.state.value).toBe('saved')
})

test('the date defaults to the device’s clock', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 1, 3, 9, 0))
  vi.mocked(saveBackup).mockResolvedValue({ cancelled: true })
  await useBackup().save()
  expect(saveBackup).toHaveBeenCalledWith('2026-02-03')
  vi.useRealTimers()
})
