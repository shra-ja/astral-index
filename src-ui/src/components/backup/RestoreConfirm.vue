<script setup lang="ts">
// Presentational: the restore confirmation, in place of the Backup & Restore screen's
// content, as the Import review is. It sets the checked backup beside the current
// history and reports the user's choice; the caller makes the native calls, and both
// buttons wait while it restores.
import { ShieldCheck } from '@lucide/vue'
import { computed, onMounted, useTemplateRef, type DeepReadonly } from 'vue'
import type { CheckedBackup } from '../../commands'
import { holdsAccount } from '../../format'
import { restoreSummary } from '../../messages'
import ContentsPanel from './ContentsPanel.vue'

const props = defineProps<{ checked: DeepReadonly<CheckedBackup>; restoring: boolean }>()
const emit = defineEmits<{ cancel: []; restore: [] }>()

const replacing = computed(() => props.checked.current.accounts.length > 0)
const missing = computed(() =>
  props.checked.current.accounts.some((account) => !holdsAccount(props.checked.backup, account)),
)

// The confirmation takes focus as it appears, so screen readers announce it.
const intro = useTemplateRef('intro')
onMounted(() => intro.value!.focus())
</script>

<template>
  <div class="restore-confirm">
    <div class="body">
      <p ref="intro" class="intro" tabindex="-1">
        The backup passed its checks. Compare it with your current history, then restore it to make
        it your history.
      </p>
      <div class="panels">
        <ContentsPanel
          id="in-backup"
          title="In the Backup"
          tag="Becomes your history"
          empty="This backup holds no history."
          :contents="checked.backup"
          accent
        />
        <ContentsPanel
          id="in-current"
          title="Your Current History"
          tag="Kept as a safety copy"
          empty="No history is saved on this device yet, so nothing is replaced."
          :contents="checked.current"
          :compared="checked.backup"
        />
      </div>
      <p v-if="replacing" class="safety">
        <ShieldCheck :size="18" :stroke-width="1.75" />
        <span
          >Before anything is replaced, your current history is copied to a safety copy in the data
          folder, named with the date and time.<template v-if="missing">
            Accounts not in the backup keep their rolls there.</template
          ></span
        >
      </p>
    </div>
    <footer class="actions">
      <span class="footnote">{{ restoreSummary(checked.current, checked.backup) }}</span>
      <div class="buttons">
        <button type="button" class="secondary" :disabled="restoring" @click="emit('cancel')">
          Cancel
        </button>
        <button type="button" :disabled="restoring" @click="emit('restore')">
          {{ restoring ? 'Restoring…' : 'Restore backup' }}
        </button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.restore-confirm {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-height: 0;
}
.body {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 20px;
  min-height: 0;
  padding: clamp(20px, 3vh, 32px) var(--content-pad);
  overflow-y: auto;
}
.body > * {
  flex-shrink: 0;
}
.intro {
  margin: 0;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.5;
}
/* The intro takes focus only so it is announced; it is not a control. */
.intro:focus {
  outline: none;
}
.panels {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
  gap: 16px;
}
.safety {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 0;
  padding: 14px 18px;
  border: 1px solid var(--divider);
  border-radius: 12px;
  color: var(--text-soft);
  font-size: 14px;
  line-height: 1.5;
}
.safety svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--accent);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px 24px;
  min-height: 76px;
  padding: 14px var(--content-pad);
  border-top: 1px solid var(--divider);
  background: #0d1014;
}
.footnote {
  color: var(--text-secondary);
  font-size: 14px;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
</style>
