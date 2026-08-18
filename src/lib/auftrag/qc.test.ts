import { describe, it, expect, vi } from 'vitest'

// Write-Path-Audit 2026-07-01, F5: loescheGutachtenDokument war nur durch getUser
// gegated -> jeder eingeloggte User konnte via beliebigem storagePath Bucket-Objekte
// loeschen. Jetzt: SV DIESES Auftrags ODER admin/KB. Ein FREMDER SV -> keine Berechtigung.

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const result =
        table === 'auftraege'
          ? { id: 'a1', fall_id: 'f1', sv_id: 'sv-OWNER', gutachten_final_freigegeben: false }
          : table === 'profiles'
            ? { rolle: 'sachverstaendiger' }
            : table === 'sachverstaendige'
              ? { id: 'sv-OTHER' } // != auftrag.sv_id 'sv-OWNER'
              : null
      // Nur LESE-Kettenglieder. Schreibende (`update`/`insert`/`upsert`) fehlen
      // ABSICHTLICH: dieser Test prueft, dass ein fremder SV NICHT schreiben darf —
      // ein gemocktes `update` wuerde einen Guard-Bruch stillschweigend durchlassen.
      // Ein Write im no-permission-Pfad soll hier krachen.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        single: async () => ({ data: result }),
        maybeSingle: async () => ({ data: result }),
      }
      return chain
    },
  }),
}))
// Import-Zeit-Nebenwirkungen von qc.ts vermeiden (im no-permission-Pfad nie erreicht).
vi.mock('@/lib/autoPhase', () => ({ checkFallAutoPhase: vi.fn() }))
vi.mock('@/lib/kanzlei/handoff-guard', () => ({ brauchtKanzleiHandoff: vi.fn() }))
vi.mock('@/lib/storage/url', () => ({ getStorageUrl: vi.fn() }))
vi.mock('@/lib/claims/get-claim-for-role', () => ({ resolveClaimId: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { loescheGutachtenDokument } from './qc'

describe('loescheGutachtenDokument — F5 Rollen-/Ownership-Gate', () => {
  it('verweigert einen fremden SV (nicht der Auftrags-SV)', async () => {
    const res = await loescheGutachtenDokument('a1', 'claims/other-claim/gutachten/x.pdf')
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Keine Berechtigung')
  })
})
