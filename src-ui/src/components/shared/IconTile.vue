<script setup lang="ts">
// Presentational: the rounded tile a card's icon sits in, drawn at the tile's size
// and hidden from screen readers, since the card's heading says the same. Its tone
// matches the card: neutral, accented, or an error.
import type { Component } from 'vue'

withDefaults(defineProps<{ icon: Component; tone?: 'neutral' | 'accent' | 'error' }>(), {
  tone: 'neutral',
})
</script>

<template>
  <span class="icon-tile" :class="tone" aria-hidden="true">
    <component :is="icon" :size="22" :stroke-width="1.75" />
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
