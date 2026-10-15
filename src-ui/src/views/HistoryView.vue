<script setup lang="ts">
// The History screen: a game's saved history, read from this device only. It shows
// the account the latest import went into, or the one chosen in the switcher when
// more than one is saved, its banner categories with their counts, a summary of
// the chosen category, and a page of it, newest first, as a list, tiles or icons. Only Star
// Rail has an adapter; until something is saved, it points to the Import screen.
import { Download } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AccountChip from '../components/history/AccountChip.vue'
import AccountSwitcher from '../components/history/AccountSwitcher.vue'
import CategoryTabs from '../components/history/CategoryTabs.vue'
import DateRangeFilter from '../components/history/DateRangeFilter.vue'
import EmptyState from '../components/history/EmptyState.vue'
import HistoryFailed from '../components/history/HistoryFailed.vue'
import LayoutSwitch from '../components/history/LayoutSwitch.vue'
import RarityFilters from '../components/history/RarityFilters.vue'
import RollGrid from '../components/history/RollGrid.vue'
import RollIcons from '../components/history/RollIcons.vue'
import RollList from '../components/history/RollList.vue'
import RollPager from '../components/history/RollPager.vue'
import RollSearch from '../components/history/RollSearch.vue'
import SummaryStrip from '../components/history/SummaryStrip.vue'
import ScreenHeader from '../components/layout/ScreenHeader.vue'
import type { StoredHistory } from '../commands'
import { useHistory } from '../composables/useHistory'
import {
  categoryTabs,
  games,
  serverToday,
  storedPeriod,
  terms,
  utcOffset,
  warps,
  type Game,
  type Layout,
} from '../format'
import { historyFailure } from '../messages'

const props = defineProps<{ game: Game }>()
const {
  category,
  page,
  pageSize,
  history,
  accounts,
  rarities,
  query,
  dates,
  failure,
  loading,
  pages,
  start,
  switchAccount,
  toggleRarity,
  search,
  setDates,
  select,
  goTo,
  resize,
  retry,
} = useHistory(() => props.game)

// Kept across categories and accounts while the screen is open.
const layout = ref<Layout>('list')

const available = computed(() => props.game === 'honkai-star-rail')
// The router keeps this screen when only the game changes, so each switch to Star
// Rail reads its history afresh.
watch(
  available,
  (now) => {
    if (now) void start()
  },
  { immediate: true },
)

const account = computed(() => (available.value ? history.value?.account : undefined))
const empty = computed(() => !available.value || history.value?.account === null)
// The saved rolls' period as one line, for the date filter's note.
const spanOf = (summary: StoredHistory['summary']) =>
  storedPeriod(summary.first, summary.last).join(' ')
// The categories the native side counted, in the tabs' order with their short names.
const tabsOf = (counts: StoredHistory['categories']) =>
  categoryTabs.flatMap((tab) =>
    counts
      .filter((count) => count.gacha_type === tab.gacha_type)
      .map(({ total }) => ({ ...tab, total })),
  )
</script>

<template>
  <main>
    <ScreenHeader :title="`${terms[game]} History`" :game="games[game]">
      <AccountSwitcher
        v-if="account && accounts.length > 1"
        :accounts
        :current="account"
        @switch="switchAccount"
      />
      <AccountChip v-else-if="account" :uid="account.uid" :server="account.server" />
    </ScreenHeader>
    <div class="body" :class="{ centred: empty || failure }" :aria-busy="loading">
      <EmptyState v-if="empty" :term="terms[game]" :game="games[game]">
        <RouterLink class="button" :to="{ name: 'import', params: { game } }">
          <Download :size="16" />
          Go to Import
        </RouterLink>
      </EmptyState>
      <HistoryFailed
        v-else-if="failure"
        :title="`Couldn’t Show Your ${terms[game]} History`"
        :message="historyFailure(failure)"
        @retry="retry"
      />
      <template v-else-if="account && history">
        <CategoryTabs :tabs="tabsOf(history.categories)" :selected="category" @select="select" />
        <SummaryStrip :total="history.total" :summary="history.summary" />
        <section class="rolls" aria-label="Rolls">
          <!-- Two groups that stay together: the filters, then search and the layout. -->
          <div class="toolbar">
            <div class="group">
              <RarityFilters :shown="rarities" @toggle="toggleRarity" />
              <DateRangeFilter
                :from="dates.from"
                :to="dates.to"
                :today="serverToday(account.timezone)"
                :offset="utcOffset(account.timezone)"
                :span="history.summary.first ? spanOf(history.summary) : undefined"
                @change="setDates"
              />
            </div>
            <div class="group find">
              <RollSearch :query @search="search" />
              <LayoutSwitch class="layout" :layout @change="layout = $event" />
            </div>
          </div>
          <template v-if="history.rolls.length > 0">
            <RollGrid
              v-if="layout === 'grid'"
              :rolls="history.rolls"
              :caption="`${warps[category]} rolls, newest first`"
              :soft-pity="history.soft_pity"
            />
            <RollIcons
              v-else-if="layout === 'icons'"
              :rolls="history.rolls"
              :caption="`${warps[category]} rolls, newest first`"
              :soft-pity="history.soft_pity"
            />
            <RollList
              v-else
              :rolls="history.rolls"
              :offset="utcOffset(account.timezone)"
              :caption="`${warps[category]} rolls, newest first`"
              :soft-pity="history.soft_pity"
            />
          </template>
          <p v-else-if="history.total === 0" class="none">
            No {{ warps[category] }} rolls saved yet.
          </p>
          <p v-else class="none">
            <strong>No rolls match these filters.</strong>
            Try another search or turn on more rarities.
          </p>
        </section>
        <RollPager
          v-if="history.matched > 0"
          class="pager"
          :page
          :pages
          :page-size
          :total="history.matched"
          @go="goTo"
          @resize="resize"
        />
      </template>
    </div>
  </main>
</template>

<style scoped>
.body {
  --pad-top: 16px;
  --pad-bottom: 20px;
  /* The list's column headings stick to the screen's top edge, above its padding. */
  --sticky-top: calc(-1 * var(--pad-top));

  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 14px;
  min-height: 0;
  padding: var(--pad-top) var(--content-pad) var(--pad-bottom);
  /* Only the screen scrolls; the rolls panel shows every roll on the page. */
  overflow-y: auto;
  /* Room for a classic scrollbar, as WebView2 draws on Windows, whether or not this
     tab and layout scroll, so the content never shifts sideways between them. */
  scrollbar-gutter: stable;
  /* The summary strip lays itself out by the content area's width. */
  container: content / inline-size;
}
.body.centred {
  align-items: center;
  justify-content: center;
  padding-block: 32px;
  overflow-y: auto;
}
.body > * {
  flex-shrink: 0;
}
.rolls {
  display: flex;
  flex-direction: column;
  /* Clipped to the corners without scrolling, which keeps the column headings sticky. */
  overflow: clip;
  border: 1px solid var(--panel-rim);
  border-radius: 12px;
  background: var(--list);
}
.toolbar {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  min-height: 52px;
  padding: 10px 10px 10px 16px;
  border-bottom: 1px solid var(--panel-rim);
  background: var(--panel);
}
/* The filters wrap only when a narrow window and a long date range leave no room;
   search and the layout share a row and take what the filters leave. */
.group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
}
.find {
  flex: 1 1 auto;
  flex-wrap: nowrap;
}
.layout {
  margin-left: auto;
}
/* The pager stays at the bottom of the window while the screen scrolls. */
.pager {
  position: sticky;
  bottom: calc(-1 * var(--pad-bottom));
  z-index: 2;
  margin-bottom: calc(-1 * var(--pad-bottom));
  padding: 12px 0 var(--pad-bottom);
  background: var(--window);
}
.none strong {
  display: block;
  color: var(--text);
  font-size: 15px;
}
.none {
  margin: auto;
  padding: 48px 20px;
  color: var(--text-secondary);
  font-size: 15px;
  text-align: center;
}
</style>
