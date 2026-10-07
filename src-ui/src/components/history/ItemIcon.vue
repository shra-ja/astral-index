<script setup lang="ts">
// Presentational: an item's placeholder icon, its initials in its rarity's colours,
// until real icons come from the banner catalogue (decision 0022). Decorative: the
// item's name is always given as text beside or around it.
import { initials } from '../../format'

withDefaults(defineProps<{ name: string; rarity: string; size?: 'row' | 'tile' }>(), {
  size: 'row',
})
</script>

<template>
  <span class="icon" :class="[size, `rarity-${rarity}`]" aria-hidden="true">{{
    initials(name)
  }}</span>
</template>

<style scoped>
.icon {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  border: 1px solid var(--rarity-ring);
  background: var(--rarity-icon);
  color: var(--rarity);
  font-weight: 700;
}
/* Corners keep about 0.27 of the size (decision 0013). */
.row {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  font-size: 11px;
}
.tile {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  font-size: 13px;
}
.rarity-5 {
  --rarity: var(--rarity-five);
  --rarity-icon: #3a2c14;
  --rarity-ring: #6b5124;
}
.rarity-4 {
  --rarity: var(--rarity-four);
  --rarity-icon: #2a2346;
  --rarity-ring: #463a72;
}
.rarity-3 {
  --rarity: var(--rarity-three);
  --rarity-icon: #1c2834;
  --rarity-ring: #2a3a4a;
}
</style>
