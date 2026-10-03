<script setup lang="ts">
// Presentational: where rolls can come from. Retrieval is offered by searching this
// device or from a chosen cache file; file import is coming soon. Reports the choice;
// the caller runs retrieval. A note about the last retrieval can be shown above.
import { useTemplateRef } from 'vue'
import type { Source } from '../../composables/useRetrieval'
import CachePicker from '../shared/CachePicker.vue'

defineProps<{ term: string; game: string; available: boolean; note?: string }>()
const emit = defineEmits<{ search: []; choose: [file: File] }>()
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
      <p>Choose where the rolls come from. You will see a summary before anything is saved.</p>
    </div>
    <p v-if="note" class="note" role="status">{{ note }}</p>

    <div class="sources">
      <section class="source" aria-labelledby="source-retrieve">
        <div class="icon accent" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path
              d="M6.5 16.5H6a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 16.2 7.6 4.5 4.5 0 0 1 16 16.5h-.5"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
            />
            <path
              d="M11 10.5v8m0 0 2.8-2.8M11 18.5l-2.8-2.8"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <h3 id="source-retrieve">Retrieve from HoYoverse</h3>
        <p>
          Finds the {{ term.toLowerCase() }} history link in the game’s local files, then downloads
          your full history from HoYoverse.
        </p>
        <ul>
          <li>
            Open your {{ term.toLowerCase() }} history in the game first, so the link is fresh
          </li>
          <li>Needs an internet connection; runs only when you click</li>
          <li>Long histories can take a few minutes</li>
        </ul>
        <div class="actions">
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
        </div>
      </section>

      <section class="source" aria-labelledby="source-file">
        <div class="icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path
              d="M12.5 2.75H6.25a1.5 1.5 0 0 0-1.5 1.5v13.5a1.5 1.5 0 0 0 1.5 1.5h9.5a1.5 1.5 0 0 0 1.5-1.5V7.5L12.5 2.75Z"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linejoin="round"
            />
            <path
              d="M12.5 2.75V7.5h4.75M8.5 12.5h5M8.5 15.5h3.5"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <h3 id="source-file">Import from a file</h3>
        <p>Load an export from another tracker or a Roll Tracker backup.</p>
        <ul>
          <li>UIGF v4 JSON files</li>
          <li>Read on this device; nothing is sent anywhere</li>
          <li>Rolls you already have are skipped</li>
        </ul>
        <div class="actions">
          <button type="button" class="secondary" disabled aria-describedby="file-import-soon">
            Choose file…
          </button>
          <p id="file-import-soon" class="hint">Coming soon</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.start {
  display: flex;
  flex-direction: column;
  gap: 28px;
  max-width: 1200px;
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
.intro p,
.source > p {
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
.source {
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
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.actions > button {
  align-self: flex-start;
}
.hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.45;
}
</style>
