import { describe, it, expect } from 'vitest'
import { resolveKundeBerater } from '../kunde-berater'

type Row = Record<string, unknown> | null

/** Minimaler chainable Supabase-Stub: .from(t).select().eq().maybeSingle() → canned Row je Tabelle. */
function makeDb(rows: Record<string, Row>) {
  return {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      }
      return builder
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('resolveKundeBerater', () => {
  it('pre-Termin → Dispatcher aus leads.zugewiesen_an', async () => {
    const db = makeDb({
      leads: { zugewiesen_an: 'disp-1' },
      profiles: { anzeigename: 'Jonas Berger', vorname: 'Jonas', nachname: 'Berger', avatar_url: 'https://x/a.png', telefon: '0221 16 89 76 0' },
    })
    const r = await resolveKundeBerater(db, { claimId: 'c1', leadId: 'l1', terminVergangen: false })
    expect(r).toEqual({ name: 'Jonas Berger', photoUrl: 'https://x/a.png', contact: 'WhatsApp · 0221 16 89 76 0' })
  })

  it('post-Termin → Kundenbetreuer aus claims.kundenbetreuer_id (Name aus vorname+nachname, kein Tel)', async () => {
    const db = makeDb({
      claims: { kundenbetreuer_id: 'kb-1' },
      profiles: { anzeigename: null, vorname: 'Anna', nachname: 'Weber', avatar_url: null, telefon: null },
    })
    const r = await resolveKundeBerater(db, { claimId: 'c1', leadId: 'l1', terminVergangen: true })
    expect(r).toEqual({ name: 'Anna Weber', photoUrl: null, contact: '' })
  })

  it('kein zugewiesener Dispatcher → null', async () => {
    const db = makeDb({ leads: { zugewiesen_an: null } })
    const r = await resolveKundeBerater(db, { claimId: 'c1', leadId: 'l1', terminVergangen: false })
    expect(r).toBeNull()
  })

  it('Profil ohne Namen → null', async () => {
    const db = makeDb({
      claims: { kundenbetreuer_id: 'kb-2' },
      profiles: { anzeigename: null, vorname: null, nachname: null, avatar_url: null, telefon: '0221' },
    })
    const r = await resolveKundeBerater(db, { claimId: 'c1', leadId: null, terminVergangen: true })
    expect(r).toBeNull()
  })
})
