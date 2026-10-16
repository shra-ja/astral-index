<script setup lang="ts">
// Presentational: the About dialog's main view. The app's name, version and licence,
// what it is not, where its history is kept, and how to report a problem. Opening the
// folder or the issues page, and the other views, are asked for with events.
import { ChevronRight, ExternalLink } from '@lucide/vue'
import type { AppInfo } from '../../commands'
import type { Opening } from '../../composables/useAbout'
import type { Read } from '../../composables/useDataFolder'
import { openingFailures } from '../../messages'
import DataFolder from '../shared/DataFolder.vue'
import OpenLockup from '../shared/OpenLockup.vue'

defineProps<{ info: AppInfo | null; read: Read; failed: Opening | null }>()
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
      <DataFolder
        :path="info?.folder ?? null"
        :read
        :failed="failed === 'folder'"
        @reveal="emit('reveal')"
      />
      <p class="note">To back up the history, use Backup &amp; Restore.</p>
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
