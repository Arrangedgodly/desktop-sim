import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// IM-1 scaffold placeholder. UI-1 (tokens/styles) and UI-3 (desktop surface) replace
// this render with the Survey Archive desktop; kept intentionally minimal.
const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('index.html is missing the #root mount point')
}

createRoot(rootElement).render(
  <StrictMode>
    <main>
      <h1>HOLD/OS</h1>
      <p>Survey Archive scaffold — IM-1. The desktop arrives with UI-1/UI-3.</p>
    </main>
  </StrictMode>,
)
