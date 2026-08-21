import { beforeEach, describe, expect, it } from 'vitest'
import { laufeAn } from '../lauf-alle'
import type { Db } from '../schreiben'
import type { Antwort } from '../lauf'

/**
 * Geprueft wird die ZAEHLUNG. Der Bericht ist die Entscheidungsgrundlage
 * ("Trefferquote notiert") — eine falsch gezaehlte Quote waere eine falsche
 * Grundlage, und das faellt niemandem auf.
 */
let leads: Record<string, unknown>[] = []
let leadFehler: string | null = null
let seiten: Record<string, Antwort> = {}
let updates: { id: string; werte: Record<string, unknown> }[] = []
let updateRows = 1

const hole = async (url: string): Promise<Antwort> => seiten[url] ?? { status: 404, text: '' }

let sortierung: string[] = []
/** Welche Spalten die Arbeitsmengen-Abfrage filtert — nicht nur, dass sie es tut. */
let filter: string[] = []

// Nachbildung der PostgREST-Kette, soweit laufeAn und schreibeFunde sie nutzen.
const kette = () => {
  const k: Record<string, unknown> = {}
  // ⚠ `range` gibt WIRKLICH den Ausschnitt zurueck, nicht die ganze Liste. Ein
  // Mock, der jede Seite vollstaendig beantwortet, kann nicht zeigen, ob der
  // Aufrufer die Seiten korrekt zusammensetzt — und genau darum geht es seit
  // dem 1000-Zeilen-Fund vom 21.08.
  let bereich: [number, number] | null = null
  k.eq = (spalte: string) => { filter.push(spalte); return k }
  for (const m of ['or', 'limit', 'in']) {
    k[m] = () => k
  }
  k.range = (von: number, bis: number) => { bereich = [von, bis]; return k }
  k.order = (spalte: string) => { sortierung.push(spalte); return k }
  ;(k as { then: unknown }).then = (aufl: (v: unknown) => unknown) =>
    Promise.resolve(
      leadFehler
        ? { data: null, error: { message: leadFehler } }
        : { data: bereich ? leads.slice(bereich[0], bereich[1] + 1) : leads, error: null },
    ).then(aufl)
  return k
}

const db = {
  from: (tabelle: string) => {
    if (tabelle === 'sv_leads') {
      return {
        select: (spalten: string) => {
          // Der Einzel-Lead-Read von schreibeFunde vs. der Listen-Read von laufeAn
          if (spalten.includes('nachname')) {
            return {
              eq: () => ({
                single: async () => ({
                  data: {
                    id: 'L1', email: null, telefon: null,
                    website_url: null, vorname: null, nachname: null,
                  },
                  error: null,
                }),
              }),
            }
          }
          return kette()
        },
        update: (werte: Record<string, unknown>) => ({
          eq: (_s: string, id: string) => ({
            select: async () => {
              updates.push({ id, werte })
              return { data: Array.from({ length: updateRows }, () => ({ id })), error: null }
            },
          }),
        }),
      }
    }
    if (tabelle === 'cold_mail_suppression') {
      return { select: () => ({ in: async () => ({ data: [], error: null }) }) }
    }
    if (tabelle === 'levelup_anreicherung') {
      return { insert: async () => ({ error: null }) }
    }
    throw new Error(`Unerwartete Tabelle: ${tabelle}`)
  },
} as unknown as Db

const TREFFER_HTML =
  '<html><body>Habermehl GmbH 48143 Muenster<a href="mailto:k@habermehl.de">M</a></body></html>'

beforeEach(() => {
  leads = []
  sortierung = []
  filter = []
  leadFehler = null
  seiten = {}
  updates = []
  updateRows = 1
})

describe('laufeAn', () => {
  it('uebergeht INAKTIVE Leads NICHT', async () => {
    // ⚠ Am 20.08. gefunden: die Abfrage filterte auf `ist_aktiv = true`.
    // Die Lead-Discovery legt neue Bueros bewusst INAKTIV an, damit sie nicht
    // ungefragt auf zwei oeffentlichen Karten erscheinen — eine davon im
    // Embed auf FREMDEN Websites. Zusammen hiess das: entdeckte Leads werden
    // nie angereichert und bleiben fuer immer ohne Kontaktdaten.
    //
    // `ist_aktiv` sagt „erscheint auf der Karte", nicht „ist zu bearbeiten".
    // Wofuer ein Lead noch offen ist, sagt `claim_status`.
    await laufeAn(db, { laufId: 'X', hole })
    expect(filter).not.toContain('ist_aktiv')
    expect(filter).toContain('claim_status')
  })

  it('meldet einen leeren Bericht, wenn es nichts zu tun gibt', async () => {
    const r = await laufeAn(db, { laufId: 'X', hole })
    expect(r.ok).toBe(true)
    expect(r.ok && r.bericht.betrachtet).toBe(0)
  })

  it('gibt einen Lade-Fehler zurueck, statt einen leeren Bericht zu behaupten', async () => {
    leadFehler = 'permission denied'
    const r = await laufeAn(db, { laufId: 'X', hole })
    expect(r.ok).toBe(false)
  })

  it('zaehlt Treffer je Feld und die Sicherheit', async () => {
    leads = [{ id: 'L1', firma: 'Habermehl GmbH', name: 'H', ort: 'Muenster', plz: '48143', website_url: null }]
    seiten['https://habermehl.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://habermehl.de/'] = { status: 200, text: TREFFER_HTML }
    seiten['https://habermehl.de/impressum'] = { status: 200, text: TREFFER_HTML }

    const r = await laufeAn(db, { laufId: 'X', hole })

    expect(r.ok && r.bericht.betrachtet).toBe(1)
    expect(r.ok && r.bericht.jeFeld.website_url).toBe(1)
    expect(r.ok && r.bericht.jeFeld.email).toBe(1)
    expect(r.ok && r.bericht.sicherheit.hoch).toBe(1)
    expect(r.ok && r.bericht.websiteBelastbar).toBe(1)
  })

  it('gruppiert die Gruende fuer Nicht-Treffer', async () => {
    leads = [
      { id: 'L1', firma: 'Kfz-Sachverstaendigenbuero GmbH', name: 'A', ort: 'X', plz: '1', website_url: null },
      { id: 'L2', firma: 'Ingenieurbuero GmbH', name: 'B', ort: 'Y', plz: '2', website_url: null },
    ]
    const r = await laufeAn(db, { laufId: 'X', hole })

    expect(r.ok && r.bericht.betrachtet).toBe(2)
    const gruende = r.ok ? Object.values(r.bericht.gruende) : []
    expect(gruende.reduce((a, b) => a + b, 0)).toBe(2)
    expect(r.ok && Object.keys(r.bericht.gruende)[0]).toContain('Gattungswoertern')
  })

  it('schreibt im Trockenlauf nichts', async () => {
    leads = [{ id: 'L1', firma: 'Habermehl GmbH', name: 'H', ort: 'Muenster', plz: '48143', website_url: null }]
    seiten['https://habermehl.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://habermehl.de/'] = { status: 200, text: TREFFER_HTML }

    const r = await laufeAn(db, { laufId: 'X', hole, dryRun: true })

    expect(updates).toHaveLength(0)
    expect(r.ok && r.bericht.jeFeld.website_url).toBe(1)   // gezaehlt wird trotzdem
    expect(r.ok && r.bericht.dryRun).toBe(true)
  })

  // Sonst entscheidet ein kaputter Datensatz ueber die Bearbeitung der anderen
  it('laeuft nach einem Schreibfehler weiter und berichtet ihn', async () => {
    leads = [
      { id: 'L1', firma: 'Habermehl GmbH', name: 'H', ort: 'Muenster', plz: '48143', website_url: null },
      { id: 'L2', firma: 'Habermehl GmbH', name: 'H', ort: 'Muenster', plz: '48143', website_url: null },
    ]
    seiten['https://habermehl.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://habermehl.de/'] = { status: 200, text: TREFFER_HTML }
    updateRows = 0    // jeder Write trifft 0 Zeilen

    const r = await laufeAn(db, { laufId: 'X', hole })

    expect(r.ok).toBe(true)
    expect(r.ok && r.bericht.betrachtet).toBe(2)
    expect(r.ok && r.bericht.fehler).toHaveLength(2)
  })

  /**
   * Am echten Bestand aufgefallen (18.08.): ALLE 62 Leads haben denselben
   * `erstellt_am` (Excel-Import in einem Rutsch). Bei gleichen Sortierwerten
   * garantiert PostgreSQL keine Reihenfolge — zwei Laeufe mit `--limit 5`
   * trafen nachweislich verschiedene Leads. Ohne stabilen Tiebreaker ist weder
   * ein Teillauf reproduzierbar noch ein abgebrochener Massenlauf (P6)
   * fortsetzbar.
   */
  it('sortiert reproduzierbar — mit eindeutigem Tiebreaker', async () => {
    await laufeAn(db, { laufId: 'X', hole })
    expect(sortierung).toEqual(['erstellt_am', 'id'])
  })

  it('meldet den Fortschritt je Lead', async () => {
    leads = [{ id: 'L1', firma: 'Kfz-Gutachterbuero GmbH', name: 'A', ort: 'X', plz: '1', website_url: null }]
    const zeilen: string[] = []

    await laufeAn(db, { laufId: 'X', hole, fortschritt: (_n, _g, z) => zeilen.push(z) })

    expect(zeilen).toHaveLength(1)
    expect(zeilen[0]).toContain('Kfz-Gutachterbuero')
  })
})
