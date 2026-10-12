import { beforeEach, expect, test, vi } from 'vitest'
import { appInfo, openIssuesPage, revealDataFolder } from '../commands'
import { useAbout } from './useAbout'

vi.mock('../commands')
beforeEach(() => {
  vi.resetAllMocks()
})

const info = { version: '0.1.0', folder: '/local/astral-index', portable: false }

test('the details are unknown until read', async () => {
  vi.mocked(appInfo).mockResolvedValue({ info })
  const about = useAbout()
  expect(about.info.value).toBeNull()
  await about.load()
  expect(about.info.value).toEqual(info)
  // A failed read shows no details rather than stale ones.
  vi.mocked(appInfo).mockResolvedValue({ failure: { kind: 'unavailable' } })
  await about.load()
  expect(about.info.value).toBeNull()
})

test('a failed opening is remembered until the next attempt or a reset', async () => {
  vi.mocked(revealDataFolder).mockResolvedValue({ kind: 'open_failed' })
  vi.mocked(openIssuesPage).mockResolvedValue(undefined)
  const about = useAbout()
  expect(about.failed.value).toBeNull()
  await about.revealFolder()
  expect(about.failed.value).toBe('folder')
  await about.openIssues()
  expect(about.failed.value).toBeNull()
  vi.mocked(openIssuesPage).mockResolvedValue({ kind: 'unavailable' })
  await about.openIssues()
  expect(about.failed.value).toBe('issues')
  about.reset()
  expect(about.failed.value).toBeNull()
  expect(revealDataFolder).toHaveBeenCalledTimes(1)
  expect(openIssuesPage).toHaveBeenCalledTimes(2)
})
