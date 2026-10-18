<script setup lang="ts">
// The Backup & Restore screen: saving a backup of everything saved, choosing one to
// restore, and where history is stored. A backup holds every game's history, so the
// screen names no game (decision 0031). A checked backup's confirmation replaces the
// screen's content; leaving it, after the user agrees, cancels the restore.
import { onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import BackupCard from '../components/backup/BackupCard.vue'
import LeaveRestoreDialog from '../components/backup/LeaveRestoreDialog.vue'
import RestoreCard from '../components/backup/RestoreCard.vue'
import RestoreConfirm from '../components/backup/RestoreConfirm.vue'
import DataFolder from '../components/shared/DataFolder.vue'
import ScreenHeader from '../components/layout/ScreenHeader.vue'
import { useDataFolder } from '../composables/useDataFolder'
import { useBackup } from '../composables/useBackup'
import { useRestore } from '../composables/useRestore'

const { state, name, message, save } = useBackup()
const { info, read, revealFailed, load, reveal } = useDataFolder()
onMounted(load)

const restore = useRestore()
const { checked } = restore
// Closing the confirmation returns focus to the button that chose the backup.
const restoreCard = useTemplateRef('restoreCard')
watch(
  checked,
  (now, before) => {
    if (before && !now) restoreCard.value!.focus()
  },
  { flush: 'post' },
)

// Leaving while a backup is held asks first; leaving cancels the restore.
const asking = shallowRef<((leave: boolean) => void) | null>(null)
onBeforeRouteLeave(() =>
  checked.value ? new Promise<boolean>((resolve) => (asking.value = resolve)) : true,
)
async function answer(leave: boolean) {
  const resolve = asking.value!
  asking.value = null
  if (leave) await restore.cancel()
  resolve(leave)
}
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
          :checking="restore.checking.value"
          :message="restore.message.value"
          @choose="restore.choose"
        />
      </div>
      <section class="location" aria-labelledby="backup-location">
        <h2 id="backup-location">Saved History</h2>
        <DataFolder :path="info?.file ?? null" :read :failed="revealFailed" @reveal="reveal" />
      </section>
    </div>
    <LeaveRestoreDialog v-if="asking" @stay="answer(false)" @leave="answer(true)" />
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
