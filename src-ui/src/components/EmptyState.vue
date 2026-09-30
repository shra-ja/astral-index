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
