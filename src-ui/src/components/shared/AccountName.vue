<script setup lang="ts">
// Presentational: an account's UID and server, as the account chip and the
// switcher's button show it. Hidden from assistive technology, as each names the
// account in its own label. Its parts take their place in the holder's row.
import { serverName } from '../../format'

defineProps<{ uid: string; server: string }>()
</script>

<template>
  <span class="name">
    <span class="label" aria-hidden="true">UID</span>
    <span class="uid" aria-hidden="true">{{ uid }}</span>
    <span class="server" aria-hidden="true">{{ serverName(server) }}</span>
  </span>
</template>

<style scoped>
.name {
  display: contents;
}
.label {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
}
.uid {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.server {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--panel-rim);
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
}
</style>
