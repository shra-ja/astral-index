// Saved history for the History screen: which category, page and page size are
// shown, and the page read for them. Only this composable reads history; it reads
// this device only and never fetches from HoYoverse.
import { computed, readonly, ref, shallowRef } from 'vue'
import { historyPage, type Failure, type StoredHistory } from '../commands'
import { categoryTabs } from '../format'

export function useHistory() {
  const category = ref<string>(categoryTabs[0].gacha_type)
  const page = ref(1)
  const pageSize = ref(20)
  const history = shallowRef<StoredHistory>()
  const failure = ref<Failure>()
  const loading = ref(false)
  // Only the latest read may update the screen, whatever order reads finish in.
  let latest = 0

  async function load() {
    const read = ++latest
    loading.value = true
    const result = await historyPage(category.value, page.value, pageSize.value)
    if (read !== latest) return
    loading.value = false
    if ('failure' in result) {
      failure.value = result.failure
      return
    }
    failure.value = undefined
    history.value = result.history
  }

  /** Read the opening page, moving to the first category with rolls if it has none. */
  async function start() {
    await load()
    const { total, categories } = history.value ?? { total: 0, categories: [] }
    const counted = new Map(categories.map((each) => [each.gacha_type, each.total]))
    const first = categoryTabs.find((tab) => (counted.get(tab.gacha_type) ?? 0) > 0)
    if (total === 0 && first) await select(first.gacha_type)
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
    failure: readonly(failure),
    loading: readonly(loading),
    pages,
    start,
    select,
    goTo,
    resize,
    retry: load,
  }
}
