import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './'        → relative asset URLs, safe under Cloudflare Pages project-root hosting.
// build.assetsInlineLimit 0 → nothing is base64-inlined; self-hosted fonts.css + WOFF2 stay
//                             addressable files (committed TYPEFACES decision, ui1-typefaces.md).
//                             Root-level spelling not accepted by Vite 8 types — build.* is canonical.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    assetsInlineLimit: 0,
  },
})
