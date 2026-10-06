<script setup lang="ts">
// The History screen: a game's saved history, read from this device only. It shows
// the account the latest import went into, or the one chosen in the switcher when
// more than one is saved, its banner categories with their counts, a summary of
// the chosen category, and a page of it, newest first. Only Star Rail has an
// adapter; until something is saved, it points to the Import screen.
import { Download } from '@lucide/vue'
import { computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AccountChip from '../components/history/AccountChip.vue'
import AccountSwitcher from '../components/history/AccountSwitcher.vue'
import CategoryTabs from '../components/history/CategoryTabs.vue'
import EmptyState from '../components/history/EmptyState.vue'
import HistoryFailed from '../components/history/HistoryFailed.vue'
import RarityFilters from '../components/history/RarityFilters.vue'
import RollList from '../components/history/RollList.vue'
import RollPager from '../components/history/RollPager.vue'
import SummaryStrip from '../components/history/SummaryStrip.vue'
import ScreenHeader from '../components/layout/ScreenHeader.vue'
import type { StoredHistory } from '../commands'
import { useHistory } from '../composables/useHistory'
import { categoryTabs, games, terms, utcOffset, warps, type Game } from '../format'
import { historyFailure } from '../messages'

const props = defineProps<{ game: Game }>()
const {
  category,
  page,
  pageSize,
  history,
  accounts,
  rarities,
  failure,
  loading,
  pages,
  start,
  switchAccount,
  toggleRarity,
  select,
  goTo,
  resize,
  retry,
} = useHistory(() => props.game)

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
          <div class="toolbar">
            <RarityFilters :shown="rarities" @toggle="toggleRarity" />
          </div>
          <RollList
            v-if="history.rolls.length > 0"
            :rolls="history.rolls"
            :offset="utcOffset(account.timezone)"
            :caption="`${warps[category]} rolls, newest first`"
          />
          <p v-else-if="history.total === 0" class="none">
            No {{ warps[category] }} rolls saved yet.
          </p>
          <p v-else class="none">
            <strong>No rolls match these filters.</strong>
            Turn on more rarities to see them.
          </p>
        </section>
        <RollPager
          v-if="history.matched > 0"
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
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 14px;
  min-height: 0;
  padding: 16px var(--gutter) 20px;
  /* The summary strip lays itself out by the content area's width. */
  container: content / inline-size;
}
.body.centred {
  align-items: center;
  justify-content: center;
  padding-block: 32px;
  overflow-y: auto;
}
.rolls {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--panel-rim);
  border-radius: 12px;
  background: var(--list);
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  min-height: 52px;
  padding: 10px 10px 10px 16px;
  border-bottom: 1px solid var(--panel-rim);
  background: var(--panel);
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
