// Saved history for the History screen: the saved accounts, which account,
// category, page and page size are shown, and the page read for them. Only this
// composable reads history; it reads this device only and never fetches from
// HoYoverse.
import {
  computed,
  readonly,
  ref,
  shallowReactive,
  shallowRef,
  toValue,
  type MaybeRefOrGetter,
} from 'vue'
import {
  historyPage,
  savedAccounts,
  type Account,
  type Failure,
  type SavedAccount,
  type StoredHistory,
} from '../commands'
import { categoryTabs, type Game } from '../format'

// The account chosen in each game's switcher, kept while the app runs so that
// leaving the History screen keeps it. Unset, history shows the account imported
// into last.
const chosen = shallowReactive<Partial<Record<Game, Account>>>({})

/** Show `game`'s account imported into last again, as after every save into it. */
export function forgetAccountChoice(game: Game) {
  delete chosen[game]
}

/** Saved history of `game`, which may change while the screen stays open. */
export function useHistory(game: MaybeRefOrGetter<Game>) {
  const category = ref<string>(categoryTabs[0].gacha_type)
  const page = ref(1)
  const pageSize = ref(20)
  const history = shallowRef<StoredHistory>()
  const accounts = shallowRef<SavedAccount[]>([])
  const failure = ref<Failure>()
  const loading = ref(false)
  // Only the latest read may update the screen, whatever order reads finish in.
  let latest = 0

  async function load() {
    const read = ++latest
    loading.value = true
    const result = await historyPage(
      category.value,
      page.value,
      pageSize.value,
      chosen[toValue(game)],
    )
    if (read !== latest) return
    loading.value = false
    if ('failure' in result) {
      failure.value = result.failure
      return
    }
    failure.value = undefined
    history.value = result.history
  }

  /** Read the opening page and the saved accounts, as on opening the screen. */
  async function start() {
    const listed = savedAccounts()
    await open()
    const result = await listed
    // Without the list, history is still shown, just without a switcher.
    accounts.value = 'accounts' in result ? result.accounts : []
  }

  /** Read the shown category's first page, moving to the first category with rolls if it has none. */
  async function open() {
    await load()
    const { total, categories } = history.value ?? { total: 0, categories: [] }
    const counted = new Map(categories.map((each) => [each.gacha_type, each.total]))
    const first = categoryTabs.find((tab) => (counted.get(tab.gacha_type) ?? 0) > 0)
    if (total === 0 && first) await select(first.gacha_type)
  }

  /** Show `account`'s history from now on, starting from the first page. */
  function switchAccount(account: Account) {
    chosen[toValue(game)] = account
    page.value = 1
    return open()
  }

  function select(next: string) {
    category.value = next
    page.value = 1
    return load()
  }

  function goTo(next: number) {
    page.value = next
    return load()
  }

  /** Change rows per page, keeping the first row shown on the new page. */
  function resize(size: number) {
    page.value = Math.floor(((page.value - 1) * pageSize.value) / size) + 1
    pageSize.value = size
    return load()
  }

  const pages = computed(() => Math.max(1, Math.ceil((history.value?.total ?? 0) / pageSize.value)))

  return {
    category: readonly(category),
    page: readonly(page),
    pageSize: readonly(pageSize),
    history,
    accounts,
    failure: readonly(failure),
    loading: readonly(loading),
    pages,
    start,
    switchAccount,
    select,
    goTo,
    resize,
    retry: load,
  }
}
