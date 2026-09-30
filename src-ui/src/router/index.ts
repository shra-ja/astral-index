import { createRouter, createWebHashHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';

// Hash history needs no server fallback under Tauri's custom protocol, and no one
// sees the URL (decision 0011).
const router = createRouter({
  history: createWebHashHistory(),
  routes: [{ path: '/', name: 'home', component: HomeView }],
});

export default router;
