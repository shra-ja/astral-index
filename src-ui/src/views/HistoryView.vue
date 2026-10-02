<script setup lang="ts">
// The History screen: a game's saved history. Showing saved rolls comes next; until
// then it points to the Import screen.
import { RouterLink } from 'vue-router'
import EmptyState from '../components/EmptyState.vue'
import ScreenHeader from '../components/ScreenHeader.vue'
import { games, terms, type Game } from '../format'

defineProps<{ game: Game }>()
</script>

<template>
  <main>
    <ScreenHeader :title="`${terms[game]} History`" :game="games[game]" />
    <div class="body">
      <EmptyState :term="terms[game]" :game="games[game]">
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
    </div>
  </main>
</template>

<style scoped>
.body {
  display: flex;
  flex-grow: 1;
  align-items: center;
  justify-content: center;
  padding: 32px var(--gutter);
  overflow-y: auto;
}
</style>
