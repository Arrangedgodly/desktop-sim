import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// base './'        → relative asset URLs, safe under Cloudflare Pages project-root hosting.
// build.assetsInlineLimit 0 → nothing is base64-inlined; self-hosted fonts.css + WOFF2 stay
//                             addressable files (committed TYPEFACES decision, ui1-typefaces.md).
//                             Root-level spelling not accepted by Vite 8 types — build.* is canonical.

/**
 * CA-1 — dev-only CSP relaxation (index.html ships the policy; see its
 * comment block and the CA-1 production-log entry for full justification).
 *
 * The production build keeps index.html's meta VERBATIM. The dev server
 * cannot live under it as-shipped: @vitejs/plugin-react injects its refresh
 * preamble as an INLINE module script, which `script-src 'self'` blocks —
 * the plugin then kills every dev page with an overlay. In serve mode only,
 * this transform swaps in the shipped policy plus exactly two documented
 * dev-only tokens:
 *
 *   script-src  + 'unsafe-inline'   react-refresh preamble + vite's overlay
 *   connect-src + ws:               the HMR socket (preview/build never use ws)
 *
 * `apply: 'serve'` guarantees `vite build` output is untouched — the strict
 * policy is what dist/ ships, and tests/e2e/privacy.spec.ts proves
 * enforcement against the production preview (inline-script and off-origin
 * canaries are expected to be BLOCKED there, and are).
 */
function devCspRelaxation(): Plugin {
  return {
    name: 'ca1-dev-csp-relaxation',
    apply: 'serve',
    transformIndexHtml(html) {
      return html
        .replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
        .replace("connect-src 'self';", "connect-src 'self' ws:;")
    },
  }
}

export default defineConfig({
  plugins: [react(), devCspRelaxation()],
  base: './',
  build: {
    assetsInlineLimit: 0,
  },
})
