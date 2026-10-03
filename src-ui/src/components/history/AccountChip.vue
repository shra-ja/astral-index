<script setup lang="ts">
// Presentational: the account whose history is shown. Text for now; it becomes the
// account switcher once more than one account can be shown (milestone 4).
import { serverName } from '../../format'

defineProps<{ uid: string; server: string }>()
</script>

<template>
  <div
    class="account"
    role="group"
    :aria-label="`Account: UID ${uid}, ${serverName(server)} server`"
  >
    <span class="label" aria-hidden="true">UID</span>
    <span class="uid" aria-hidden="true">{{ uid }}</span>
    <span class="server" aria-hidden="true">{{ serverName(server) }}</span>
  </div>
</template>

<style scoped>
.account {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--rim);
  border-radius: 8px;
  background: var(--panel);
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
}
</style>
