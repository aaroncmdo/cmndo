import { describe, it, expect } from 'vitest'
import { getKundeTermine } from '../kunde-termine'

// Awaitable query-builder mock: jede Kette (.select().or().is().not().order() bzw.
// .neq().order()) endet in einem thenable, das { data } aufloest.
// Nur LESE-Kettenglieder — `or` kam mit der Bezug-Umstellung dazu
// (kunde-termine.ts -> bezugInExpr) und fehlte hier, wodurch die Query mit
// ".or is not a function" starb und der Test nichts mehr geprueft hat.
function builder(data: unknown[]) {
  const b: Record<string, unknown> = {}
  const chain = () => b
  for (const m of ['select', 'in', 'is', 'not', 'neq', 'or', 'order']) b[m] = chain
  ;(b as { then: (r: (v: { data: unknown[] }) => unknown) => unknown }).then = (r) =>
    r({ data })
  return b
}
function mkAdmin(sv: unknown[], rep: unknown[]) {
  return { from: (t: string) => builder(t === 'gutachter_termine' ? sv : rep) } as never
}

describe('getKundeTermine', () => {
  it('merged SV (fall_id) + Reparatur (claim_id), sortiert desc, discriminated art', async () => {
    const admin = mkAdmin(
      [{ id: 'sv1', start_zeit: '2026-07-10T09:00:00Z', status: 'bestaetigt', fall_id: 'f1', claim_id: null, kanal: 'vor_ort', typ: 'sv_begutachtung' }],
      [{ id: 'r1', bestaetigter_termin: '2026-07-12T10:00:00Z', wunschtermin: null, status: 'angefragt', claim_id: 'c1', werkstatt_id: 'w1' }],
    )
    const r = await getKundeTermine(admin, { fallIds: ['f1'], claimIds: ['c1'] })
    expect(r.map((t) => t.art)).toEqual(['reparatur', 'sv']) // 07-12 vor 07-10 (desc)
    expect(r.find((t) => t.art === 'sv')?.id).toBe('sv1')
    expect(r.find((t) => t.art === 'reparatur')?.start).toBe('2026-07-12T10:00:00Z')
  })

  it('Reparatur ohne bestaetigter_termin faellt auf wunschtermin zurueck', async () => {
    const admin = mkAdmin([], [{ id: 'r2', bestaetigter_termin: null, wunschtermin: '2026-07-15T08:00:00Z', status: 'angefragt', claim_id: 'c1', werkstatt_id: 'w1' }])
    const r = await getKundeTermine(admin, { fallIds: [], claimIds: ['c1'] })
    expect(r[0]?.start).toBe('2026-07-15T08:00:00Z')
  })

  it('leere IDs -> [] (kein DB-Call noetig)', async () => {
    expect(await getKundeTermine(mkAdmin([], []), { fallIds: [], claimIds: [] })).toEqual([])
  })
})
