<script setup lang="ts">
// Presentational: a rarity as a pill in its colour, read as text ("5★"), so rarity is
// never shown by colour alone (decision 0013).
defineProps<{ rarity: string }>()
</script>

<template>
  <span class="badge" :class="`rarity-${rarity}`">{{ rarity }}★</span>
</template>

<style scoped>
.badge {
  display: inline-block;
  min-width: 24px;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--rarity) 16%, transparent);
  color: var(--rarity);
  font-size: 12px;
  font-weight: 600;
  text-align: center;
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
</style>
