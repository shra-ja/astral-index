import { beforeEach, expect, test, vi } from 'vitest'
import { historyPage, savedAccounts, type StoredHistory } from '../commands'
import { forgetAccountChoice, useHistory } from './useHistory'

vi.mock('../commands')
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(savedAccounts).mockResolvedValue({ accounts: [] })
  forgetAccountChoice()
})

// Resolve the mocked commands and the composable's follow-up reads.
const settle = () => new Promise((resolve) => setTimeout(resolve))
const account = { uid: '100000001', server: 'synthetic-server', timezone: 8 }
// Synthetic counts by category: 45 Character Event and 3 Stellar Warp rolls.
const counts: Record<string, number> = { '1': 3, '11': 45 }
// A page as the native side would return it, with numbered placeholder rolls.
function stored(category: string, page: number, size: number): StoredHistory {
  const total = counts[category] ?? 0
  const first = total - (page - 1) * size
  const length = Math.max(0, Math.min(size, first))
  return {
    account,
    total,
    categories: ['1', '2', '11', '12', '21', '22'].map((gacha_type) => ({
      gacha_type,
      total: counts[gacha_type] ?? 0,
    })),
    rolls: Array.from({ length }, (_, index) => ({
      number: first - index,
      id: `${category}-${first - index}`,
      name: 'Synthetic item',
      item_type: 'Character',
      rank_type: '3',
      time: '2026-09-28 21:14:03',
    })),
  }
}
function serveStored() {
  vi.mocked(historyPage).mockImplementation((category, page, size) =>
    Promise.resolve({ history: stored(category, page, size) }),
  )
}
// Each read's arguments; reads of the account imported last name no account.
const reads = () =>
  vi.mocked(historyPage).mock.calls.map((call) => call.filter((arg) => arg !== undefined))

test('opens on the first page of Character Event Warp, 20 rows at a time', async () => {
  serveStored()
  const history = useHistory()
  expect(history.loading.value).toBe(false)
  void history.start()
  expect(history.loading.value).toBe(true)
  await settle()
  expect(history.loading.value).toBe(false)
  expect(reads()).toEqual([['11', 1, 20]])
  expect(history.category.value).toBe('11')
  expect(history.history.value?.rolls.map((roll) => roll.number)).toEqual(
    Array.from({ length: 20 }, (_, index) => 45 - index),
  )
  expect(history.pages.value).toBe(3)
})

test('opens on the first category with rolls when Character Event Warp has none', async () => {
  counts['11'] = 0
  serveStored()
  const history = useHistory()
  await history.start()
  expect(reads()).toEqual([
    ['11', 1, 20],
    ['1', 1, 20],
  ])
  expect(history.category.value).toBe('1')
  expect(history.history.value?.total).toBe(3)
  counts['11'] = 45
})

test('with no saved rolls at all it stays on the opening category', async () => {
  vi.mocked(historyPage).mockResolvedValue({
    history: { account: null, total: 0, categories: [], rolls: [] },
  })
  const history = useHistory()
  await history.start()
  expect(reads()).toHaveLength(1)
  expect(history.history.value?.account).toBeNull()
  expect(history.pages.value).toBe(1)
})

test('choosing a category starts from its first page', async () => {
  serveStored()
  const history = useHistory()
  await history.start()
  await history.goTo(3)
  await history.select('1')
  expect(reads().slice(1)).toEqual([
    ['11', 3, 20],
    ['1', 1, 20],
  ])
  expect([history.category.value, history.page.value]).toEqual(['1', 1])
})

test('changing rows per page keeps the first shown row in view', async () => {
  serveStored()
  const history = useHistory()
  await history.start()
  await history.goTo(3)
  // Rows 41–45 from the top were shown; at 50 a page they are all on page 1.
  await history.resize(50)
  expect([history.page.value, history.pageSize.value]).toEqual([1, 50])
  await history.resize(20)
  await history.goTo(2)
  // Row 21 from the top starts page 2 of 20, and page 3 of 10.
  await history.resize(10)
  expect(history.page.value).toBe(3)
  expect(reads().at(-1)).toEqual(['11', 3, 10])
})

test('a slower earlier read never replaces a later one', async () => {
  serveStored()
  const history = useHistory()
  await history.start()
  let finish!: () => void
  vi.mocked(historyPage).mockImplementationOnce(
    (category, page, size) =>
      new Promise((resolve) => {
        finish = () => resolve({ history: stored(category, page, size) })
      }),
  )
  const slow = history.goTo(2)
  await history.select('1')
  finish()
  await slow
  expect(history.category.value).toBe('1')
  expect(history.history.value?.total).toBe(3)
  expect(history.loading.value).toBe(false)
})

test('a failed read is kept until retried, which reads the same page again', async () => {
  serveStored()
  const history = useHistory()
  await history.start()
  vi.mocked(historyPage).mockResolvedValueOnce({ failure: { kind: 'storage' } })
  await history.goTo(2)
  expect(history.failure.value).toEqual({ kind: 'storage' })
  expect(history.loading.value).toBe(false)
  await history.retry()
  expect(history.failure.value).toBeUndefined()
  expect(reads().slice(-2)).toEqual([
    ['11', 2, 20],
    ['11', 2, 20],
  ])
  expect(history.history.value?.rolls[0]?.number).toBe(25)
})

test('a failed opening read shows the failure and reads nothing more', async () => {
  vi.mocked(historyPage).mockResolvedValue({ failure: { kind: 'storage' } })
  const history = useHistory()
  await history.start()
  expect(reads()).toHaveLength(1)
  expect(history.failure.value).toEqual({ kind: 'storage' })
  expect(history.history.value).toBeUndefined()
  expect(history.pages.value).toBe(1)
})

// A second saved account, with 2 Stellar Warp rolls only.
const other = { uid: '100000003', server: 'synthetic-server', timezone: null }
const saved = [
  { ...other, rolls: 2 },
  { ...account, rolls: 48 },
]
function serveAccounts() {
  vi.mocked(savedAccounts).mockResolvedValue({ accounts: saved })
  vi.mocked(historyPage).mockImplementation((category, page, size, chosen) => {
    if (chosen?.uid !== other.uid) return Promise.resolve({ history: stored(category, page, size) })
    const total = category === '1' ? 2 : 0
    return Promise.resolve({
      history: {
        account: other,
        total,
        categories: [{ gacha_type: '1', total: 2 }],
        rolls: [],
      },
    })
  })
}

test('opening lists the saved accounts and reads the account imported last', async () => {
  serveAccounts()
  const history = useHistory()
  await history.start()
  expect(history.accounts.value).toEqual(saved)
  expect(reads()).toEqual([['11', 1, 20]])
  expect(history.history.value?.account).toEqual(account)
})

test('switching accounts reads its first page, then keeps it for every read', async () => {
  serveAccounts()
  const history = useHistory()
  await history.start()
  await history.select('1')
  await history.goTo(1)
  await history.switchAccount(saved[1])
  expect(reads().at(-1)).toEqual(['1', 1, 20, saved[1]])
  // Without rolls in the shown category, it moves to the first category with some.
  await history.select('11')
  await history.switchAccount(saved[0])
  expect(reads().slice(-2)).toEqual([
    ['11', 1, 20, saved[0]],
    ['1', 1, 20, saved[0]],
  ])
  expect([history.category.value, history.page.value]).toEqual(['1', 1])
  expect(history.history.value?.account).toEqual(other)
  await history.resize(50)
  expect(reads().at(-1)).toEqual(['1', 1, 50, saved[0]])
})

test('the chosen account outlasts the screen until a save forgets it', async () => {
  serveAccounts()
  const first = useHistory()
  await first.start()
  await first.switchAccount(saved[0])
  // Leaving the History screen and coming back keeps the choice.
  const again = useHistory()
  await again.start()
  expect(reads().at(-1)).toEqual(['1', 1, 20, saved[0]])
  forgetAccountChoice()
  const afterSave = useHistory()
  await afterSave.start()
  expect(reads().at(-1)).toEqual(['11', 1, 20])
})

test('when the accounts cannot be listed, history is still shown without a switcher', async () => {
  serveStored()
  vi.mocked(savedAccounts).mockResolvedValue({ failure: { kind: 'storage' } })
  const history = useHistory()
  await history.start()
  expect(history.accounts.value).toEqual([])
  expect(history.failure.value).toBeUndefined()
  expect(history.history.value?.total).toBe(45)
})
