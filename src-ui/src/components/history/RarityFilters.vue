<script setup lang="ts">
// Presentational: the rolls panel's rarity filters, one toggle per rarity, pressed
// while that rarity is shown. Filters hide rolls across the whole category; the
// screen reads the rolls that match.
import type { Rarity } from '../../commands'

defineProps<{ shown: readonly Rarity[] }>()
const emit = defineEmits<{ toggle: [rarity: Rarity] }>()

const rarities: Rarity[] = ['5', '4', '3']
</script>

<template>
  <div class="filters" role="group" aria-label="Show rarities">
    <span class="lead" aria-hidden="true">Show</span>
    <button
      v-for="rarity in rarities"
      :key="rarity"
      type="button"
      :class="`rarity-${rarity}`"
      :aria-pressed="shown.includes(rarity)"
      @click="emit('toggle', rarity)"
    >
      {{ rarity }}★
    </button>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  align-items: center;
  gap: 8px;
}
.lead {
  margin-right: 4px;
  color: var(--text-muted);
  font-size: 13px;
}
button {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--rim);
  border-radius: 9px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.rarity-5 {
  --rarity: var(--rarity-five);
}
.rarity-4 {
  --rarity: var(--rarity-four);
}
.rarity-3 {
  --rarity: var(--rarity-three);
}
button[aria-pressed='true'] {
  border-color: var(--rarity);
  background: color-mix(in srgb, var(--rarity) 12%, transparent);
  color: var(--rarity);
}
</style>
