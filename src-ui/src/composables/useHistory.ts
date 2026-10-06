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
  type Rarity,
  type SavedAccount,
  type StoredHistory,
} from '../commands'
import { categoryTabs, type DateRange, type Game } from '../format'

// Every rarity, in the order the filters show them.
const allRarities: Rarity[] = ['5', '4', '3']

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
  // The rarities shown, kept across categories and accounts while the screen is open.
  const rarities = ref<Rarity[]>([...allRarities])
  // The search box's text, and the trimmed search last read, kept the same way.
  const query = ref('')
  // The server days shown, kept the same way.
  const dates = ref<DateRange>({})
  let searched = ''
  let pending: ReturnType<typeof setTimeout> | undefined
  const failure = ref<Failure>()
  const loading = ref(false)
  // Only the latest read may update the screen, whatever order reads finish in.
  let latest = 0

  async function load() {
    const read = ++latest
    loading.value = true
    const result = await historyPage(category.value, page.value, pageSize.value, {
      account: chosen[toValue(game)],
      // Showing every rarity names none, as the native side shows all by default.
      rarities: rarities.value.length < allRarities.length ? [...rarities.value] : undefined,
      search: searched || undefined,
      from: dates.value.from,
      to: dates.value.to,
    })
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

  /** Show or hide `rarity`, starting again from the first page of what matches. */
  function toggleRarity(rarity: Rarity) {
    const shown = new Set(rarities.value)
    if (!shown.delete(rarity)) shown.add(rarity)
    rarities.value = allRarities.filter((each) => shown.has(each))
    page.value = 1
    return load()
  }

  /** Search item names as typed, reading again once typing pauses for 250 ms. */
  function search(text: string) {
    query.value = text
    clearTimeout(pending)
    pending = setTimeout(() => {
      searched = text.trim()
      page.value = 1
      void load()
    }, 250)
  }

  /** Show the rolls on and between these server days, from the first page. */
  function setDates(range: DateRange) {
    dates.value = { ...range }
    page.value = 1
    return load()
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

  const pages = computed(() =>
    Math.max(1, Math.ceil((history.value?.matched ?? 0) / pageSize.value)),
  )

  return {
    category: readonly(category),
    page: readonly(page),
    pageSize: readonly(pageSize),
    history,
    accounts,
    rarities: readonly(rarities),
    query: readonly(query),
    dates: readonly(dates),
    failure: readonly(failure),
    loading: readonly(loading),
    pages,
    start,
    switchAccount,
    toggleRarity,
    search,
    setDates,
    select,
    goTo,
    resize,
    retry: load,
  }
}
