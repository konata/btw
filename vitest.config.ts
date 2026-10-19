import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@deepseek-ai/dsh-client-ui-primitives': fileURLToPath(new URL('./tests/primitives.tsx', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
  },
})
