<script setup lang="ts">
// The app shell: the sidebar beside the current screen, and the About dialog over
// it. It owns the retrieval flow, so a retrieval keeps running while another screen
// is shown.
import { computed, provide, shallowRef } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AboutDialog from './components/about/AboutDialog.vue'
import AppSidebar from './components/layout/AppSidebar.vue'
import { useAbout } from './composables/useAbout'
import SizeOverlay from './components/layout/SizeOverlay.vue'
import { retrievalKey } from './composables/retrieval'
import { useRetrieval } from './composables/useRetrieval'
import { useWindowSize } from './composables/useWindowSize'
import { sizeOverlayRequested } from './dev-options'
import { games } from './features'
import type { Game, Screen } from './format'

provide(retrievalKey, useRetrieval())
const route = useRoute()
const game = computed(() => route.params.game as Game)
const screen = computed(() => route.name as Screen)
// A debug build opened with ASTRAL_INDEX_SIZE_OVERLAY=1 shows the window's size.
const size = sizeOverlayRequested() ? useWindowSize() : null

// The About dialog reads the details afresh each time it opens, and focus returns to
// whatever opened it when it closes.
const about = useAbout()
const aboutOpen = shallowRef(false)
let opener: HTMLElement | null = null
function openAbout() {
  opener = document.activeElement as HTMLElement | null
  about.reset()
  void about.load()
  aboutOpen.value = true
}
function closeAbout() {
  aboutOpen.value = false
  opener?.focus()
}
</script>

<template>
  <div class="app">
    <!-- Shown once the router has resolved the first screen. -->
    <AppSidebar v-if="route.name" :game :screen :games @about="openAbout" />
    <RouterView />
    <AboutDialog
      v-if="aboutOpen"
      :info="about.info.value"
      :failed="about.failed.value"
      :notices="about.notices.value"
      :notices-missing="about.noticesMissing.value"
      @close="closeAbout"
      @reveal="about.revealFolder"
      @issues="about.openIssues"
      @notices="about.showNotices"
    />
    <SizeOverlay v-if="size" v-bind="size" />
  </div>
</template>

<style scoped>
.app {
  container: app / inline-size;
  display: flex;
  min-width: 480px;
  height: 100vh;
  min-height: 560px;
  overflow: hidden;
}
</style>
