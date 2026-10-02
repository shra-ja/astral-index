// The typeface is bundled with the app, never fetched (decision 0013).
import '@fontsource-variable/hanken-grotesk'
import './assets/main.css'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

createApp(App).use(router).mount('#app')
