import { defineConfig } from 'vitest/config'
import { viteConfig } from './build/vite.ts'

export default defineConfig(({ mode }) => viteConfig(process.env, mode))
