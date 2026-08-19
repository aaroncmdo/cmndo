import { describe, expect, it } from 'vitest'
import {
  paarBefunde,
  substanzVerteilung,
  textAusZeile,
  ueberlappung,
  viergramme,
} from './lokalinhalt-qualitaet-scan.mjs'

/** Minimale Zeile in DB-Form (snake_case, wie sie aus Supabase kommt). */
function zeile(slug, extra = {}) {
  return {
    stadt_slug: slug,
    stadtbezirke: [{ name: 'Mitte', ortsteile: ['Nord'] }],
    hauptachsen: { autobahnen: ['A1'], bundesstrassen: ['B9'], knoten: ['Kreuz Nord'] },
    unfall_hotspots: [],
    lokale_faqs: [{ frage: 'Wer zahlt?', antwort: 'Die Haftpflicht.' }],
    hero_anker: 'Ein Satz zur Lage.',
    topografie_anker: null,
    ...extra,
  }
}

describe('textAusZeile', () => {
  it('sammelt alle nutzersichtbaren WERTE', () => {
    const t = textAusZeile(zeile('bonn'))
    for (const teil of ['Mitte', 'Nord', 'A1', 'B9', 'Kreuz Nord', 'Wer zahlt?', 'Die Haftpflicht.', 'Ein Satz zur Lage.']) {
      expect(t).toContain(teil)
    }
  })

  it('nimmt KEINE Schluesselnamen auf', () => {
    // `bundesstrassen` ist ein Schema-Feldname und steht in JEDER Zeile —
    // ueber JSON.stringify() gemessen sind zwei beliebige Staedte sofort
    // "aehnlich", ohne dass ein Wort ihres Textes uebereinstimmt.
    expect(textAusZeile(zeile('bonn'))).not.toContain('bundesstrassen')
    expect(textAusZeile(zeile('bonn'))).not.toContain('stadt_slug')
  })

  it('vertraegt fehlende Felder', () => {
    expect(textAusZeile({ stadt_slug: 'x' })).toBe('')
    expect(textAusZeile(null)).toBe('')
  })
})

describe('ueberlappung', () => {
  it('meldet 100 % fuer identischen Text und 0 % fuer voellig verschiedenen', () => {
    const a = viergramme('ein zwei drei vier fuenf sechs sieben acht neun', 'x')
    const b = viergramme('alpha beta gamma delta epsilon zeta eta theta iota', 'x')
    expect(ueberlappung(a, a)).toBe(100)
    expect(ueberlappung(a, b)).toBe(0)
  })

  it('blendet den Stadtnamen aus — sonst taeuscht er Unterschied vor', () => {
    // Zwei Baukasten-Texte, die sich NUR im Ortsnamen unterscheiden, muessen
    // als nahezu identisch gelten. Genau das ist der Scaled-Content-Fall.
    const satz = (ort) => `In ${ort} zahlt nach einem Unfall die gegnerische Haftpflicht die Kosten des Gutachtens`
    const a = viergramme(satz('Bonn'), 'Bonn')
    const b = viergramme(satz('Essen'), 'Essen')
    expect(ueberlappung(a, b)).toBeGreaterThan(90)
  })

  it('entfernt den Ortsnamen nur als GANZES Wort', () => {
    // Ohne Wortgrenzen fraess "Essen" das "essen" aus "Interessen" und
    // zerlegte den Text — die Ueberlappung faellt dann auf 0, also in die
    // harmlos aussehende Richtung. Genau so ist es beim Bau passiert.
    const satz = 'die Interessen der Versicherung und das Gutachten nach dem Unfall im Stadtgebiet'
    const mitEssen = viergramme(satz, 'Essen')
    const ohne = viergramme(satz, '')
    expect(mitEssen.size).toBe(ohne.size)
  })

  it('entfernt mehrteilige Ortsnamen Teil fuer Teil', () => {
    const a = viergramme('In Bergisch Gladbach zahlt die Haftpflicht das Gutachten immer', 'bergisch-gladbach')
    const b = viergramme('In Herne zahlt die Haftpflicht das Gutachten immer', 'herne')
    expect(ueberlappung(a, b)).toBeGreaterThan(50)
  })

  it('liefert 0 statt NaN bei leeren Mengen', () => {
    expect(ueberlappung(new Set(), new Set())).toBe(0)
  })
})

describe('paarBefunde', () => {
  const bau = (slug, text) => ({ slug, gramme: viergramme(text, slug) })

  it('findet das schlimmste Paar und meldet Ueberschreitungen', () => {
    const gleich = 'die gegnerische haftpflicht zahlt das gutachten nach einem unfall im ort'
    const r = paarBefunde(
      [bau('a', gleich), bau('b', gleich), bau('c', 'voellig anderer inhalt ueber ganz andere dinge hier')],
      40,
    )
    expect(r.max).toBeGreaterThan(90)
    expect(r.schlimmstes).toBe('a ↔ b')
    expect(r.ueberGrenze.map((x) => `${x.a} ↔ ${x.b}`)).toEqual(['a ↔ b'])
  })

  it('meldet nichts bei weniger als zwei Staedten', () => {
    const r = paarBefunde([bau('a', 'irgendwas hier steht ein text')], 40)
    expect(r.max).toBe(0)
    expect(r.ueberGrenze).toEqual([])
  })
})

describe('substanzVerteilung', () => {
  it('zaehlt gefuellte Kategorien und die Nullen je Kategorie', () => {
    const v = substanzVerteilung([
      zeile('a'),
      zeile('b', { unfall_hotspots: [{ ort: 'X', beschreibung: 'y', quelle: 'https://x.de' }] }),
      zeile('c', { stadtbezirke: [], lokale_faqs: [] }),
    ])
    expect(v.staedte).toBe(3)
    expect(v.ohne.hotspots).toBe(2)
    expect(v.ohne.bezirke).toBe(1)
    expect(v.ohne.faqs).toBe(1)
    expect(v.ohne.knoten).toBe(0)
  })

  it('vertraegt eine leere Eingabe', () => {
    const v = substanzVerteilung([])
    expect(v.staedte).toBe(0)
    expect(v.ohne.hotspots).toBe(0)
  })
})
