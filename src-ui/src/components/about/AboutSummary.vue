<script setup lang="ts">
// Presentational: the About dialog's main view. The app's name, version and licence,
// what it is not, where its history is kept, and how to report a problem. Opening the
// folder or the issues page, and the other views, are asked for with events.
import { ChevronRight, ExternalLink, FolderOpen } from '@lucide/vue'
import type { AppInfo } from '../../commands'
import type { Opening } from '../../composables/useAbout'
import { openingFailures } from '../../messages'
import OpenLockup from '../shared/OpenLockup.vue'

defineProps<{ info: AppInfo | null; failed: Opening | null }>()
const emit = defineEmits<{ reveal: []; issues: []; licence: []; notices: [] }>()

// Which build this is, so a problem report can name it exactly (decision 0030). A
// local build's version means nothing, so it is left out.
function built({ version, build }: AppInfo) {
  if (build.kind === 'local') return 'Local build'
  return build.kind === 'dev'
    ? `Version ${version} · dev build ${build.commit}`
    : `Version ${version}`
}
</script>

<template>
  <div class="about-summary">
    <div class="identity">
      <OpenLockup />
      <p class="version">
        <template v-if="info">{{ built(info) }} · </template>MIT License
      </p>
    </div>

    <p class="disclaimer">
      Astral Index is not affiliated with or endorsed by HoYoverse; game names and trademarks belong
      to their owners. History is retrieved only when requested, and only from HoYoverse’s history
      service, with no telemetry. Statistics are calculated from saved rolls; keeping the history
      complete is up to the user.
    </p>

    <section aria-labelledby="about-data">
      <div class="heading">
        <h2 id="about-data">Saved History</h2>
        <span v-if="info?.folder" class="mode" :class="{ portable: info.portable }">
          {{ info.portable ? 'Portable mode' : 'App data folder' }}
        </span>
      </div>
      <div v-if="info?.folder" class="folder">
        <span class="path">{{ info.folder }}</span>
        <button type="button" class="secondary" @click="emit('reveal')">
          <FolderOpen :size="16" aria-hidden="true" />
          Show in Folder
        </button>
      </div>
      <p v-else class="note">No data folder is available on this device.</p>
      <p v-if="failed === 'folder'" class="failure" role="alert">{{ openingFailures.folder }}</p>
      <p class="note">
        To back up the history, close Astral Index and copy <code>history.sqlite</code> from this
        folder.
      </p>
    </section>

    <section aria-labelledby="about-reports">
      <div class="heading">
        <h2 id="about-reports">Problem Reports</h2>
        <button type="button" class="secondary" @click="emit('issues')">
          Issues Page
          <ExternalLink :size="14" aria-hidden="true" />
        </button>
      </div>
      <p v-if="failed === 'issues'" class="failure" role="alert">{{ openingFailures.issues }}</p>
      <p class="note">
        Provide the version and operating system; never include the warp history link, an account
        UID or the history database.
      </p>
    </section>

    <div class="more">
      <button type="button" class="secondary" @click="emit('licence')">
        Licence Text
        <ChevronRight :size="14" aria-hidden="true" />
      </button>
      <button type="button" class="secondary" @click="emit('notices')">
        Third-Party Notices
        <ChevronRight :size="14" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.about-summary {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
/* The lockup at the brand's about-screen size, H 40, shrinking to fit a narrow dialog
   but never below the regular set's H 26; it is 9.311 H wide. */
.identity {
  --h: max(26px, min(40px, 100cqi / 9.311));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.version {
  margin: 0;
  color: var(--text-muted);
  font-size: 14px;
  text-align: center;
}
.disclaimer {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.55;
}
section,
.more {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 18px;
  border-top: 1px solid var(--panel-rim);
}
.more {
  flex-direction: row;
  flex-wrap: wrap;
}
.heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}
h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.mode {
  padding: 3px 10px;
  border-radius: 999px;
  color: var(--text-secondary);
  background: var(--control);
  font-size: 12px;
  font-weight: 500;
}
.mode.portable {
  color: var(--accent);
  background: var(--accent-tint);
}
.folder {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.path {
  flex: 1 1 260px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--panel-rim);
  border-radius: 10px;
  background: var(--list);
  color: var(--text-soft);
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 13px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  user-select: text;
}
.about-summary button {
  font-size: 14px;
}
.note {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}
.failure {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  color: var(--error);
  background: var(--error-tint);
  font-size: 13px;
  line-height: 1.45;
}
</style>
