import { defineConfig } from 'vitest/config';
import { viteConfig } from './build/vite';

export default defineConfig(() => viteConfig(process.env));
