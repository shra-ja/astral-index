<script setup lang="ts">
// The History screen: a game's saved history, read from this device only. It shows
// the account the latest import went into, its banner categories with their counts,
// and a page of the chosen category, newest first. Only Star Rail has an adapter;
// until something is saved, it points to the Import screen.
import { computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AccountChip from '../components/AccountChip.vue'
import CategoryTabs from '../components/CategoryTabs.vue'
import EmptyState from '../components/EmptyState.vue'
import HistoryFailed from '../components/HistoryFailed.vue'
import RollList from '../components/RollList.vue'
import RollPager from '../components/RollPager.vue'
import ScreenHeader from '../components/ScreenHeader.vue'
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
  failure,
  loading,
  pages,
  start,
  select,
  goTo,
  resize,
  retry,
} = useHistory()

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
      <AccountChip v-if="account" :uid="account.uid" :server="account.server" />
    </ScreenHeader>
    <div class="body" :class="{ centred: empty || failure }" :aria-busy="loading">
      <EmptyState v-if="empty" :term="terms[game]" :game="games[game]">
        <RouterLink class="button" :to="{ name: 'import', params: { game } }">
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path
              d="M9 2.5v8.5m0 0 3.4-3.4M9 11 5.6 7.6M3 12.5v1.5A1.5 1.5 0 0 0 4.5 15.5h9A1.5 1.5 0 0 0 15 14v-1.5"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
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
        <section class="rolls" aria-label="Rolls">
          <RollList
            v-if="history.rolls.length > 0"
            :rolls="history.rolls"
            :offset="utcOffset(account.timezone)"
            :caption="`${warps[category]} rolls, newest first`"
          />
          <p v-else class="none">No {{ warps[category] }} rolls saved yet.</p>
        </section>
        <RollPager
          v-if="history.total > 0"
          :page
          :pages
          :page-size
          :total="history.total"
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
.none {
  margin: auto;
  padding: 48px 20px;
  color: var(--text-secondary);
  font-size: 15px;
  text-align: center;
}
</style>
