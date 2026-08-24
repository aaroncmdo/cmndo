import { beforeEach, describe, expect, it } from 'vitest'
import { dreheLaufZurueck } from '../rueckwaerts'
import type { Db } from '../schreiben'

const state = {
  zeilen: [] as Record<string, unknown>[],
  leads: [] as Record<string, unknown>[],
  ladeFehler: null as string | null,
  updates: [] as { id: string; werte: Record<string, unknown> }[],
  updateRows: 1,
  gelöschteAuditZeilen: 0,
}

const db = {
  from: (tabelle: string) => {
    if (tabelle === 'levelup_anreicherung') {
      // ⚠ Die Kette endet seit dem 1000-Zeilen-Fund (21.08.) auf `.range()` —
      // und der Mock gibt WIRKLICH den Ausschnitt zurueck. Ein Mock, der jede
      // Seite vollstaendig beantwortet, kann nicht zeigen, ob der Aufrufer die
      // Seiten korrekt zusammensetzt.
      const leseKette = () => {
        let bereich: [number, number] | null = null
        const k: Record<string, unknown> = {}
        k.eq = () => k
        k.order = () => k
        k.range = (von: number, bis: number) => { bereich = [von, bis]; return k }
        k.then = (aufl: (v: unknown) => void) =>
          aufl(
            state.ladeFehler
              ? { data: null, error: { message: state.ladeFehler } }
              : { data: bereich ? state.zeilen.slice(bereich[0], bereich[1] + 1) : state.zeilen, error: null },
          )
        return k
      }
      return {
        select: leseKette,
        // Wird absichtlich NIE aufgerufen: der Log ist append-only.
        delete: () => {
          state.gelöschteAuditZeilen += 1
          return { eq: async () => ({ error: null }) }
        },
      }
    }
    if (tabelle === 'sv_leads') {
      const istKette = () => {
        let block: string[] = []
        let bereich: [number, number] | null = null
        const k: Record<string, unknown> = {}
        k.in = (_spalte: string, werte: string[]) => { block = werte; return k }
        k.order = () => k
        k.range = (von: number, bis: number) => { bereich = [von, bis]; return k }
        k.then = (aufl: (v: unknown) => void) => {
          // Nur die Zeilen des angefragten Blocks — sonst zeigt der Mock nicht,
          // ob der Aufrufer alle Bloecke zusammenfuehrt.
          const passend = state.leads.filter((l) => block.includes(l.id as string))
          aufl({ data: bereich ? passend.slice(bereich[0], bereich[1] + 1) : passend, error: null })
        }
        return k
      }
      return {
        select: istKette,
        update: (werte: Record<string, unknown>) => ({
          eq: (_spalte: string, id: string) => ({
            select: async () => {
              state.updates.push({ id, werte })
              return {
                data: Array.from({ length: state.updateRows }, () => ({ id })),
                error: null,
              }
            },
          }),
        }),
      }
    }
    throw new Error(`Unerwartete Tabelle: ${tabelle}`)
  },
} as unknown as Db

/** Lead-Zustand NACH dem Lauf, den wir zurueckdrehen. */
function lead(over: Record<string, unknown> = {}) {
  return {
    id: 'L1', email: null, telefon: null, website_url: null,
    vorname: null, nachname: null, ...over,
  }
}

beforeEach(() => {
  state.zeilen = []
  state.leads = [lead()]
  state.ladeFehler = null
  state.updates = []
  state.updateRows = 1
  state.gelöschteAuditZeilen = 0
})

describe('dreheLaufZurueck', () => {
  // T-26
  it('setzt die Felder auf wert_vorher zurueck', async () => {
    state.zeilen = [
      { sv_lead_id: 'L1', feld: 'email', wert_vorher: null, wert_nachher: 'a@b.de' },
      { sv_lead_id: 'L1', feld: 'telefon', wert_vorher: null, wert_nachher: '+4925112345678' },
    ]
    state.leads = [lead({ email: 'a@b.de', telefon: '+4925112345678' })]

    const r = await dreheLaufZurueck(db, 'LAUF1')

    expect(r.ok).toBe(true)
    expect(r.ok && r.zurueckgesetzt).toBe(2)
    expect(state.updates).toHaveLength(1)          // ein Update je Lead, nicht je Feld
    expect(state.updates[0]).toMatchObject({ id: 'L1', werte: { email: null, telefon: null } })
  })

  it('laesst die Audit-Zeilen stehen — der Log ist append-only', async () => {
    state.zeilen = [{ sv_lead_id: 'L1', feld: 'email', wert_vorher: null, wert_nachher: 'a@b.de' }]
    state.leads = [lead({ email: 'a@b.de' })]
    await dreheLaufZurueck(db, 'LAUF1')
    expect(state.gelöschteAuditZeilen).toBe(0)
  })

  it('stellt einen vorherigen Wert wieder her, statt nur zu leeren', async () => {
    state.zeilen = [{ sv_lead_id: 'L1', feld: 'website_url', wert_vorher: 'https://alt.de', wert_nachher: 'https://neu.de' }]
    state.leads = [lead({ website_url: 'https://neu.de' })]
    await dreheLaufZurueck(db, 'LAUF1')
    expect(state.updates[0].werte).toMatchObject({ website_url: 'https://alt.de' })
  })

  /**
   * Am echten Lauf aufgefallen (18.08., f8d11785): nach dem Rueckdrehen stand
   * `website_sicherheit = 90` neben `website_url = null` — eine Sicherheit zu
   * einer Website, die es nicht mehr gibt. Die Begleitspalten muessen
   * spiegelbildlich zu `schreibeFunde` mit zurueck.
   */
  it('nimmt die Begleitspalten der Website mit zurueck', async () => {
    state.zeilen = [{ sv_lead_id: 'L1', feld: 'website_url', wert_vorher: null, wert_nachher: 'https://x.de' }]
    state.leads = [lead({ website_url: 'https://x.de' })]

    await dreheLaufZurueck(db, 'LAUF1')

    expect(state.updates[0].werte).toMatchObject({
      website_url: null, website_gefunden: null, website_sicherheit: null,
    })
  })

  it('nimmt kontakt_quelle mit zurueck, wenn kein Kontaktfeld uebrig bleibt', async () => {
    state.zeilen = [
      { sv_lead_id: 'L1', feld: 'email', wert_vorher: null, wert_nachher: 'a@b.de' },
      { sv_lead_id: 'L1', feld: 'telefon', wert_vorher: null, wert_nachher: '+49251123' },
    ]
    state.leads = [lead({ email: 'a@b.de', telefon: '+49251123' })]

    await dreheLaufZurueck(db, 'LAUF1')
    expect(state.updates[0].werte).toMatchObject({ kontakt_quelle: null })
  })

  // Sonst reisst das Zurueckdrehen EINES Laufs die Quelle eines anderen mit weg
  it('laesst kontakt_quelle stehen, wenn ein Kontaktfeld aus einem anderen Lauf bleibt', async () => {
    state.zeilen = [{ sv_lead_id: 'L1', feld: 'email', wert_vorher: null, wert_nachher: 'a@b.de' }]
    state.leads = [lead({ email: 'a@b.de', telefon: '+49251123' })]   // Telefon aus anderem Lauf

    await dreheLaufZurueck(db, 'LAUF1')
    expect(state.updates[0].werte).not.toHaveProperty('kontakt_quelle')
  })

  it('raeumt angereichert_am ab, wenn nichts angereichertes uebrig bleibt', async () => {
    state.zeilen = [{ sv_lead_id: 'L1', feld: 'email', wert_vorher: null, wert_nachher: 'a@b.de' }]
    state.leads = [lead({ email: 'a@b.de' })]

    await dreheLaufZurueck(db, 'LAUF1')
    expect(state.updates[0].werte).toMatchObject({ angereichert_am: null })
  })

  it('laesst angereichert_am stehen, wenn ein Feld aus einem anderen Lauf bleibt', async () => {
    state.zeilen = [{ sv_lead_id: 'L1', feld: 'email', wert_vorher: null, wert_nachher: 'a@b.de' }]
    state.leads = [lead({ email: 'a@b.de', vorname: 'Klaus' })]

    await dreheLaufZurueck(db, 'LAUF1')
    expect(state.updates[0].werte).not.toHaveProperty('angereichert_am')
  })

  it('gruppiert mehrere Leads zu je einem Update', async () => {
    state.zeilen = [
      { sv_lead_id: 'L1', feld: 'email', wert_vorher: null, wert_nachher: 'a@b.de' },
      { sv_lead_id: 'L2', feld: 'email', wert_vorher: null, wert_nachher: 'c@d.de' },
    ]
    state.leads = [lead({ email: 'a@b.de' }), lead({ id: 'L2', email: 'c@d.de' })]

    const r = await dreheLaufZurueck(db, 'LAUF1')
    expect(r.ok && r.zurueckgesetzt).toBe(2)
    expect(state.updates.map((u) => u.id).sort()).toEqual(['L1', 'L2'])
  })

  it('ist idempotent — ein zweiter Aufruf setzt dieselben Werte', async () => {
    state.zeilen = [{ sv_lead_id: 'L1', feld: 'email', wert_vorher: null, wert_nachher: 'a@b.de' }]
    state.leads = [lead({ email: 'a@b.de' })]

    await dreheLaufZurueck(db, 'LAUF1')
    const ersteWerte = state.updates[0].werte
    state.updates = []
    state.leads = [lead()]                       // jetzt schon leer
    await dreheLaufZurueck(db, 'LAUF1')
    expect(state.updates[0].werte).toEqual(ersteWerte)
  })

  it('meldet einen unbekannten Lauf als Erfolg mit 0 — nicht als Fehler', async () => {
    const r = await dreheLaufZurueck(db, 'GIBTESNICHT')
    expect(r.ok).toBe(true)
    expect(r.ok && r.zurueckgesetzt).toBe(0)
    expect(state.updates).toHaveLength(0)
  })

  it('meldet einen Lade-Fehler als Fehler', async () => {
    state.ladeFehler = 'permission denied'
    const r = await dreheLaufZurueck(db, 'LAUF1')
    expect(r.ok).toBe(false)
  })

  it('meldet einen 0-Row-Update als Fehler', async () => {
    state.zeilen = [{ sv_lead_id: 'L1', feld: 'email', wert_vorher: null, wert_nachher: 'a@b.de' }]
    state.leads = [lead({ email: 'a@b.de' })]
    state.updateRows = 0
    const r = await dreheLaufZurueck(db, 'LAUF1')
    expect(r.ok).toBe(false)
  })

  it('ignoriert Felder, die nicht zur Anreicherung gehoeren', async () => {
    state.zeilen = [{ sv_lead_id: 'L1', feld: 'ist_aktiv', wert_vorher: 'true', wert_nachher: 'false' }]
    const r = await dreheLaufZurueck(db, 'LAUF1')
    expect(r.ok && r.zurueckgesetzt).toBe(0)
    expect(state.updates).toHaveLength(0)
  })
})

describe('dreheLaufZurueck — die Ist-Menge MUSS vollstaendig sein', () => {
  /**
   * ⭐⭐ Die teuerste Falle des 21.08.: `.in('id', ids)` ohne `range` liefert
   * hoechstens 1.000 Zeilen. Fehlt ein Lead in `jeId`, liefert `ziel()` fuer
   * jedes seiner Felder `undefined`, `leer(undefined)` ist `true` — und die
   * Abraeum-Zweige nullen `website_gefunden`, `website_sicherheit`,
   * `kontakt_quelle` und `angereichert_am` an einem Lead, der diese Werte aus
   * einem ANDEREN Lauf traegt.
   *
   * Eine unvollstaendige LESEmenge wird hier zu einem falschen SCHREIBEN. Das
   * ist keine Anzeigefrage, sondern Datenverlust.
   */
  it('bricht ab, wenn ein Lead des Laufs nicht mehr in sv_leads steht', async () => {
    state.zeilen = [
      { sv_lead_id: 'L1', feld: 'email', wert_vorher: null, wert_nachher: 'a@b.de' },
      { sv_lead_id: 'VERSCHWUNDEN', feld: 'email', wert_vorher: null, wert_nachher: 'c@d.de' },
    ]
    // Nur L1 kommt zurueck — VERSCHWUNDEN fehlt.
    state.leads = [{ id: 'L1', email: 'a@b.de', telefon: null, website_url: null, vorname: null, nachname: null }]

    const r = await dreheLaufZurueck(db, 'lauf-1')

    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unerwartet')
    expect(r.error).toContain('VERSCHWUNDEN')
    // ⚠ Und vor allem: NICHTS wurde geschrieben. Ein Teil-Rollback waere
    // schlimmer als keiner.
    expect(state.updates).toHaveLength(0)
  })

  it('holt die Ist-Zustaende auch bei vielen Leads vollstaendig', async () => {
    // Mehr als ein Block (300) und mehr als eine Seite (1.000).
    const n = 1200
    state.zeilen = Array.from({ length: n }, (_, i) => ({
      sv_lead_id: `L${i}`, feld: 'email', wert_vorher: null, wert_nachher: `m${i}@b.de`,
    }))
    state.leads = Array.from({ length: n }, (_, i) => ({
      id: `L${i}`, email: `m${i}@b.de`, telefon: null, website_url: null, vorname: null, nachname: null,
    }))

    const r = await dreheLaufZurueck(db, 'lauf-gross')

    expect(r.ok).toBe(true)
    expect(state.updates).toHaveLength(n)
  })
})
