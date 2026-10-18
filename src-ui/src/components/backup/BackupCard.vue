<script setup lang="ts">
// Presentational: the Backup card. Asks for a backup with an event; the caller saves
// it and reports how it went, which a status region announces.
import { DatabaseBackup } from '@lucide/vue'
import type { BackupState } from '../../composables/useBackup'
import ActionCard from '../shared/ActionCard.vue'
import StatusLine from '../shared/StatusLine.vue'

defineProps<{ state: BackupState; name?: string | null; message?: string | null }>()
const emit = defineEmits<{ save: [] }>()
</script>

<template>
  <ActionCard
    id="backup-title"
    title="Backup"
    text="Save a copy of all your saved history to a file you choose."
    :points="[
      'Every account, roll and import in one file',
      'Restore it here or on another computer',
      'Written on this device; nothing is sent anywhere',
    ]"
    accent
  >
    <template #icon><DatabaseBackup :size="22" :stroke-width="1.75" /></template>
    <template #actions>
      <button type="button" :disabled="state === 'saving'" @click="emit('save')">
        {{ state === 'saving' ? 'Saving backup…' : 'Save backup…' }}
      </button>
    </template>
    <template #status>
      <StatusLine v-if="state === 'saved'" tone="done"
        >Saved <span class="name">{{ name }}</span></StatusLine
      >
      <StatusLine v-else-if="state === 'failed'" tone="failed">{{ message }}</StatusLine>
    </template>
  </ActionCard>
</template>

<style scoped>
.name {
  color: var(--text-soft);
  overflow-wrap: anywhere;
}
</style>
