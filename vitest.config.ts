import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    environmentMatchGlobs: [['test/**/*.component.test.ts', 'happy-dom']],
  },
})
