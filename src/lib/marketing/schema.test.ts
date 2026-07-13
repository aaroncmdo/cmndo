import { describe, it, expect } from 'vitest'
import { ContentScriptSchema } from './schema'

const valid = {
  hook: 'Unfall gehabt? Das ist jetzt wichtig.',
  segmente: [
    { text: 'Zuerst Ruhe bewahren.', on_screen_text: '1. Ruhe bewahren', visual: { typ: 'stock', queries: ['car accident calm driver'] } },
    { text: 'Warndreieck aufstellen.', on_screen_text: '2. Absichern', visual: { typ: 'marke', tags: ['warndreieck'] } },
    { text: 'Alles fotografieren.', visual: { typ: 'grafik' } },
  ],
  caption: 'So handelst du nach einem Unfall richtig.',
  hashtags: ['Autounfall', 'Ratgeber'],
  disclaimer: 'Allgemeine Infos, keine Rechtsberatung.',
}

describe('ContentScriptSchema', () => {
  it('parst ein gueltiges Skript inkl. aller drei visual-Typen', () => {
    const r = ContentScriptSchema.safeParse(valid)
    expect(r.success).toBe(true)
  })

  it('parst auch ohne optionalen disclaimer/on_screen_text/tags/queries', () => {
    const minimal = {
      hook: 'Hook',
      segmente: [{ text: 'Ein Satz.', visual: { typ: 'grafik' } }],
      caption: 'Caption',
      hashtags: [],
    }
    expect(ContentScriptSchema.safeParse(minimal).success).toBe(true)
  })

  it('lehnt einen fehlenden visual.typ ab', () => {
    const bad = { ...valid, segmente: [{ text: 'x', visual: {} }] }
    expect(ContentScriptSchema.safeParse(bad).success).toBe(false)
  })

  it('lehnt einen unbekannten visual.typ ab', () => {
    const bad = { ...valid, segmente: [{ text: 'x', visual: { typ: 'foo' } }] }
    expect(ContentScriptSchema.safeParse(bad).success).toBe(false)
  })

  it('lehnt leere segmente ab', () => {
    const bad = { ...valid, segmente: [] }
    expect(ContentScriptSchema.safeParse(bad).success).toBe(false)
  })

  it('lehnt ein Segment mit leerem text ab', () => {
    const bad = { ...valid, segmente: [{ text: '', visual: { typ: 'grafik' } }] }
    expect(ContentScriptSchema.safeParse(bad).success).toBe(false)
  })
})
