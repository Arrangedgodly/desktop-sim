import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PLACEHOLDER_MARK } from './schema'

/**
 * MF-3 · the one-time author fill-in template. These tests pin the template's
 * contract: every field the schema knows has an unambiguous slot a human can
 * fill in ~10 minutes, and the legend tells them where each answer surfaces.
 */

const templatePath = fileURLToPath(new URL('../../../content/author.template.md', import.meta.url))
const template = readFileSync(templatePath, 'utf8')

describe('MF-3 · author.template.md exists', () => {
  it('is a non-empty markdown file at content/author.template.md', () => {
    expect(template.length).toBeGreaterThan(1000)
    expect(template).toMatch(/^# /)
  })

  it('states the deal up front (10 minutes, how to fill, where answers go)', () => {
    expect(template).toContain('10 minutes')
    expect(template).toContain('content/author.json')
    expect(template).toMatch(/type your answer on the line starting with `→`/)
  })
})

describe('MF-3 · template section headers', () => {
  it('carries the five fill-in sections + the OS-appearance legend', () => {
    expect(template).toContain('# Author Content Pack')
    expect(template).toContain('## 1 · You')
    expect(template).toContain('## 2 · Contact links')
    expect(template).toContain('## 3 · Projects')
    expect(template).toContain('## 4 · Skills & interests')
    expect(template).toContain('## 5 · Mission-log line')
    expect(template).toContain('## Where each field appears in the OS')
  })

  it('has a slot for every schema field (author)', () => {
    for (const header of ['### Name', '### Handle', '### Tagline', '### Bio', '### Link 1']) {
      expect(template).toContain(header)
    }
  })

  it('has a slot for every schema field (project block, repeatable)', () => {
    expect(template).toContain('### Project 1')
    for (const field of [
      'Name — required',
      'One-line description — required',
      'Tech tags — required',
      'Live URL — optional',
      'Repo URL — optional',
      'Screenshot path — optional',
      'Story — optional',
    ]) {
      expect(template).toContain(field)
    }
  })

  it('uses the unambiguous `→` answer-slot marker throughout', () => {
    const slots = template.match(/^→ /gm) ?? []
    expect(slots.length).toBeGreaterThanOrEqual(15)
  })

  it('tells the filler how to repeat link/project blocks (scissors lines)', () => {
    const scissors = template.match(/^✂ /gm) ?? []
    expect(scissors.length).toBeGreaterThanOrEqual(4)
    expect(template).toContain('Copy the whole block between the ✂ lines')
  })
})

describe('MF-3 · template honesty + legend', () => {
  it('promises zero fabricated facts and shows the placeholder convention', () => {
    expect(template).toContain(PLACEHOLDER_MARK)
    expect(template).toContain('[YOUR')
    expect(template).toMatch(/Nothing about you is invented|Rule of honesty/)
  })

  it('maps every field to its OS surface (About nameplate, Browser cards, README, phone notice)', () => {
    expect(template).toContain('About nameplate (AP-5)')
    expect(template).toContain('Project Browser card title (AP-6)')
    expect(template).toContain('phone notice card (UI-7)')
    expect(template).toContain('README')
    // the join: project slots are the desktop Projects drawer specimens
    expect(template).toContain('Projects drawer specimen label')
  })
})
