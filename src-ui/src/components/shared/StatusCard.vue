<script setup lang="ts">
// Presentational: a card that holds a screen's whole status, such as a retrieval's
// progress, why it failed or what a save added, in the middle of the screen. The
// caller names it and gives its role; a short result is narrower, centred within.
defineProps<{ result?: boolean }>()
</script>

<template>
  <section class="status-card" :class="{ result }">
    <slot />
  </section>
</template>

<style scoped>
.status-card {
  display: flex;
  flex-direction: column;
  gap: 22px;
  width: 100%;
  max-width: 640px;
  /* In the middle of the screen, across and down. */
  margin: auto;
  padding: 32px;
  border: 1px solid var(--rim);
  border-radius: 14px;
  background: var(--panel);
}
.result {
  align-items: center;
  gap: 18px;
  max-width: 520px;
  padding: 36px;
  text-align: center;
}
</style>
