<script setup lang="ts">
// Presentational: names the backup a restore's confirmation is restoring from, beside
// the screen's title.
defineProps<{ name: string }>()
</script>

<template>
  <span class="source"
    >Restoring from <span class="name">{{ name }}</span></span
  >
</template>

<style scoped>
.source {
  max-width: 100%;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--selected);
  color: var(--text-secondary);
  font-size: 13px;
  overflow-wrap: anywhere;
}
.name {
  color: var(--text-soft);
}
</style>
