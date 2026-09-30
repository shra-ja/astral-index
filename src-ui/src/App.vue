<script setup lang="ts">
// The app shell: the header and footer around the current view.
import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
  <header>
    <RouterLink class="wordmark" to="/">ROLL TRACKER</RouterLink>
    <span class="local-app"><span aria-hidden="true">●</span> Local app</span>
  </header>
  <main>
    <RouterView />
  </main>
  <footer>Made for your collection. No cloud required.</footer>
</template>

<style scoped>
header { display: flex; justify-content: space-between; align-items: center; gap: 24px; }
.wordmark { color: inherit; font-size: 13px; font-weight: 750; letter-spacing: .16em; text-decoration: none; }
.local-app { color: #b7d5bd; font-size: 13px; border: 1px solid #3d5145; border-radius: 20px; padding: 7px 12px; }
.local-app span { font-size: 9px; margin-right: 6px; }
footer { color: #adb7af; font-size: 12px; margin: 24px 0; }
</style>
