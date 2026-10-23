<script setup lang="ts">
// Presentational: the rounded tile a card's icon sits in, hidden from screen readers
// since the card's heading says the same. Its tone matches the card: neutral,
// accented, or an error.
withDefaults(defineProps<{ tone?: 'neutral' | 'accent' | 'error' }>(), { tone: 'neutral' })
</script>

<template>
  <span class="icon-tile" :class="tone" aria-hidden="true">
    <slot />
  </span>
</template>

<style scoped>
.icon-tile {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
}
.neutral {
  background: var(--panel-rim);
  color: var(--text-soft);
}
.accent {
  background: var(--accent-tint);
  color: var(--accent);
}
.error {
  background: var(--error-tint);
  color: var(--error);
}
</style>
