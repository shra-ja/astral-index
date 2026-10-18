<script setup lang="ts">
// Presentational: where rolls can come from. Retrieval is offered by searching this
// device or from a chosen cache file, asking for new rolls only or the full history
// (decision 0015); file import is coming soon. Reports the choices; the caller runs
// retrieval. A note about the last retrieval can be shown above, and the caller's
// content, such as the last import, below.
import { CloudDownload, FileText } from '@lucide/vue'
import { useTemplateRef } from 'vue'
import type { Mode } from '../../commands'
import type { Source } from '../../composables/useRetrieval'
import ActionCard from '../shared/ActionCard.vue'
import AppTooltip from '../shared/AppTooltip.vue'
import CachePicker from '../shared/CachePicker.vue'

defineProps<{ term: string; game: string; available: boolean; note?: string }>()
const emit = defineEmits<{ search: []; choose: [file: File] }>()
const mode = defineModel<Mode>('mode', { required: true })
const searchButton = useTemplateRef('searchButton')
const picker = useTemplateRef('picker')

defineExpose({
  /** Focus the control that started retrieval, once this is shown again. */
  focus: (source: Source) => (source === 'device' ? searchButton.value! : picker.value!).focus(),
})
</script>

<template>
  <div class="start">
    <div class="intro">
      <h2>Add {{ term }} History</h2>
      <p>
        Choose where to import roll history from. You will see a summary before anything is saved.
      </p>
    </div>
    <p v-if="note" class="note" role="status">{{ note }}</p>

    <div class="sources">
      <ActionCard
        id="source-retrieve"
        title="Retrieve from HoYoverse"
        :text="`Finds the ${term.toLowerCase()} history link in the game’s local files, then downloads your roll history from HoYoverse.`"
        :points="[
          `Open your ${term.toLowerCase()} history in the game first, so the link is fresh`,
          'Needs an internet connection to contact HoYoverse; runs only when you click',
          'Long histories can take a few minutes',
        ]"
        accent
      >
        <template #icon><CloudDownload :size="22" :stroke-width="1.75" /></template>
        <fieldset class="mode" aria-describedby="mode-hint">
          <!-- The options speak for themselves; screen readers still need the group's name. -->
          <legend class="visually-hidden">What to retrieve</legend>
          <div class="options">
            <label>
              <input
                v-model="mode"
                type="radio"
                name="retrieval-mode"
                value="new"
                :disabled="!available"
              />
              <span>New rolls only</span>
            </label>
            <label>
              <input
                v-model="mode"
                type="radio"
                name="retrieval-mode"
                value="full"
                :disabled="!available"
              />
              <span>Full history</span>
            </label>
          </div>
          <p id="mode-hint" class="hint">
            Select “Full history” to fill in earlier gaps of missing data.
          </p>
        </fieldset>
        <template #actions>
          <div class="buttons">
            <button ref="searchButton" type="button" :disabled="!available" @click="emit('search')">
              Retrieve history
            </button>
            <CachePicker
              id="cache-file"
              ref="picker"
              :disabled="!available"
              @choose="emit('choose', $event)"
            />
          </div>
          <p v-if="available" class="hint">
            If the game files can’t be found, choose its <code>data_2</code> cache file yourself.
          </p>
          <p v-else class="hint">Retrieval for {{ game }} is coming soon.</p>
        </template>
      </ActionCard>

      <ActionCard
        id="source-file"
        title="Import from a file"
        text="Load an export from another tracker."
        :points="[
          'UIGF v4 JSON files',
          'Read on this device; nothing is sent anywhere',
          'Rolls you already have are skipped',
        ]"
      >
        <template #icon><FileText :size="22" :stroke-width="1.75" /></template>
        <template #actions>
          <AppTooltip v-slot="{ tooltipId }" text="Importing from a file isn’t available yet.">
            <button
              type="button"
              class="secondary"
              aria-disabled="true"
              :aria-describedby="tooltipId"
            >
              Choose file…
            </button>
          </AppTooltip>
          <p class="hint">Coming soon</p>
        </template>
      </ActionCard>
    </div>
    <slot />
  </div>
</template>

<style scoped>
/* Two radios shown as a segmented control; the radios stay real for keyboards. */
.mode {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  border: 0;
}
.options {
  display: inline-flex;
  flex-wrap: wrap;
  align-self: flex-start;
  max-width: 100%;
  padding: 3px;
  border: 1px solid var(--rim);
  border-radius: 10px;
  background: var(--list);
}
.options label {
  position: relative;
  margin: 0;
  padding: 7px 14px;
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.options input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: inherit;
}
.options label:has(input:checked) {
  background: var(--control);
  color: var(--text);
}
.options label:has(input:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.options label:has(input:disabled) {
  opacity: 0.45;
  cursor: not-allowed;
}
.start {
  display: flex;
  flex-direction: column;
  gap: 28px;
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
.note {
  margin: 0;
  padding: 14px 18px;
  border: 1px solid var(--rim);
  border-radius: 12px;
  background: var(--panel);
  color: var(--text-soft);
  font-size: 14px;
}
.sources {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
  gap: 20px;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.45;
}
</style>
