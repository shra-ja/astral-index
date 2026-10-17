<script setup lang="ts">
// The Backup & Restore screen: saving a backup of everything saved, and where
// history is stored. A backup holds every game's history, so the screen names no
// game (decision 0031). Restore and UIGF export join it in later work.
import { onMounted } from 'vue'
import BackupCard from '../components/backup/BackupCard.vue'
import DataFolder from '../components/shared/DataFolder.vue'
import ScreenHeader from '../components/layout/ScreenHeader.vue'
import { useDataFolder } from '../composables/useDataFolder'
import { useBackup } from '../composables/useBackup'

const { state, name, message, save } = useBackup()
const { info, read, revealFailed, load, reveal } = useDataFolder()
onMounted(load)
</script>

<template>
  <main>
    <ScreenHeader title="Backup & Restore" />
    <div class="backup">
      <div class="intro">
        <h2>Keep Your History Safe</h2>
        <p>Save a copy of your saved history to restore later or on another computer.</p>
      </div>
      <div class="cards">
        <BackupCard :state :name :message @save="save" />
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
/* Room for Restore and UIGF export beside Backup as they arrive. */
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
