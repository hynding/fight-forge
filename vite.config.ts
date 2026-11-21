import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // A sub-path when served as a GitHub Pages project site (set by the deploy workflow).
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
})
