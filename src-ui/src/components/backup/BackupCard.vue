<script setup lang="ts">
// Presentational: the Backup card. Asks for a backup with an event; the caller saves
// it and reports how it went, which a status region announces.
import { CircleAlert, Check, DatabaseBackup } from '@lucide/vue'
import type { BackupState } from '../../composables/useBackup'
import ActionCard from '../shared/ActionCard.vue'

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
      <div class="status" role="status">
        <p v-if="state === 'saved'" class="saved">
          <Check :size="16" :stroke-width="2" />
          <span
            >Saved <span class="name">{{ name }}</span></span
          >
        </p>
        <p v-else-if="state === 'failed'" class="failed">
          <CircleAlert :size="16" :stroke-width="1.75" />
          <span>{{ message }}</span>
        </p>
      </div>
    </template>
  </ActionCard>
</template>

<style scoped>
.status {
  min-height: 20px;
}
.status p {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
}
.status svg {
  flex-shrink: 0;
  margin-top: 1px;
}
.saved {
  color: var(--text-secondary);
}
.saved svg {
  color: var(--accent);
}
.name {
  color: var(--text-soft);
  overflow-wrap: anywhere;
}
.failed {
  color: var(--error);
}
</style>
