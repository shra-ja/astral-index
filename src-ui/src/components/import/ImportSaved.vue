<script setup lang="ts">
// Presentational: what a save added. The caller supplies the link to the history;
// Done returns to the start. The heading takes focus so the result is announced.
import { onMounted, useTemplateRef } from 'vue'
import type { Counts } from '../../commands'
import { savedDetail, savedTitle } from '../../messages'

defineProps<{
  saved: { summary: Counts; fiveStar: number; fourStar: number; uid: string; server: string }
}>()
const emit = defineEmits<{ done: [] }>()
const heading = useTemplateRef('heading')
onMounted(() => heading.value!.focus())
</script>

<template>
  <section class="saved" aria-labelledby="saved-heading">
    <span class="icon" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path
          d="m8 14.5 4 4 8-9"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </span>
    <h2 id="saved-heading" ref="heading" tabindex="-1">{{ savedTitle(saved) }}</h2>
    <p>{{ savedDetail(saved) }}</p>
    <div class="stats">
      <div class="stat five">
        <span class="stat-value">{{ saved.fiveStar.toLocaleString('en') }}</span>
        <span class="stat-label">New 5★</span>
      </div>
      <div class="stat four">
        <span class="stat-value">{{ saved.fourStar.toLocaleString('en') }}</span>
        <span class="stat-label">New 4★</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ saved.summary.duplicates.toLocaleString('en') }}</span>
        <span class="stat-label">Existing rolls skipped</span>
      </div>
    </div>
    <div class="buttons">
      <slot />
      <button type="button" class="secondary" @click="emit('done')">Done</button>
    </div>
  </section>
</template>

<style scoped>
.saved {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  width: 100%;
  max-width: 520px;
  margin: auto;
  padding: 36px;
  border: 1px solid var(--rim);
  border-radius: 14px;
  background: var(--panel);
  text-align: center;
}
.icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--accent-tint);
  color: var(--accent);
}
h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
/* The heading takes focus only so it is announced; it is not a control. */
h2:focus {
  outline: none;
}
p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
}
.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  width: 100%;
  border: 1px solid var(--panel-rim);
  border-radius: 10px;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px;
}
.stat + .stat {
  border-left: 1px solid var(--panel-rim);
}
.stat-value {
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}
.five .stat-value {
  color: var(--rarity-five);
}
.four .stat-value {
  color: var(--rarity-four);
}
.stat-label {
  color: var(--text-muted);
  font-size: 12px;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}
</style>
