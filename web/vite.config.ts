import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// base './' keeps every asset URL relative, so the site works on GitHub Pages
// project pages (https://<user>.github.io/<repo>/) as well as on a custom domain.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
