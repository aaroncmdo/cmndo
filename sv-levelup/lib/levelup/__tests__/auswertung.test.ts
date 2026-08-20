import { describe, expect, it } from 'vitest'
import { erzeugeAuswertungslink, ordneFuerVertrieb, type VertriebsZeile } from '../auswertung'
import type { Db } from '../../anreicherung/schreiben'

function zeile(over: Partial<VertriebsZeile>): VertriebsZeile {
  return {
    checkId: 'c1', token: 't1', firmenname: 'Büro A', ort: 'Münster',
    erhobenAm: '2026-08-19T10:00:00.000Z', score: 60, keinScore: false,
    terminAm: null, svLeadId: null, claimStatus: null,
    ...over,
  }
}

describe('ordneFuerVertrieb', () => {
  it('stellt Checks mit Terminwunsch nach vorn', () => {
    const geordnet = ordneFuerVertrieb([
      zeile({ checkId: 'ohne', erhobenAm: '2026-08-20T10:00:00.000Z' }),
      zeile({ checkId: 'mit', erhobenAm: '2026-08-10T10:00:00.000Z', terminAm: '2026-08-25T09:00:00.000Z' }),
    ])
    // ⚠ Nicht der juengste Check steht oben, sondern der, bei dem jemand einen
    // Termin will — das ist der Vorgang, der als Naechstes ansteht.
    expect(geordnet[0].checkId).toBe('mit')
  })

  it('sortiert innerhalb der Gruppen nach Datum, neueste zuerst', () => {
    const geordnet = ordneFuerVertrieb([
      zeile({ checkId: 'alt', erhobenAm: '2026-08-10T10:00:00.000Z' }),
      zeile({ checkId: 'neu', erhobenAm: '2026-08-19T10:00:00.000Z' }),
    ])
    expect(geordnet.map((z) => z.checkId)).toEqual(['neu', 'alt'])
  })

  it('sortiert Termine nach ihrem Zeitpunkt, der naechste zuerst', () => {
    const geordnet = ordneFuerVertrieb([
      zeile({ checkId: 'spaet', terminAm: '2026-08-30T09:00:00.000Z' }),
      zeile({ checkId: 'bald', terminAm: '2026-08-21T09:00:00.000Z' }),
    ])
    expect(geordnet.map((z) => z.checkId)).toEqual(['bald', 'spaet'])
  })

  it('kommt mit fehlendem Erhebungsdatum zurecht', () => {
    const geordnet = ordneFuerVertrieb([
      zeile({ checkId: 'ohne-datum', erhobenAm: null }),
      zeile({ checkId: 'mit-datum', erhobenAm: '2026-08-19T10:00:00.000Z' }),
    ])
    expect(geordnet).toHaveLength(2)
    expect(geordnet[0].checkId).toBe('mit-datum')
  })
})

describe('erzeugeAuswertungslink', () => {
  function db(vorhanden: { token: string } | null) {
    const eingefuegt: Record<string, unknown>[] = []
    return {
      db: {
        from: () => ({
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: vorhanden, error: null }),
              }),
            }),
          }),
          insert: (werte: Record<string, unknown>) => {
            eingefuegt.push(werte)
            return {
              select: () => ({
                single: async () => ({ data: { token: werte.token }, error: null }),
              }),
            }
          },
        }),
      } as unknown as Db,
      eingefuegt,
    }
  }

  it('erzeugt einen Link, wenn es noch keinen gibt', async () => {
    const { db: verbindung, eingefuegt } = db(null)
    const r = await erzeugeAuswertungslink(verbindung, 'c1', 'u1')
    expect(r.ok).toBe(true)
    expect(eingefuegt).toHaveLength(1)
    expect(String(eingefuegt[0].token)).toHaveLength(32)
    expect(eingefuegt[0].erstellt_von).toBe('u1')
  })

  it('gibt den bestehenden Link zurueck, statt einen zweiten zu erzeugen', async () => {
    // ⚠ Ohne diese Idempotenz sammelt jeder Aufruf ein weiteres gueltiges
    // Token an — und jedes muesste einzeln widerrufen werden, wenn eines
    // abhandenkommt.
    const { db: verbindung, eingefuegt } = db({ token: 'schon-da' })
    const r = await erzeugeAuswertungslink(verbindung, 'c1', 'u1')
    expect(r).toEqual({ ok: true, token: 'schon-da' })
    expect(eingefuegt).toHaveLength(0)
  })
})
