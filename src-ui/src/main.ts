// The typeface is bundled with the app, never fetched (decision 0013).
import '@fontsource-variable/hanken-grotesk'
import './assets/main.css'
import { createApp } from 'vue'
import App from './App.vue'
import router, { guardHistory } from './router'
import { availabilityKey, useHistoryAvailability } from './composables/useHistoryAvailability'

// Whether the history can be used, asked before the first screen shows (feature 0037).
const availability = useHistoryAvailability()
guardHistory(availability)
createApp(App).provide(availabilityKey, availability).use(router).mount('#app')
