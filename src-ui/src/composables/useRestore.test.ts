import { beforeEach, expect, test, vi } from 'vitest'
import { effectScope } from 'vue'
import { cancelRestore, chooseRestore, confirmRestore, type CheckedBackup } from '../commands'
import { forgetAccountChoices } from './useHistory'
import { useRestore } from './useRestore'

vi.mock('../commands')
vi.mock('./useHistory')
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
const checkedLater = () => {
  let finish!: (value: { checked: CheckedBackup }) => void
  vi.mocked(chooseRestore).mockReturnValue(new Promise((resolve) => (finish = resolve)))
  return (value = CHECKED) => finish({ checked: value })
}

test('choosing a backup checks it, then holds it for the confirmation', async () => {
  const finish = checkedLater()
  const restore = useRestore()
  expect(restore.checking.value).toBe(false)
  const choosing = restore.choose()
  expect(restore.checking.value).toBe(true)
  // A second press while checking asks nothing more.
  void restore.choose()
  expect(chooseRestore).toHaveBeenCalledTimes(1)
  finish()
  await choosing
  expect(restore.checking.value).toBe(false)
  expect(restore.checked.value).toEqual(CHECKED)
  expect(restore.outcome.value).toBeNull()
})

test('closing the dialog leaves nothing to report', async () => {
  vi.mocked(chooseRestore).mockResolvedValue({ cancelled: true })
  const restore = useRestore()
  await restore.choose()
  expect(restore.checking.value).toBe(false)
  expect(restore.checked.value).toBeNull()
  expect(restore.outcome.value).toBeNull()
})

test('a refused backup says why, until the next choice', async () => {
  vi.mocked(chooseRestore).mockResolvedValue({
    failure: { kind: 'restore_refused', refusal: 'newer' },
  })
  const restore = useRestore()
  await restore.choose()
  expect(restore.checked.value).toBeNull()
  expect(restore.outcome.value).toEqual({
    kind: 'failed',
    message:
      'This backup was made by a newer version of Astral Index. Update the app, then restore it.',
  })
  vi.mocked(chooseRestore).mockResolvedValue({ cancelled: true })
  const choosing = restore.choose()
  expect(restore.outcome.value).toBeNull()
  await choosing
})

const confirmedLater = () => {
  let finish!: (value: Awaited<ReturnType<typeof confirmRestore>>) => void
  vi.mocked(confirmRestore).mockReturnValue(new Promise((resolve) => (finish = resolve)))
  return finish
}

test('restoring replaces the history, then names the backup and the safety copy', async () => {
  vi.mocked(chooseRestore).mockResolvedValue({ checked: CHECKED })
  const restored = vi.fn()
  const restore = useRestore({ onRestored: restored })
  await restore.choose()
  const finish = confirmedLater()
  const confirming = restore.confirm()
  expect(restore.restoring.value).toBe(true)
  // A second press while restoring sends nothing more; the confirmation stays meanwhile.
  void restore.confirm()
  expect(confirmRestore).toHaveBeenCalledTimes(1)
  expect(confirmRestore).toHaveBeenCalledWith()
  expect(restore.checked.value).toEqual(CHECKED)
  finish({ safetyCopy: 'history-before-restore-20261020-143005.sqlite' })
  await confirming
  expect(restore.restoring.value).toBe(false)
  expect(restore.checked.value).toBeNull()
  expect(restore.outcome.value).toEqual({
    kind: 'restored',
    name: 'Astral-Index-backup-2026-10-16.sqlite',
    safetyCopy: 'history-before-restore-20261020-143005.sqlite',
  })
  // The History screen shows each game's account imported into last again.
  expect(forgetAccountChoices).toHaveBeenCalledTimes(1)
  // Whoever asked hears of it, as the history may be usable again.
  expect(restored).toHaveBeenCalledWith(restore.outcome.value)
  // Choosing again clears the outcome.
  vi.mocked(chooseRestore).mockResolvedValue({ cancelled: true })
  await restore.choose()
  expect(restore.outcome.value).toBeNull()
  // With nothing held, there is nothing to confirm.
  await restore.confirm()
  expect(confirmRestore).toHaveBeenCalledTimes(1)
})

test('a restore that replaced nothing closes the confirmation and says why', async () => {
  vi.mocked(chooseRestore).mockResolvedValue({ checked: CHECKED })
  vi.mocked(confirmRestore).mockResolvedValue({ failure: { kind: 'restore_changed' } })
  const restore = useRestore()
  await restore.choose()
  await restore.confirm()
  expect(restore.checked.value).toBeNull()
  expect(restore.outcome.value).toEqual({
    kind: 'failed',
    message:
      'Your history changed after the backup was checked, so nothing was replaced. Choose the backup again.',
  })
  expect(forgetAccountChoices).not.toHaveBeenCalled()
})

test('cancelling drops the held copy and closes the confirmation', async () => {
  vi.mocked(chooseRestore).mockResolvedValue({ checked: CHECKED })
  vi.mocked(cancelRestore).mockResolvedValue(undefined)
  const restore = useRestore()
  await restore.choose()
  await restore.cancel()
  expect(cancelRestore).toHaveBeenCalledTimes(1)
  expect(restore.checked.value).toBeNull()
  // Even when the native side can't be told, the confirmation closes: the next
  // choice, or the next start, removes the held copy.
  await restore.choose()
  vi.mocked(cancelRestore).mockResolvedValue({ kind: 'unavailable' })
  await restore.cancel()
  expect(restore.checked.value).toBeNull()
})

test('a backup checked after its screen has closed is let go at once', async () => {
  const finish = checkedLater()
  const scope = effectScope()
  const restore = scope.run(useRestore)!
  const choosing = restore.choose()
  scope.stop()
  finish()
  await choosing
  expect(cancelRestore).toHaveBeenCalledTimes(1)
  expect(restore.checked.value).toBeNull()
})

test('a restore made elsewhere can be shown as the first outcome', () => {
  const outcome = { kind: 'restored' as const, name: 'backup.sqlite', safetyCopy: null }
  expect(useRestore({ initial: outcome }).outcome.value).toEqual(outcome)
})
