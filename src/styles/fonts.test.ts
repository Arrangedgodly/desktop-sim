import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Thor's font budget (plan.md TH-1 / research ui1-typefaces.md): the five
// self-hosted latin WOFF2 faces together must stay ≤ 150 KB. Expected ~80 KB.
const FONT_BUDGET_BYTES = 150 * 1024

const fontsDir = fileURLToPath(new URL('./fonts/', import.meta.url))

const EXPECTED_FONTS = [
  'chakra-petch-latin-400.woff2',
  'chakra-petch-latin-600.woff2',
  'lora-latin-var-400-700.woff2',
  'b612-mono-latin-400.woff2',
  'b612-mono-latin-700.woff2',
] as const

const EXPECTED_LICENSES = ['OFL-ChakraPetch.txt', 'OFL-Lora.txt', 'OFL-B612Mono.txt'] as const

function readStyles(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')
}

describe('UI-1 · self-hosted fonts', () => {
  it('ships exactly the five committed latin WOFF2 files', () => {
    for (const name of EXPECTED_FONTS) {
      expect(existsSync(`${fontsDir}${name}`), name).toBe(true)
    }
  })

  it(`keeps the total font payload ≤ ${FONT_BUDGET_BYTES} bytes (Thor budget)`, () => {
    const total = EXPECTED_FONTS.reduce((sum, name) => sum + statSync(`${fontsDir}${name}`).size, 0)
    // 81,872 bytes as fetched (2026-09-01); the budget leaves headroom for a
    // possible Lora italic at Notepad polish — do not spend it elsewhere.
    expect(total).toBeLessThanOrEqual(FONT_BUDGET_BYTES)
    expect(total).toBeGreaterThan(0)
  })

  it('is only WOFF2 (no accidental TTF/OTF payloads)', () => {
    for (const name of EXPECTED_FONTS) {
      const buf = readFileSync(`${fontsDir}${name}`)
      // WOFF2 magic: wOF2
      expect(buf.subarray(0, 4).toString('ascii'), name).toBe('wOF2')
    }
  })

  it('carries the SIL OFL 1.1 license text beside every family (redistribution duty)', () => {
    for (const name of EXPECTED_LICENSES) {
      const text = readFileSync(`${fontsDir}${name}`, 'utf8')
      expect(text).toContain('SIL Open Font License, Version 1.1')
    }
  })

  it('records provenance (face, weight, license, source URL, date) in fonts/README.md', () => {
    const readme = readFileSync(`${fontsDir}README.md`, 'utf8')
    for (const name of EXPECTED_FONTS) expect(readme).toContain(name)
    expect(readme).toContain('SIL Open Font License')
    expect(readme).toContain('fonts.gstatic.com')
    expect(readme).toMatch(/2026-09-01/)
  })

  it('declares all five faces with font-display: swap, format woff2 and the latin unicode-range', () => {
    const css = readStyles('fonts.css')
    const faces = css.match(/@font-face\s*\{/g) ?? []
    expect(faces.length).toBe(5)

    const blocks = css.split(/@font-face\s*\{/).slice(1)
    for (const block of blocks) {
      expect(block).toContain('font-display: swap')
      expect(block).toMatch(/format\('woff2'\)/)
      // whitespace-flexible: prettier wraps the long unicode-range value
      expect(block).toMatch(/unicode-range:\s*U\+0000-00FF/)
      // every referenced file actually exists in ./fonts/
      const referenced = [...block.matchAll(/url\('\.\/fonts\/([^']+)'\)/g)].map((m) => m[1])
      expect(referenced.length).toBe(1)
      expect(existsSync(`${fontsDir}${referenced[0]}`), referenced[0]).toBe(true)
    }

    // the committed role/weight matrix: Chakra 400+600, Lora 400 700 variable, B612 400+700
    expect(css).toContain(
      "font-family: 'Chakra Petch';\n  font-style: normal;\n  font-weight: 400;",
    )
    expect(css).toContain(
      "font-family: 'Chakra Petch';\n  font-style: normal;\n  font-weight: 600;",
    )
    expect(css).toContain("font-family: 'Lora';\n  font-style: normal;\n  font-weight: 400 700;")
    expect(css).toContain("font-family: 'B612 Mono';\n  font-style: normal;\n  font-weight: 400;")
    expect(css).toContain("font-family: 'B612 Mono';\n  font-style: normal;\n  font-weight: 700;")
  })
})
