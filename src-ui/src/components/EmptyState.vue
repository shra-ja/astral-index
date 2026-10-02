<script setup lang="ts">
// Presentational: what a History screen shows while no history is saved. The caller
// supplies the action, such as a link to the Import screen.
defineProps<{ term: string; game: string }>()
</script>

<template>
  <div class="empty" role="status" aria-live="polite" aria-atomic="true">
    <span class="empty-icon" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path
          d="M5 8h18M5 14h18M5 20h10"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        />
      </svg>
    </span>
    <h2>No {{ term }} History Yet</h2>
    <p>
      Import your {{ game }} history to see every {{ term.toLowerCase() }} here. Nothing is
      downloaded until you choose to retrieve it.
    </p>
    <slot />
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 440px;
  text-align: center;
}
.empty-icon {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border: 1px solid var(--panel-rim);
  border-radius: 16px;
  background: var(--panel);
  color: var(--text-muted);
}
h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.55;
}
</style>
