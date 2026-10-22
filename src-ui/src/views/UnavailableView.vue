<script setup lang="ts">
// The History Unavailable screen, shown in place of the game screens while the
// history can't be used because it failed to upgrade (feature 0037). Its card
// names the copy kept first and restores a backup: a checked backup's confirmation
// replaces the card as it does on Backup & Restore, and once restored the history
// can be used again and Backup & Restore says how it went.
import { inject, shallowRef, useTemplateRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import LeaveRestoreDialog from '../components/backup/LeaveRestoreDialog.vue'
import RestoreConfirm from '../components/backup/RestoreConfirm.vue'
import ScreenHeader from '../components/layout/ScreenHeader.vue'
import UnavailableCard from '../components/unavailable/UnavailableCard.vue'
import { useAbout } from '../composables/useAbout'
import { availabilityKey } from '../composables/useHistoryAvailability'
import { useRestore } from '../composables/useRestore'
import { useRestoreLeaving } from '../composables/useRestoreLeaving'
import { unavailableOpeningFailures } from '../messages'

const availability = inject(availabilityKey)!
const about = useAbout()
const restore = useRestore({ onRestored: availability.restored })
const { checked, restoring } = restore
const { asking, answer } = useRestoreLeaving(restore)
const router = useRouter()

// Closing the confirmation returns focus to the button that chose the backup.
const card = useTemplateRef('card')
watch(
  checked,
  (now, before) => {
    if (before && !now && restore.outcome.value?.kind !== 'restored') card.value!.focus()
  },
  { flush: 'post' },
)
// Once restored, Backup & Restore says how it went.
watch(restore.outcome, (outcome) => {
  if (outcome?.kind !== 'restored') return
  availability.handOver(outcome)
  void router.push({ name: 'backup' })
})
// The card's status line: why the last backup wasn't restored, or the last opening
// that failed, whichever happened last.
const failure = shallowRef<string | null>(null)
watch(restore.outcome, (outcome) => {
  failure.value = outcome?.kind === 'failed' ? outcome.message : null
})
watch(about.failed, (opening) => {
  failure.value = opening ? unavailableOpeningFailures[opening] : null
})
</script>

<template>
  <main>
    <ScreenHeader :title="checked ? 'Restore Backup' : 'History Unavailable'">
      <span v-if="checked" class="source"
        >Restoring from <span class="name">{{ checked.name }}</span></span
      >
    </ScreenHeader>
    <RestoreConfirm
      v-if="checked"
      :checked
      :restoring
      @cancel="restore.cancel"
      @restore="restore.confirm"
    />
    <!-- Kept while hidden, so its heading takes focus only when the screen opens. -->
    <div v-show="!checked" class="unavailable-screen">
      <UnavailableCard
        ref="card"
        :copy="availability.unavailable.value?.copy ?? null"
        :checking="restore.checking.value"
        :failure
        @reveal="about.revealFolder"
        @report="about.openIssues"
        @restore="restore.choose"
      />
    </div>
    <LeaveRestoreDialog v-if="asking" @stay="answer(false)" @leave="answer(true)" />
  </main>
</template>

<style scoped>
.unavailable-screen {
  display: flex;
  flex-grow: 1;
  min-height: 0;
  padding: 64px var(--content-pad);
  overflow-y: auto;
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
</style>
