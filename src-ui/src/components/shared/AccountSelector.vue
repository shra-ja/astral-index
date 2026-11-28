<script setup lang="ts">
// Presentational: the chosen account, as a switcher while more than one is saved and
// as text otherwise. It passes on the account chosen in the switcher.
import type { SavedAccount } from '../../commands'
import AccountChip from './AccountChip.vue'
import AccountSwitcher from './AccountSwitcher.vue'

defineProps<{
  accounts: SavedAccount[]
  current: { uid: string; server: string }
}>()
const emit = defineEmits<{ switch: [account: SavedAccount] }>()
</script>

<template>
  <AccountSwitcher v-if="accounts.length > 1" :accounts :current @switch="emit('switch', $event)" />
  <AccountChip v-else :uid="current.uid" :server="current.server" />
</template>
