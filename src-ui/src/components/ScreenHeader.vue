<script setup lang="ts">
// Presentational: a screen's title and game, with room for the screen's own controls.
defineProps<{ title: string; game: string }>()
</script>

<template>
  <header class="screen-header">
    <div class="titles">
      <h1>{{ title }}</h1>
      <span class="game">{{ game }}</span>
    </div>
    <slot />
  </header>
</template>

<style scoped>
.screen-header {
  display: flex;
  flex-wrap: wrap;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  min-height: 72px;
  padding: 12px var(--gutter);
  border-bottom: 1px solid var(--divider);
}
.titles {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
}
h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.game {
  color: var(--text-muted);
  font-size: 14px;
}
</style>
