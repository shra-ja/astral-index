import { beforeEach, expect, test, vi } from 'vitest'
import { saveBackup } from '../commands'
import { useBackup } from './useBackup'

vi.mock('../commands')
beforeEach(() => {
  vi.resetAllMocks()
})

const NAME = 'Astral-Index-backup-2026-10-16.sqlite'

test('saving asks the native side, then names the saved file', async () => {
  let finish!: (value: { saved: string }) => void
  vi.mocked(saveBackup).mockReturnValue(new Promise((resolve) => (finish = resolve)))
  const backup = useBackup()
  expect(backup.state.value).toBe('idle')
  const saving = backup.save()
  expect(backup.state.value).toBe('saving')
  // A second press while saving asks nothing more.
  void backup.save()
  expect(saveBackup).toHaveBeenCalledTimes(1)
  expect(saveBackup).toHaveBeenCalledWith()
  finish({ saved: NAME })
  await saving
  expect(backup.state.value).toBe('saved')
  expect(backup.name.value).toBe(NAME)
  expect(backup.message.value).toBeNull()
})

test('cancelling the dialog leaves nothing to report', async () => {
  vi.mocked(saveBackup).mockResolvedValue({ saved: NAME })
  const backup = useBackup()
  await backup.save()
  vi.mocked(saveBackup).mockResolvedValue({ cancelled: true })
  await backup.save()
  expect(backup.state.value).toBe('idle')
  expect(backup.name.value).toBeNull()
})

test('a failed backup says why, until the next attempt', async () => {
  vi.mocked(saveBackup).mockResolvedValue({ failure: { kind: 'backup_failed' } })
  const backup = useBackup()
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
