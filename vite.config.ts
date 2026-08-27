import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    // Vite 8 minifies CSS with lightningcss. Given a rule that already
    // contains both `backdrop-filter` and `-webkit-backdrop-filter`,
    // lightningcss collapses them to the `-webkit-` form only — but current
    // Chrome/Firefox have dropped the `-webkit-backdrop-filter` alias, so the
    // glass blur disappears in the production build (panels look transparent).
    // Fix: author only the standard `backdrop-filter` in glass.css and let
    // lightningcss add the `-webkit-` prefix here. Targeting an old Safari
    // makes it emit BOTH properties, so every browser keeps the blur.
    transformer: 'lightningcss',
    lightningcss: {
      targets: {
        safari: 13 << 16,
        chrome: 87 << 16,
        firefox: 103 << 16,
        edge: 88 << 16,
      },
    },
  },
  build: {
    cssMinify: 'lightningcss',
  },
})
