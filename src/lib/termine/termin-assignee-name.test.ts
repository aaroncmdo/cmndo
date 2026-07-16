import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ladeSvAssigneeName } from './termin-assignee-name'

// Stub: branched ueber den Tabellennamen — 'sachverstaendige' liefert profile_id,
// 'profiles' den Namen. .maybeSingle() ist der terminale Promise (wie im Helper).
const makeDb = (
  svRow: { profile_id: string | null } | null,
  profilRow: { vorname: string | null; nachname: string | null } | null,
) =>
  ({
    from: (table: string) => {
      const chain: Record<string, (...a: unknown[]) => unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({ data: table === 'sachverstaendige' ? svRow : profilRow, error: null }),
      }
      return chain
    },
  }) as unknown as SupabaseClient

describe('ladeSvAssigneeName — Zwei-Schritt-Lookup ueber die assignee-Achse (CMM-49)', () => {
  it('sachverstaendiger mit Profil → Name', async () => {
    const db = makeDb({ profile_id: 'p1' }, { vorname: 'Thomas', nachname: 'Schmidt' })
    expect(await ladeSvAssigneeName(db, 'sachverstaendiger', 'sv1')).toEqual({
      vorname: 'Thomas',
      nachname: 'Schmidt',
    })
  })

  it('kundenbetreuer → null (Paritaet zum alten sachverstaendige-Embed: kb_beratung-Rows lieferten nie einen Namen)', async () => {
    const db = makeDb(null, { vorname: 'Maik', nachname: 'K' })
    expect(await ladeSvAssigneeName(db, 'kundenbetreuer', 'kb1')).toBeNull()
  })

  it('assignee_typ null → null (unassignter Termin)', async () => {
    const db = makeDb(null, null)
    expect(await ladeSvAssigneeName(db, null, null)).toBeNull()
  })

  it('SV ohne profile_id → null (kein Profil-Join moeglich)', async () => {
    const db = makeDb({ profile_id: null }, { vorname: 'X', nachname: 'Y' })
    expect(await ladeSvAssigneeName(db, 'sachverstaendiger', 'sv1')).toBeNull()
  })

  it('Profil-Row fehlt → null statt Crash', async () => {
    const db = makeDb({ profile_id: 'p1' }, null)
    expect(await ladeSvAssigneeName(db, 'sachverstaendiger', 'sv1')).toBeNull()
  })
})
