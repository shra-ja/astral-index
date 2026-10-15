import { beforeEach, expect, test, vi } from 'vitest'
import { appInfo, openIssuesPage, revealDataFolder } from '../commands'
import { useAbout } from './useAbout'

vi.mock('../commands')
beforeEach(() => {
  vi.resetAllMocks()
})

const info = {
  version: '1.2.0',
  build: { kind: 'release' as const },
  folder: '/local/astral-index',
  portable: false,
}

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

test('the notices load once, when first shown, or are known to be missing', async () => {
  const notices = { texts: [], components: [] }
  const load = vi.fn().mockResolvedValue(notices)
  const about = useAbout(load)
  expect(about.notices.value).toBeNull()
  await about.showNotices()
  await about.showNotices()
  expect(about.notices.value).toEqual(notices)
  expect(about.noticesMissing.value).toBe(false)
  expect(load).toHaveBeenCalledOnce()
  // A build that generated none, as in development, says so and stops asking.
  const none = vi.fn().mockResolvedValue(null)
  const development = useAbout(none)
  await development.showNotices()
  await development.showNotices()
  expect(development.notices.value).toBeNull()
  expect(development.noticesMissing.value).toBe(true)
  expect(none).toHaveBeenCalledOnce()
})
