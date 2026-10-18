import { beforeEach, expect, test, vi } from 'vitest'
import { cancelRestore, chooseRestore, type CheckedBackup } from '../commands'
import { useRestore } from './useRestore'

vi.mock('../commands')
beforeEach(() => {
  vi.resetAllMocks()
})

const holding = (rolls: number) => ({
  accounts: [{ uid: '100000002', server: 'prod_official_asia', timezone: 8, rolls }],
  last_import: null,
})
const CHECKED: CheckedBackup = {
  name: 'Astral-Index-backup-2026-10-16.sqlite',
  backup: holding(15),
  current: holding(4),
}

test('choosing a backup checks it, then holds it for the confirmation', async () => {
  let finish!: (value: { checked: CheckedBackup }) => void
  vi.mocked(chooseRestore).mockReturnValue(new Promise((resolve) => (finish = resolve)))
  const restore = useRestore()
  expect(restore.state.value).toBe('idle')
  const choosing = restore.choose()
  expect(restore.state.value).toBe('checking')
  // A second press while checking asks nothing more.
  void restore.choose()
  expect(chooseRestore).toHaveBeenCalledTimes(1)
  finish({ checked: CHECKED })
  await choosing
  expect(restore.state.value).toBe('confirming')
  expect(restore.checked.value).toEqual(CHECKED)
  expect(restore.message.value).toBeNull()
})

test('closing the dialog leaves nothing to report', async () => {
  vi.mocked(chooseRestore).mockResolvedValue({ cancelled: true })
  const restore = useRestore()
  await restore.choose()
  expect(restore.state.value).toBe('idle')
  expect(restore.checked.value).toBeNull()
})

test('a refused backup says why, until the next choice', async () => {
  vi.mocked(chooseRestore).mockResolvedValue({
    failure: { kind: 'restore_refused', refusal: 'newer' },
  })
  const restore = useRestore()
  await restore.choose()
  expect(restore.state.value).toBe('idle')
  expect(restore.checked.value).toBeNull()
  expect(restore.message.value).toBe(
    'This backup was made by a newer version of Astral Index. Update the app, then restore it.',
  )
  vi.mocked(chooseRestore).mockResolvedValue({ cancelled: true })
  const choosing = restore.choose()
  expect(restore.message.value).toBeNull()
  await choosing
})

test('cancelling drops the held copy and returns to the card', async () => {
  vi.mocked(chooseRestore).mockResolvedValue({ checked: CHECKED })
  vi.mocked(cancelRestore).mockResolvedValue(undefined)
  const restore = useRestore()
  await restore.choose()
  await restore.cancel()
  expect(cancelRestore).toHaveBeenCalledTimes(1)
  expect(restore.state.value).toBe('idle')
  expect(restore.checked.value).toBeNull()
  // Even when the native side can't be told, the confirmation closes: the next
  // choice replaces the held copy.
  await restore.choose()
  vi.mocked(cancelRestore).mockResolvedValue({ kind: 'unavailable' })
  await restore.cancel()
  expect(restore.state.value).toBe('idle')
  expect(restore.checked.value).toBeNull()
})
