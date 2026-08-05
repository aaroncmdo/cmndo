import { describe, it, expect, vi } from 'vitest'

// Mock token generation so tests are deterministic
vi.mock('./token', () => ({
  generateSchadenkarteToken: vi.fn(() => 'SKT-AAAAAAAAAAAAAAAA'),
}))

import {
  mintSchadenkarten,
  bindeSchadenkarteAnFahrzeug,
  resolveSchadenkarteToFahrzeug,
  getKartenFuerFirma,
  getGebundeneFahrzeugIds,
  sperreSchadenkarte,
  entsperreSchadenkarte,
  entbindeSchadenkarte,
  speichereNfcUid,
  finalisiereSchadenkarte,
} from './schadenkarte'

// ---------------------------------------------------------------------------
// Helpers to build mock db chains
// ---------------------------------------------------------------------------

function makeDb(overrides: {
  selectResult?: unknown
  insertResult?: { error: { code: string; message: string } | null }
  updateResult?: { data: unknown; error: { code: string; message: string } | null }
}) {
  // Erfasst die Update-Payload per vi.fn(), damit Tests pruefen koennen WAS geschrieben wird
  // (nicht nur res.ok) -- Code-Review-Fund: die vorherige Version ignorierte das Argument von
  // .update(...) komplett, wodurch z.B. ein versehentliches status:'gebunden' in
  // entsperreSchadenkarte unbemerkt geblieben waere.
  const updateMock = vi.fn(() => ({
    eq: () => ({
      eq: () => ({
        select: () => ({
          maybeSingle: async () =>
            overrides.updateResult ?? { data: { id: 'u1' }, error: null },
        }),
      }),
    }),
  }))

  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => overrides.selectResult ?? { data: null },
          }),
          maybeSingle: async () => overrides.selectResult ?? { data: null },
          order: () => ({ data: overrides.selectResult ?? null }),
        }),
        maybeSingle: async () => overrides.selectResult ?? { data: null },
      }),
      insert: async () => overrides.insertResult ?? { error: null },
      update: updateMock,
    }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any

  return { db, updateMock }
}

// ---------------------------------------------------------------------------
// mintSchadenkarten
// ---------------------------------------------------------------------------

describe('mintSchadenkarten', () => {
  it('rejects anzahl > 200', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = {} as any
    const res = await mintSchadenkarten(db, { firmaId: 'f1', anzahl: 201 })
    expect(res.ok).toBe(false)
    expect((res as { ok: false; error: string }).error).toMatch(/200/)
  })

  it('rejects anzahl < 1', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await mintSchadenkarten({} as any, { firmaId: 'f1', anzahl: 0 })
    expect(res.ok).toBe(false)
  })

  it('returns tokens on success', async () => {
    const db = {
      from: () => ({ insert: async () => ({ error: null }) }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const res = await mintSchadenkarten(db, { firmaId: 'f1', anzahl: 2 })
    expect(res.ok).toBe(true)
    expect((res as { ok: true; tokens: string[] }).tokens).toHaveLength(2)
  })

  it('retries on UNIQUE collision (23505) and succeeds on second attempt', async () => {
    const { generateSchadenkarteToken } = await import('./token')
    const mockGen = vi.mocked(generateSchadenkarteToken)
    mockGen.mockReturnValueOnce('SKT-COLLISION0000000').mockReturnValue('SKT-UNIQUE000000000')

    let call = 0
    const db = {
      from: () => ({
        insert: async () => {
          call++
          if (call === 1) return { error: { code: '23505', message: 'unique violation' } }
          return { error: null }
        },
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const res = await mintSchadenkarten(db, { firmaId: 'f1', anzahl: 1 })
    expect(res.ok).toBe(true)
    expect(call).toBe(2)
  })

  it('aborts on non-unique DB error', async () => {
    const db = {
      from: () => ({
        insert: async () => ({ error: { code: '42P01', message: 'relation missing' } }),
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const res = await mintSchadenkarten(db, { firmaId: 'f1', anzahl: 1 })
    expect(res.ok).toBe(false)
    expect((res as { ok: false; error: string }).error).toMatch(/relation missing/)
  })
})

// ---------------------------------------------------------------------------
// bindeSchadenkarteAnFahrzeug
// ---------------------------------------------------------------------------

// Tabellen-bewusster Mock: bindeSchadenkarteAnFahrzeug fragt ZWEI Tabellen ab
// (flotten_fahrzeuge fuer das Fahrzeug-Ownership-Gate, dann schadenkarten) --
// der generische makeDb unterscheidet from()-Argumente nicht.
function makeBindDb(opts: {
  /** false = Fahrzeug gehoert NICHT zur Firma (flotten_fahrzeuge liefert keine Zeile). */
  fahrzeugOwner?: boolean
  karte?: unknown
  updateResult?: { data: unknown; error: { code: string; message: string } | null }
}) {
  return {
    from: (table: string) => {
      if (table === 'flotten_fahrzeuge') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: (opts.fahrzeugOwner ?? true) ? { id: 'ff1' } : null,
                }),
              }),
            }),
          }),
        }
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: opts.karte ?? null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () =>
                  opts.updateResult ?? { data: { id: 'k1' }, error: null },
              }),
            }),
          }),
        }),
      }
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('bindeSchadenkarteAnFahrzeug', () => {
  it('weist ein Fahrzeug ab, das NICHT zur Firma gehoert (Ownership-Gate)', async () => {
    // Karte gehoert der Firma und ist frei -- ohne das Gate ginge der Bind durch und
    // /schaden/[token] zeigte anschliessend fremde Fahrzeugdaten (Kennzeichen etc.).
    const db = makeBindDb({
      fahrzeugOwner: false,
      karte: { id: 'k1', status: 'frei', firma_id: 'f1' },
    })
    const res = await bindeSchadenkarteAnFahrzeug(db, {
      token: 'SKT-TOKEN000000000',
      fahrzeugId: 'FREMDES_FAHRZEUG',
      firmaId: 'f1',
      userId: 'u1',
    })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/nicht zu Ihrer Flotte/i)
  })

  it('returns error when card not found', async () => {
    const db = makeBindDb({ karte: null })
    const res = await bindeSchadenkarteAnFahrzeug(db, {
      token: 'SKT-UNKNOWN000000',
      fahrzeugId: 'v1',
      firmaId: 'f1',
      userId: 'u1',
    })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Karte nicht gefunden.')
  })

  it('returns error when card firma_id differs from caller firmaId', async () => {
    const db = makeBindDb({
      karte: { id: 'k1', status: 'frei', firma_id: 'ANDERE_FIRMA' },
    })
    const res = await bindeSchadenkarteAnFahrzeug(db, {
      token: 'SKT-TOKEN000000000',
      fahrzeugId: 'v1',
      firmaId: 'MEINE_FIRMA',
      userId: 'u1',
    })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Karte gehört zu einer anderen Firma.')
  })

  it('returns error when card is already gebunden', async () => {
    const db = makeBindDb({
      karte: { id: 'k1', status: 'gebunden', firma_id: 'f1' },
    })
    const res = await bindeSchadenkarteAnFahrzeug(db, {
      token: 'SKT-TOKEN000000000',
      fahrzeugId: 'v1',
      firmaId: 'f1',
      userId: 'u1',
    })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Karte ist bereits gebunden oder gesperrt.')
  })

  it('maps a 23505 on UPDATE to "Dieses Fahrzeug hat bereits eine aktive Karte."', async () => {
    const db = makeBindDb({
      karte: { id: 'k1', status: 'frei', firma_id: 'f1' },
      updateResult: { data: null, error: { code: '23505', message: 'unique_violation' } },
    })
    const res = await bindeSchadenkarteAnFahrzeug(db, {
      token: 'SKT-TOKEN000000000',
      fahrzeugId: 'v1',
      firmaId: 'f1',
      userId: 'u1',
    })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Dieses Fahrzeug hat bereits eine aktive Karte.')
  })

  it('succeeds when card is frei and update returns a row', async () => {
    const db = makeBindDb({
      karte: { id: 'k1', status: 'frei', firma_id: 'f1' },
      updateResult: { data: { id: 'k1' }, error: null },
    })
    const res = await bindeSchadenkarteAnFahrzeug(db, {
      token: 'SKT-TOKEN000000000',
      fahrzeugId: 'v1',
      firmaId: 'f1',
      userId: 'u1',
    })
    expect(res.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// resolveSchadenkarteToFahrzeug
// ---------------------------------------------------------------------------

describe('resolveSchadenkarteToFahrzeug', () => {
  it('returns null for unknown token', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const res = await resolveSchadenkarteToFahrzeug(db, 'SKT-UNKNOWN000000')
    expect(res).toBeNull()
  })

  it('returns fahrzeugId + firmaId + status for known token', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { fahrzeug_id: 'v1', firma_id: 'f1', status: 'gebunden' },
            }),
          }),
        }),
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const res = await resolveSchadenkarteToFahrzeug(db, 'SKT-TOKEN000000000')
    expect(res).toEqual({ fahrzeugId: 'v1', firmaId: 'f1', status: 'gebunden' })
  })
})

// ---------------------------------------------------------------------------
// getKartenFuerFirma
// ---------------------------------------------------------------------------

describe('getKartenFuerFirma', () => {
  it('returns empty array when no rows', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({ data: null }),
          }),
        }),
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const res = await getKartenFuerFirma(db, 'f1')
    expect(res).toEqual([])
  })

  it('maps rows to camelCase shape', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              data: [
                { id: 'k1', karten_token: 'SKT-AAA', status: 'frei', fahrzeug_id: null },
                { id: 'k2', karten_token: 'SKT-BBB', status: 'gebunden', fahrzeug_id: 'v1' },
              ],
            }),
          }),
        }),
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const res = await getKartenFuerFirma(db, 'f1')
    expect(res).toEqual([
      { id: 'k1', token: 'SKT-AAA', status: 'frei', fahrzeugId: null },
      { id: 'k2', token: 'SKT-BBB', status: 'gebunden', fahrzeugId: 'v1' },
    ])
  })

  it('nurGebunden=true filtert auf status=gebunden', async () => {
    const eqCalls: Array<[string, string]> = []
    const db = {
      from: () => ({
        select: () => ({
          eq: (c: string, v: string) => {
            eqCalls.push([c, v])
            return {
              eq: (c2: string, v2: string) => {
                eqCalls.push([c2, v2])
                return { order: () => ({ data: [] }) }
              },
              order: () => ({ data: [] }),
            }
          },
        }),
      }),
    } as never
    await getKartenFuerFirma(db, 'f1', { nurGebunden: true })
    expect(eqCalls).toContainEqual(['status', 'gebunden'])
  })
})

// ---------------------------------------------------------------------------
// getGebundeneFahrzeugIds
// ---------------------------------------------------------------------------

describe('getGebundeneFahrzeugIds', () => {
  it('sammelt fahrzeug_id gebundener Karten in ein Set (null gefiltert)', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              not: () => ({
                data: [{ fahrzeug_id: 'v1' }, { fahrzeug_id: 'v2' }, { fahrzeug_id: null }],
              }),
            }),
          }),
        }),
      }),
    } as never
    const res = await getGebundeneFahrzeugIds(db, 'f1')
    expect(res).toEqual(new Set(['v1', 'v2']))
  })

  it('kein data -> leeres Set', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ not: () => ({ data: null }) }) }),
        }),
      }),
    } as never
    expect(await getGebundeneFahrzeugIds(db, 'f1')).toEqual(new Set())
  })
})

// ---------------------------------------------------------------------------
// Lebenszyklus: sperren / entsperren / entbinden
// ---------------------------------------------------------------------------

describe('sperreSchadenkarte', () => {
  it('sperrt eine gebundene Karte', async () => {
    const { db, updateMock } = makeDb({
      selectResult: { data: { id: 'k1', status: 'gebunden', firma_id: 'f1', fahrzeug_id: 'v1' } },
      updateResult: { data: { id: 'k1' }, error: null },
    })
    const res = await sperreSchadenkarte(db, { token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1' })
    expect(res.ok).toBe(true)
    // Beweist, WAS geschrieben wird -- nicht nur dass res.ok true ist.
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'gesperrt' }))
  })

  it('ist IDEMPOTENT: eine bereits gesperrte Karte erneut zu sperren ist ok', async () => {
    // Notfall-Pfad (Karte verloren) -- muss Doppelklick/Retry ueberstehen.
    const { db, updateMock } = makeDb({
      selectResult: { data: { id: 'k1', status: 'gesperrt', firma_id: 'f1', fahrzeug_id: 'v1' } },
    })
    const res = await sperreSchadenkarte(db, { token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1' })
    expect(res.ok).toBe(true)
    // Idempotenz heisst: gar KEIN Update wird abgesetzt, nicht nur "irgendein Update ok".
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('weist eine Karte einer FREMDEN Firma ab', async () => {
    const { db } = makeDb({
      selectResult: { data: { id: 'k1', status: 'gebunden', firma_id: 'ANDERE', fahrzeug_id: 'v1' } },
    })
    const res = await sperreSchadenkarte(db, { token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1' })
    expect(res.ok).toBe(false)
    // Regex korrigiert (Brief-Typo: "andere Firma" ohne -n matcht nicht die dativische
    // Form "anderen Firma", die bindeSchadenkarteAnFahrzeug bereits verwendet, s. Zeile 166).
    expect(res.error).toMatch(/anderen Firma/i)
  })

  it('weist eine unbekannte Karte ab', async () => {
    const { db } = makeDb({ selectResult: { data: null } })
    const res = await sperreSchadenkarte(db, { token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/nicht gefunden/i)
  })
})

describe('entsperreSchadenkarte', () => {
  it('setzt eine gesperrte Karte auf FREI (nicht zurueck auf gebunden)', async () => {
    // Bewusst 'frei': das Fahrzeug hat evtl. schon eine Ersatzkarte -- ein automatisches
    // Zurueck-auf-gebunden wuerde den Partial-Unique verletzen bzw. zwei gueltige Karten
    // erzeugen. Die Karte muss BEWUSST neu gebunden werden.
    const { db, updateMock } = makeDb({
      selectResult: { data: { id: 'k1', status: 'gesperrt', firma_id: 'f1', fahrzeug_id: 'v1' } },
      updateResult: { data: { id: 'k1' }, error: null },
    })
    const res = await entsperreSchadenkarte(db, { token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1' })
    expect(res.ok).toBe(true)
    // Sicherheitskritisch: muss 'frei' schreiben, NICHT 'gebunden' -- sonst wird eine als
    // verloren gemeldete Karte stillschweigend wieder scharf (s. setzeStatus-Aufruf oben).
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'frei', fahrzeug_id: null }),
    )
  })

  it('weist eine NICHT gesperrte Karte ab (kein stiller No-op)', async () => {
    const { db } = makeDb({
      selectResult: { data: { id: 'k1', status: 'gebunden', firma_id: 'f1', fahrzeug_id: 'v1' } },
    })
    const res = await entsperreSchadenkarte(db, { token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/nicht gesperrt/i)
  })
})

describe('entbindeSchadenkarte', () => {
  it('loest eine gebundene Karte vom Fahrzeug (-> frei)', async () => {
    const { db, updateMock } = makeDb({
      selectResult: { data: { id: 'k1', status: 'gebunden', firma_id: 'f1', fahrzeug_id: 'v1' } },
      updateResult: { data: { id: 'k1' }, error: null },
    })
    const res = await entbindeSchadenkarte(db, { token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1' })
    expect(res.ok).toBe(true)
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'frei', fahrzeug_id: null }),
    )
  })

  it('weist eine NICHT gebundene Karte ab', async () => {
    const { db } = makeDb({
      selectResult: { data: { id: 'k1', status: 'frei', firma_id: 'f1', fahrzeug_id: null } },
    })
    const res = await entbindeSchadenkarte(db, { token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/nicht gebunden/i)
  })

  it('meldet einen Race (Karte wurde zwischenzeitlich geaendert)', async () => {
    // Optimistic-Guard .eq('status', alterStatus) matcht nicht mehr -> data === null
    const { db } = makeDb({
      selectResult: { data: { id: 'k1', status: 'gebunden', firma_id: 'f1', fahrzeug_id: 'v1' } },
      updateResult: { data: null, error: null },
    })
    const res = await entbindeSchadenkarte(db, { token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/zwischenzeitlich/i)
  })
})

// ---------------------------------------------------------------------------
// speichereNfcUid
// ---------------------------------------------------------------------------

describe('speichereNfcUid', () => {
  it('speichert die Chip-Seriennummer an der Karte', async () => {
    // makeDb gibt seit 9f13b1430 { db, updateMock } zurueck (nicht mehr db direkt) --
    // destrukturieren wie bei allen anderen Tests in dieser Datei.
    const { db, updateMock } = makeDb({
      selectResult: { data: { id: 'k1', status: 'gebunden', firma_id: 'f1', fahrzeug_id: 'v1' } },
      updateResult: { data: { id: 'k1' }, error: null },
    })
    const res = await speichereNfcUid(db, {
      token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1', nfcUid: '04:a2:24:bb',
    })
    expect(res.ok).toBe(true)
    // Beweist, WAS geschrieben wird -- nicht nur dass res.ok true ist. Code-Review-Fund:
    // ein Tippfehler wie { status: params.nfcUid } statt { nfc_uid: params.nfcUid } waere
    // sonst unbemerkt gruen geblieben (s. Lifecycle-Tests oben, gleiches Muster).
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ nfc_uid: '04:a2:24:bb' }))
  })

  it('weist eine Karte einer fremden Firma ab', async () => {
    const { db } = makeDb({
      selectResult: { data: { id: 'k1', status: 'frei', firma_id: 'ANDERE', fahrzeug_id: null } },
    })
    const res = await speichereNfcUid(db, {
      token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1', nfcUid: '04:a2:24:bb',
    })
    expect(res.ok).toBe(false)
  })

  it('meldet einen Race, wenn der firma_id-Guard beim Write keine Zeile matcht (TOCTOU)', async () => {
    // Der zweite .eq('firma_id', ...) beim Write matcht keine Zeile mehr (z.B. firma_id
    // wurde zwischen Read und Write per ON DELETE SET NULL auf NULL gesetzt) -> PostgREST
    // liefert data: null, error: null. Ohne den !data-Check (analog setzeStatus) wuerde
    // das faelschlich ok:true melden, obwohl nichts geschrieben wurde.
    const { db } = makeDb({
      selectResult: { data: { id: 'k1', status: 'gebunden', firma_id: 'f1', fahrzeug_id: 'v1' } },
      updateResult: { data: null, error: null },
    })
    const res = await speichereNfcUid(db, {
      token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1', nfcUid: '04:a2:24:bb',
    })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/zwischenzeitlich/i)
  })
})

// ---------------------------------------------------------------------------
// finalisiereSchadenkarte (uid + optional bind, ein Aufruf fuer beide Portale)
// ---------------------------------------------------------------------------

describe('finalisiereSchadenkarte', () => {
  it('vermerkt uid UND bindet, wenn beide gegeben sind', async () => {
    const { db, updateMock } = makeDb({
      selectResult: { data: { id: 'k1', status: 'frei', firma_id: 'f1', fahrzeug_id: null } },
      updateResult: { data: { id: 'k1' }, error: null },
    })
    const res = await finalisiereSchadenkarte(db, {
      token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1', userId: 'u1', nfcUid: '04:aa', fahrzeugId: 'v1',
    })
    expect(res.ok).toBe(true)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ nfc_uid: '04:aa' }))
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'gebunden', fahrzeug_id: 'v1' }))
  })

  it('bindet NICHT, wenn fahrzeugId null ist (nur beschreiben)', async () => {
    const { db, updateMock } = makeDb({
      selectResult: { data: { id: 'k1', status: 'bestellt', firma_id: 'f1', fahrzeug_id: null } },
      updateResult: { data: { id: 'k1' }, error: null },
    })
    const res = await finalisiereSchadenkarte(db, {
      token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1', userId: 'u1', nfcUid: '04:aa', fahrzeugId: null,
    })
    expect(res.ok).toBe(true)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ nfc_uid: '04:aa' }))
    expect(updateMock).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'gebunden' }))
  })

  it('macht KEINEN uid-Write, wenn nfcUid null ist', async () => {
    const { db, updateMock } = makeDb({
      selectResult: { data: { id: 'k1', status: 'frei', firma_id: 'f1', fahrzeug_id: null } },
      updateResult: { data: { id: 'k1' }, error: null },
    })
    const res = await finalisiereSchadenkarte(db, {
      token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1', userId: 'u1', nfcUid: null, fahrzeugId: 'v1',
    })
    expect(res.ok).toBe(true)
    expect(updateMock).not.toHaveBeenCalledWith(expect.objectContaining({ nfc_uid: expect.anything() }))
  })

  it('propagiert einen Fehler aus dem uid-Schritt (fremde Firma)', async () => {
    const { db } = makeDb({
      selectResult: { data: { id: 'k1', status: 'frei', firma_id: 'ANDERE', fahrzeug_id: null } },
    })
    const res = await finalisiereSchadenkarte(db, {
      token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1', userId: 'u1', nfcUid: '04:aa', fahrzeugId: 'v1',
    })
    expect(res.ok).toBe(false)
  })

  it('ist ein No-op (ok:true) wenn weder uid noch fahrzeugId gegeben', async () => {
    const { db, updateMock } = makeDb({})
    const res = await finalisiereSchadenkarte(db, {
      token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1', userId: 'u1', nfcUid: null, fahrzeugId: null,
    })
    expect(res.ok).toBe(true)
    expect(updateMock).not.toHaveBeenCalled()
  })
})
