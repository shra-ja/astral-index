<script setup lang="ts">
// The Backup & Restore screen: saving a backup of everything saved, choosing one to
// restore, and where history is stored. A backup holds every game's history, so the
// screen names no game (decision 0031). A checked backup's confirmation replaces the
// screen's content until it is cancelled, and is still shown on return.
import { computed, inject, onMounted, useTemplateRef, watch } from 'vue'
import BackupCard from '../components/backup/BackupCard.vue'
import RestoreCard from '../components/backup/RestoreCard.vue'
import RestoreConfirm from '../components/backup/RestoreConfirm.vue'
import DataFolder from '../components/shared/DataFolder.vue'
import ScreenHeader from '../components/layout/ScreenHeader.vue'
import { useDataFolder } from '../composables/useDataFolder'
import { useBackup } from '../composables/useBackup'
import { restoreKey } from '../composables/restore'

const { state, name, message, save } = useBackup()
const { info, read, revealFailed, load, reveal } = useDataFolder()
onMounted(load)

const restore = inject(restoreKey)!
const checked = computed(() =>
  restore.state.value === 'confirming' ? restore.checked.value : null,
)
// Closing the confirmation returns focus to the button that chose the backup.
const restoreCard = useTemplateRef('restoreCard')
watch(
  checked,
  (now, before) => {
    if (before && !now) restoreCard.value!.focus()
  },
  { flush: 'post' },
)
</script>

<template>
  <main>
    <ScreenHeader :title="checked ? 'Restore Backup' : 'Backup & Restore'">
      <span v-if="checked" class="source"
        >Restoring from <span class="name">{{ checked.name }}</span></span
      >
    </ScreenHeader>
    <RestoreConfirm v-if="checked" :checked @cancel="restore.cancel" />
    <div v-else class="backup">
      <div class="intro">
        <h2>Keep Your History Safe</h2>
        <p>Save a copy of your saved history to restore later or on another computer.</p>
      </div>
      <div class="cards">
        <BackupCard :state :name :message @save="save" />
        <RestoreCard
          ref="restoreCard"
          :state="restore.state.value"
          :message="restore.message.value"
          @choose="restore.choose"
        />
      </div>
      <section class="location" aria-labelledby="backup-location">
        <h2 id="backup-location">Saved History</h2>
        <DataFolder :path="info?.file ?? null" :read :failed="revealFailed" @reveal="reveal" />
      </section>
    </div>
  </main>
</template>

<style scoped>
.backup {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 28px;
  min-height: 0;
  padding: clamp(24px, 4vh, 40px) var(--content-pad);
  overflow-y: auto;
}
.intro {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.source {
  max-width: 100%;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--selected);
  color: var(--text-secondary);
  font-size: 13px;
  overflow-wrap: anywhere;
}
.source .name {
  color: var(--text-soft);
}
h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.intro p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.5;
}
.location {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
  gap: 20px;
}
</style>
