<script setup lang="ts">
// Presentational: the Backup card. Asks for a backup with an event; the caller saves
// it and reports how it went, which a status region announces.
import { CircleAlert, Check, DatabaseBackup } from '@lucide/vue'
import type { BackupState } from '../../composables/useBackup'

defineProps<{ state: BackupState; name?: string | null; message?: string | null }>()
const emit = defineEmits<{ save: [] }>()
</script>

<template>
  <section class="card" aria-labelledby="backup-title">
    <div class="icon accent" aria-hidden="true">
      <DatabaseBackup :size="22" :stroke-width="1.75" />
    </div>
    <h3 id="backup-title">Backup</h3>
    <p>Save a copy of all your saved history to a file you choose.</p>
    <ul>
      <li>Every account, roll and import in one file</li>
      <li>Restore it here or on another computer</li>
      <li>Written on this device; nothing is sent anywhere</li>
    </ul>
    <div class="actions">
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
    </div>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 28px;
  border: 1px solid var(--rim);
  border-radius: 14px;
  background: var(--panel);
}
.icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--panel-rim);
  color: var(--text-soft);
}
.icon.accent {
  background: var(--accent-tint);
  color: var(--accent);
}
h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.card > p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.5;
}
ul {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding-left: 20px;
  color: var(--text-soft);
  font-size: 14px;
  line-height: 1.45;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: auto;
}
.actions > button {
  align-self: flex-start;
}
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
