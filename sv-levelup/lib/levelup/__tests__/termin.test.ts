import { beforeEach, describe, expect, it, vi } from 'vitest'
import { waehleTermin, EINWILLIGUNG_TEXT } from '../termin'
import type { Check } from '../check'
import type { Db } from '../../anreicherung/schreiben'

const state = {
  check: null as Check | null,
  kandidaten: [] as Record<string, unknown>[],
  domainKandidaten: [] as Record<string, unknown>[],
  angefasst: [] as string[],
  inserts: {} as Record<string, Record<string, unknown>>,
  updates: {} as Record<string, Record<string, unknown>>,
  vorhandenerTermin: null as Record<string, unknown> | null,
  terminFehler: null as string | null,
  updateRows: 1,
}

const db = {
  from: (tabelle: string) => {
    state.angefasst.push(tabelle)

    const insert = (w: Record<string, unknown>) => ({
      select: () => ({
        single: async () => {
          state.inserts[tabelle] = w
          return state.terminFehler && tabelle === 'levelup_termine'
            ? { data: null, error: { message: state.terminFehler } }
            : { data: { id: `${tabelle}-1`, ...w }, error: null }
        },
      }),
      then: (aufl: (v: unknown) => unknown) => {
        state.inserts[tabelle] = w
        return Promise.resolve({ error: null }).then(aufl)
      },
    })

    const update = (w: Record<string, unknown>) => ({
      eq: () => ({
        select: async () => {
          state.updates[tabelle] = { ...(state.updates[tabelle] ?? {}), ...w }
          return {
            data: Array.from({ length: state.updateRows }, () => ({ id: 'X' })),
            error: null,
          }
        },
      }),
    })

    if (tabelle === 'levelup_checks') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.check, error: null }) }) }),
        update,
      }
    }
    if (tabelle === 'sv_leads') {
      // Der Abgleich fährt seit 21.08. ZWEI Abfragen: Domain (`.not().ilike()`,
      // bundesweit) und Umkreis (`.gte().lte()`). Eine fest verdrahtete Kette
      // bricht bei jeder neuen Bedingung — deshalb eine, die alles annimmt.
      const leseKette = () => {
        const genutzt: string[] = []
        const k: Record<string, unknown> = {}
        for (const m of ['not', 'ilike', 'gte', 'lte', 'eq', 'is', 'order', 'range']) {
          k[m] = () => { genutzt.push(m); return k }
        }
        k.then = (aufl: (w: unknown) => void) =>
          aufl({ data: genutzt.includes('ilike') ? state.domainKandidaten : state.kandidaten, error: null })
        return k
      }
      return { select: leseKette, insert, update }
    }
    if (tabelle === 'levelup_termine') {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: state.vorhandenerTermin, error: null }) }),
        }),
        insert, update,
      }
    }
    if (tabelle === 'consent_records' || tabelle === 'levelup_events' || tabelle === 'tasks') {
      return { insert }
    }
    throw new Error(`Unerwartete Tabelle: ${tabelle}`)
  },
} as unknown as Db

function check(over: Partial<Check> = {}): Check {
  return {
    id: 'C1', token: 'T1', modus: 'bestand', status: 'fertig',
    firmenname: null, sv_lead_id: null,
    website_url: 'https://meyer.de', gsc_freigabe_am: null,
    module_gewaehlt: ['web'], module_gewuenscht: ['web'],
    punkte_erhebbar: 100, score: 62, kein_score: false,
    befunde: {}, fehlstellen: {},
    standort_lat: 51.9607, standort_lng: 7.6261, standort_ort: 'Münster', standort_plz: '48143',
    erhoben_am: '2026-08-19T10:00:00Z', fehler_text: null,
    gueltig_bis: '2026-11-16T00:00:00Z',
    ...over,
  }
}

const MORGEN = new Date(Date.now() + 86_400_000).toISOString()

const basis = {
  token: 'T1', slotStart: MORGEN, telefon: '+49251123456',
  einwilligung: true, ipHash: 'HASH', userAgent: 'test',
}

beforeEach(() => {
  state.check = check()
  state.kandidaten = []
  state.domainKandidaten = []
  state.angefasst = []
  state.inserts = {}
  state.updates = {}
  state.vorhandenerTermin = null
  state.terminFehler = null
  state.updateRows = 1
})

describe('waehleTermin — die Reihenfolge IST der Test', () => {
  /**
   * F-06 Schritt 1: „Ohne Einwilligung kein Lead." Und zwar bevor irgendetwas
   * geschrieben wird — ein Lead, der entsteht und dann zurueckgerollt werden
   * muesste, ist bereits ein Datenschutzvorgang.
   */
  it('bricht ohne Einwilligung ab, BEVOR eine Tabelle angefasst wird', async () => {
    const r = await waehleTermin(db, { ...basis, einwilligung: false })

    expect(r).toEqual({ ok: false, error: 'einwilligung_fehlt' })
    expect(state.angefasst).toEqual([])
  })

  it('schreibt den Consent-Nachweis VOR dem Lead', async () => {
    await waehleTermin(db, basis)
    const consent = state.angefasst.indexOf('consent_records')
    const lead = state.angefasst.indexOf('sv_leads')

    expect(consent).toBeGreaterThanOrEqual(0)
    expect(consent).toBeLessThan(lead)
  })

  it('haelt den Wortlaut der Einwilligung am Termin fest', async () => {
    await waehleTermin(db, basis)
    expect(state.inserts.levelup_termine).toMatchObject({
      einwilligung_ip_hash: 'HASH',
      einwilligung_text: EINWILLIGUNG_TEXT,
    })
    expect(state.inserts.levelup_termine.einwilligung_am).toBeTruthy()
  })

  it('nutzt das etablierte Zweck-Array in consent_records', async () => {
    await waehleTermin(db, basis)
    expect(state.inserts.consent_records.categories).toEqual(
      expect.arrayContaining(['sv_levelup_beratung']),
    )
  })
})

describe('waehleTermin — Telefonnummer', () => {
  it('normalisiert nach E.164', async () => {
    await waehleTermin(db, { ...basis, telefon: '0251 / 12 34 56' })
    expect(state.inserts.levelup_termine.telefon).toBe('+49251123456')
  })

  it('lehnt eine unbrauchbare Nummer ab, bevor etwas entsteht', async () => {
    const r = await waehleTermin(db, { ...basis, telefon: 'ruf mich an' })
    expect(r).toEqual({ ok: false, error: 'telefon_ungueltig' })
    expect(state.angefasst).toEqual([])
  })

  /** ⚠ Die Nummer darf in keinem Log landen — auch nicht im Fehlerfall. */
  it('loggt die Nummer nie im Klartext', async () => {
    const ausgaben: string[] = []
    const spion = vi.spyOn(console, 'error').mockImplementation((...a) => { ausgaben.push(a.join(' ')) })
    state.terminFehler = 'kaputt'

    const r = await waehleTermin(db, { ...basis, telefon: '+4925112345678' })
    spion.mockRestore()

    expect(r.ok).toBe(false)
    expect(ausgaben.join(' ')).not.toContain('4925112345678')
    expect(JSON.stringify(r)).not.toContain('4925112345678')
  })
})

describe('waehleTermin — Lead und Verweise', () => {
  it('legt einen Lead an und verknuepft ihn mit dem Check', async () => {
    const r = await waehleTermin(db, basis)

    expect(r.ok).toBe(true)
    expect(state.updates.levelup_checks.sv_lead_id).toBe('sv_leads-1')
  })

  it('zieht Score und Check am Lead denormalisiert nach', async () => {
    await waehleTermin(db, basis)
    expect(state.updates.sv_leads).toMatchObject({
      levelup_letzter_check_id: 'C1',
      levelup_letzter_score: 62,
    })
  })

  it('nimmt den Firmennamen des Checks fuer den Lead', async () => {
    state.check = check({ firmenname: 'Sachverständigenbüro Meyer' } as Partial<Check>)
    await waehleTermin(db, basis)
    expect(state.inserts.sv_leads.firma).toBe('Sachverständigenbüro Meyer')
  })

  it('faellt ohne Firmennamen auf die Domain zurueck', async () => {
    await waehleTermin(db, basis)
    expect(state.inserts.sv_leads.name).toBe('meyer.de')
  })
})

describe('waehleTermin — Aufgabe fuer den Vertrieb', () => {
  it('spiegelt den Lead als Aufgabe', async () => {
    await waehleTermin(db, basis)
    expect(state.inserts.tasks).toMatchObject({
      typ: 'levelup_lead',
      entity_type: 'levelup_check',
      entity_id: 'C1',
      empfaenger_rolle: 'admin',
      prioritaet: 'hoch',
      auto_erstellt: true,
    })
  })

  /** `tasks.lead_id` zeigt auf public.leads — Schadenfaelle von Endkunden. */
  it('setzt lead_id NICHT', async () => {
    await waehleTermin(db, basis)
    expect(state.inserts.tasks.lead_id).toBeUndefined()
  })

  it('nennt in der Aufgabe Score und Termin', async () => {
    await waehleTermin(db, basis)
    const t = state.inserts.tasks
    expect(String(t.titel)).toContain('Münster')
    expect(String(t.beschreibung)).toContain('62')
  })
})

describe('waehleTermin — Regeln', () => {
  it('lehnt einen Slot in der Vergangenheit ab', async () => {
    const gestern = new Date(Date.now() - 86_400_000).toISOString()
    const r = await waehleTermin(db, { ...basis, slotStart: gestern })
    expect(r).toEqual({ ok: false, error: 'slot_vergangen' })
    expect(state.angefasst).toEqual([])
  })

  it('lehnt einen unbekannten Token ab', async () => {
    state.check = null
    const r = await waehleTermin(db, basis)
    expect(r).toEqual({ ok: false, error: 'unbekannt' })
  })

  it('lehnt einen Check ab, der noch nicht fertig ist', async () => {
    state.check = check({ status: 'laeuft' })
    const r = await waehleTermin(db, basis)
    expect(r.ok).toBe(false)
  })

  /**
   * F-06: „Ein Check erzeugt hoechstens einen Lead. Zweiter Aufruf aktualisiert
   * den Termin." Sonst entstuenden bei jedem Umbuchen neue Leads.
   */
  it('legt beim zweiten Aufruf keinen zweiten Lead an', async () => {
    state.check = check({ sv_lead_id: 'BESTEHEND' } as Partial<Check>)
    state.vorhandenerTermin = { id: 'TERMIN-1', check_id: 'C1' }

    const r = await waehleTermin(db, basis)

    expect(r.ok).toBe(true)
    expect(state.angefasst).not.toContain('sv_leads')
    expect(state.updates.levelup_termine.slot_start).toBe(basis.slotStart)
  })

  it('schreibt das Ereignis termin_gewaehlt', async () => {
    await waehleTermin(db, basis)
    expect(state.inserts.levelup_events).toMatchObject({ typ: 'termin_gewaehlt' })
  })

  it('meldet einen fehlgeschlagenen Termin-Insert als Fehler', async () => {
    state.terminFehler = 'constraint'
    const r = await waehleTermin(db, basis)
    expect(r.ok).toBe(false)
  })
})
