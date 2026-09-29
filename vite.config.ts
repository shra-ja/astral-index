import { defineConfig } from 'vitest/config';
import { viteConfig } from './scripts/vite-config';

export default defineConfig(() => viteConfig(process.env));
