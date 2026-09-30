<script setup lang="ts">
// Presentational: what the collection shows while no history is displayed.
defineProps<{ game: string }>();
</script>

<template>
  <div class="empty" role="status" aria-live="polite" aria-atomic="true">
    <span class="empty-icon" aria-hidden="true">✧</span>
    <h2>No {{ game }} rolls yet</h2>
    <p>Showing saved history is coming next.</p>
    <p class="detail">Your history will stay on this device. No account needed.</p>
  </div>
</template>

<style scoped>
.empty { text-align: center; padding: 48px 24px 56px; }
.empty-icon { display: inline-grid; place-items: center; width: 64px; height: 64px; border-radius: 18px; background: #2c382d; color: #d3c48e; font-size: 42px; }
h2 { font-size: 21px; font-weight: 550; margin-top: 24px; }
p { color: #c6cfc7; line-height: 1.5; }
.detail { color: #adb7af; font-size: 14px; }
</style>
