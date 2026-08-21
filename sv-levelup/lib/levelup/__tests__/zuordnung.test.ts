import { describe, expect, it, vi } from 'vitest'
import type { Db } from '../../anreicherung/schreiben'
import { domainVon, ordneCheckZu, waehleTreffer, type CheckAngabe, type LeadKandidat } from '../zuordnung'

function lead(p: Partial<LeadKandidat>): LeadKandidat {
  return {
    id: 'L1', firma: 'Sachverständigenbüro Bergk', name: 'Bergk',
    lat: 51.96, lng: 7.63, website_url: 'https://sv-bergk.de', ...p,
  }
}

function check(p: Partial<CheckAngabe>): CheckAngabe {
  return {
    firmenname: 'Sachverständigenbüro Bergk', website_url: 'https://sv-bergk.de',
    lat: 51.96, lng: 7.63, ...p,
  }
}

describe('domainVon', () => {
  it('macht aus verschiedenen Schreibweisen dieselbe Domain', () => {
    for (const roh of [
      'https://www.SV-Bergk.de/team',
      'http://sv-bergk.de',
      'sv-bergk.de/',
      'https://sv-bergk.de:443/impressum?a=1',
    ]) {
      expect(domainVon(roh)).toBe('sv-bergk.de')
    }
  })

  it('verwirft einen Host ohne Punkt', () => {
    // Sonst waeren zwei Betriebe „gleich", die nur gemeinsam haben, dass ihre
    // Adresse kaputt ist.
    expect(domainVon('localhost')).toBeNull()
    expect(domainVon('kaputt')).toBeNull()
  })

  it('verwirft Leerwerte', () => {
    expect(domainVon(null)).toBeNull()
    expect(domainVon('   ')).toBeNull()
  })
})

describe('waehleTreffer', () => {
  it('nimmt die Domain, wenn sie im Bestand eindeutig ist', () => {
    const t = waehleTreffer(check({}), [lead({ id: 'L7' })], [])
    expect(t).toMatchObject({ leadId: 'L7', wie: 'domain' })
  })

  it('findet ueber die Domain auch ohne Firmennamen im Check', () => {
    // ⚠ Der haeufige Fall: 6 der 11 Checks auf prod hatten keinen Firmennamen.
    // Ohne die Domain-Stufe waeren sie grundsaetzlich nicht zuzuordnen.
    const t = waehleTreffer(check({ firmenname: null }), [lead({ id: 'L7' })], [])
    expect(t?.leadId).toBe('L7')
  })

  it('ENTSCHEIDET BEI EINER KETTE ueber den Umkreis, nicht ueber die Domain', () => {
    // ⭐ 100 Kettenbetriebe im Bestand (TÜV, GTÜ, DEKRA, KÜS), jeder in einer
    // anderen Stadt. Traegt die Kette EINE Domain, traefe eine reine
    // Domain-Regel irgendeine Station — die Messung aus Münster landete in
    // Passau, und niemand saehe es.
    const stationen = [
      lead({ id: 'MUENSTER', lat: 51.96, lng: 7.63, website_url: 'https://dekra.de' }),
      lead({ id: 'PASSAU', lat: 48.57, lng: 13.43, website_url: 'https://dekra.de' }),
      lead({ id: 'KIEL', lat: 54.32, lng: 10.14, website_url: 'https://dekra.de' }),
    ]
    const t = waehleTreffer(check({ website_url: 'https://dekra.de' }), stationen, [])
    expect(t).toMatchObject({ leadId: 'MUENSTER', wie: 'domain_und_umkreis' })
  })

  it('RAET NICHT, wenn zwei Stationen derselben Kette nebeneinander sitzen', () => {
    const nebeneinander = [
      lead({ id: 'A', firma: 'DEKRA Nord', lat: 51.96, lng: 7.63, website_url: 'https://dekra.de' }),
      lead({ id: 'B', firma: 'DEKRA Süd', lat: 51.97, lng: 7.64, website_url: 'https://dekra.de' }),
    ]
    const t = waehleTreffer(
      check({ firmenname: 'Etwas ganz anderes', website_url: 'https://dekra.de' }),
      nebeneinander,
      [],
    )
    expect(t).toBeNull()
  })

  it('faellt bei uneindeutiger Domain auf den Namen zurueck', () => {
    // Die Domain kann nicht trennen — der Name kann es.
    const nebeneinander = [
      lead({ id: 'A', firma: 'DEKRA Nord', lat: 51.96, lng: 7.63, website_url: 'https://dekra.de' }),
      lead({ id: 'B', firma: 'DEKRA Süd', lat: 51.97, lng: 7.64, website_url: 'https://dekra.de' }),
    ]
    const t = waehleTreffer(
      check({ firmenname: 'DEKRA Süd', website_url: 'https://dekra.de' }),
      nebeneinander,
      nebeneinander,
    )
    expect(t).toMatchObject({ leadId: 'B', wie: 'name_und_umkreis' })
  })

  it('nimmt Name und Umkreis, wenn keine Website hinterlegt ist', () => {
    const t = waehleTreffer(check({ website_url: null }), [], [lead({ id: 'L3' })])
    expect(t).toMatchObject({ leadId: 'L3', wie: 'name_und_umkreis' })
  })

  it('ordnet NICHTS zu, wenn der Betrieb nicht im Bestand steht', () => {
    expect(waehleTreffer(check({}), [], [])).toBeNull()
  })

  it('ordnet ohne Koordinaten nur ueber eine eindeutige Domain zu', () => {
    expect(waehleTreffer(check({ lat: null, lng: null }), [lead({ id: 'L9' })], [])?.leadId).toBe('L9')
    expect(waehleTreffer(check({ lat: null, lng: null }), [], [lead({})])).toBeNull()
  })

  it('haelt einen weit entfernten Namensvetter NICHT fuer denselben Betrieb', () => {
    const weitWeg = lead({ id: 'FERN', lat: 48.13, lng: 11.58, website_url: null })
    expect(waehleTreffer(check({ website_url: null }), [], [weitWeg])).toBeNull()
  })
})

type Aufruf = { tabelle: string; werte?: Record<string, unknown> }

function db(opts: {
  domainTreffer?: LeadKandidat[]
  umkreisTreffer?: LeadKandidat[]
  updateLeer?: boolean
  fehler?: string
}): { db: Db; aufrufe: Aufruf[] } {
  const aufrufe: Aufruf[] = []
  let zaehler = 0

  const from = (tabelle: string) => {
    const kette: Record<string, unknown> = {}
    const gib = () => kette
    for (const m of ['select', 'not', 'ilike', 'gte', 'lte', 'eq']) {
      kette[m] = vi.fn(gib)
    }
    kette.update = vi.fn((werte: Record<string, unknown>) => {
      aufrufe.push({ tabelle, werte })
      return kette
    })
    // `select()` schliesst bei Lesevorgaengen die Kette ab (thenable), bei
    // Schreibvorgaengen kommt es nach `update`.
    kette.then = (aufloesen: (w: unknown) => void) => {
      if (opts.fehler) return aufloesen({ data: null, error: { message: opts.fehler } })
      const istSchreiben = aufrufe.some((a) => a.werte)
      if (istSchreiben) {
        return aufloesen({ data: opts.updateLeer ? [] : [{ id: 'x' }], error: null })
      }
      zaehler++
      const daten = zaehler === 1 ? (opts.domainTreffer ?? []) : (opts.umkreisTreffer ?? [])
      return aufloesen({ data: daten, error: null })
    }
    return kette
  }

  return { db: { from } as unknown as Db, aufrufe }
}

const CHECK = {
  id: 'C1', firmenname: 'Sachverständigenbüro Bergk', website_url: 'https://sv-bergk.de',
  lat: 51.96, lng: 7.63, score: 69,
}

describe('ordneCheckZu', () => {
  it('traegt die Messung an BEIDEN Enden nach', async () => {
    const { db: d, aufrufe } = db({ domainTreffer: [lead({ id: 'L7' })] })
    const r = await ordneCheckZu(d, CHECK)

    expect(r.ok && r.treffer).toMatchObject({ leadId: 'L7', wie: 'domain' })
    expect(aufrufe).toContainEqual({ tabelle: 'levelup_checks', werte: { sv_lead_id: 'L7' } })
    expect(aufrufe).toContainEqual({
      tabelle: 'sv_leads',
      werte: { levelup_letzter_check_id: 'C1', levelup_letzter_score: 69 },
    })
  })

  it('LEGT NIEMALS EINEN LEAD AN, wenn nichts passt', async () => {
    // ⭐ Die Startseite sagt zu: „kein Eintrag in einer Interessentenliste."
    // Ein bestehender Eintrag darf ergaenzt werden — ein neuer entsteht nicht.
    const { db: d, aufrufe } = db({})
    const r = await ordneCheckZu(d, CHECK)

    expect(r).toEqual({ ok: true, treffer: null })
    expect(aufrufe).toHaveLength(0)
  })

  it('meldet einen wirkungslosen Nachtrag als Fehlschlag', async () => {
    // ⚠ supabase-js wirft nicht. Ohne Zeilenpruefung saehe „nichts verknuepft"
    // exakt aus wie „verknuepft".
    const { db: d } = db({ domainTreffer: [lead({ id: 'L7' })], updateLeer: true })
    const r = await ordneCheckZu(d, CHECK)
    expect(r.ok).toBe(false)
  })

  it('reicht einen Lesefehler weiter, statt ihn als „nichts gefunden" auszugeben', async () => {
    // Ein nicht lesbarer Bestand ist NICHT dasselbe wie ein leerer Bestand.
    const { db: d } = db({ fehler: 'permission denied' })
    const r = await ordneCheckZu(d, CHECK)
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unerwartet')
    expect(r.error).toContain('permission denied')
  })
})
