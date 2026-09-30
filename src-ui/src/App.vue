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
