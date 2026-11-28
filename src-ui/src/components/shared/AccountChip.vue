<script setup lang="ts">
// Presentational: the chosen account, as text, while it is the only saved account;
// with more, the account selector shows the account switcher instead.
import { serverName } from '../../format'
import AccountName from './AccountName.vue'

defineProps<{ uid: string; server: string }>()
</script>

<template>
  <div
    class="account"
    role="group"
    :aria-label="`Account: UID ${uid}, ${serverName(server)} server`"
  >
    <AccountName :uid :server />
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
</style>
