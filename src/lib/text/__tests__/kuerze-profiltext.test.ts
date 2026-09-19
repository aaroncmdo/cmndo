// Aaron 19.09.2026: "wenn die Profilbeschreibung zu lang ist, soll sie ausklappbar sein —
// ueberleg dir eine gute Zeichenanzahl". Die Kuerzungsregel ist pure Logik und hier festgenagelt:
// Limit 180, Toleranz 40 (bis 220 Zeichen bleibt alles stehen), Schnitt am letzten Wortende.
import { describe, it, expect } from 'vitest'
import { kuerzeProfiltext, PROFILTEXT_LIMIT, PROFILTEXT_TOLERANZ } from '@/lib/text/kuerze-profiltext'

describe('kuerzeProfiltext', () => {
  it('Konstanten: Limit 180, Toleranz 40', () => {
    expect(PROFILTEXT_LIMIT).toBe(180)
    expect(PROFILTEXT_TOLERANZ).toBe(40)
  })

  it('laesst kurze Texte unangetastet', () => {
    expect(kuerzeProfiltext('Kurzer Text.')).toEqual({ gekuerzt: false, text: 'Kurzer Text.' })
  })

  it('laesst Texte bis Limit + Toleranz (220 Zeichen) ganz stehen', () => {
    const t = 'a'.repeat(200) + ' ' + 'b'.repeat(19)
    expect(t.length).toBe(220)
    expect(kuerzeProfiltext(t)).toEqual({ gekuerzt: false, text: t })
  })

  it('kuerzt ab 221 Zeichen am letzten Wortende vor dem Limit und haengt … an', () => {
    const t = Array.from({ length: 60 }, (_, i) => `wort${i}`).join(' ')
    expect(t.length).toBeGreaterThan(220)
    const r = kuerzeProfiltext(t)
    expect(r.gekuerzt).toBe(true)
    expect(r.text.endsWith('…')).toBe(true)
    const ohne = r.text.slice(0, -1)
    expect(ohne.length).toBeLessThanOrEqual(180)
    expect(ohne.endsWith(' ')).toBe(false)
    expect(t.startsWith(ohne)).toBe(true)
    expect(t[ohne.length]).toBe(' ')
  })

  it('schneidet hart am Limit, wenn vor 60 % des Limits kein Wortende liegt', () => {
    const r = kuerzeProfiltext('x'.repeat(300))
    expect(r).toEqual({ gekuerzt: true, text: 'x'.repeat(180) + '…' })
  })

  it('trimmt aussen und behandelt Zeilenumbrueche als Wortgrenzen (kein Leerraum vor …)', () => {
    const r = kuerzeProfiltext('  ' + 'Satz eins.\n'.repeat(30))
    expect(r.gekuerzt).toBe(true)
    expect(r.text.startsWith('Satz eins.')).toBe(true)
    expect(/\s…$/.test(r.text)).toBe(false)
  })

  it('respektiert eigenes Limit und eigene Toleranz', () => {
    const t = 'Eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf'
    expect(kuerzeProfiltext(t, { limit: 20, toleranz: 0 })).toEqual({ gekuerzt: true, text: 'Eins zwei drei vier…' })
  })

  it('liefert bei null, undefined und Leerraum einen leeren, ungekuerzten Text', () => {
    expect(kuerzeProfiltext(null)).toEqual({ gekuerzt: false, text: '' })
    expect(kuerzeProfiltext(undefined)).toEqual({ gekuerzt: false, text: '' })
    expect(kuerzeProfiltext('   ')).toEqual({ gekuerzt: false, text: '' })
  })
})
