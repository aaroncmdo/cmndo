import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getOwnedClaimIds } from '@/lib/claims/owned-claims'
import NachbesichtigungClient from './NachbesichtigungClient'

export default async function NachbesichtigungPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // CMM-44 SP-D PR2b: nachbesichtigung_status lebt auf gutachter_termine (SSoT).
  // CMM-63 SP-C: owned claim_ids über claim_parties; faelle (id↔claim_id für den
  // Join unten) via Admin über claim_id statt faelle.kunde_id.
  const adminNb = createAdminClient()
  const claimIds = await getOwnedClaimIds(adminNb, user.id, user.email ?? null)
  const { data: kundeFaelle } = await adminNb
    .from('faelle')
    .select('id, claim_id')
    .in('claim_id', claimIds)

  let faelle: Array<{ id: string; nachbesichtigung_status: string | null; nachbesichtigung_termin_datum: string | null; nachbesichtigung_angefordert_am: string | null }> = []

  if (claimIds.length > 0) {
    // Aktuellen Termin pro Claim laden und nach nachbesichtigung_status='angefordert' filtern
    const { data: termine } = await supabase
      .from('gutachter_termine')
      .select('claim_id, nachbesichtigung_status, nachbesichtigung_termin_datum, nachbesichtigung_angefordert_am')
      .in('claim_id', claimIds)
      .eq('nachbesichtigung_status', 'angefordert')
      .order('start_zeit', { ascending: false })

    if (termine?.length) {
      // Je Claim nur den neuesten Termin (start_zeit DESC bereits sortiert)
      const seenClaims = new Set<string>()
      const matchingClaims = new Map<string, { nachbesichtigung_status: string | null; nachbesichtigung_termin_datum: string | null; nachbesichtigung_angefordert_am: string | null }>()
      for (const t of termine) {
        const cid = t.claim_id as string
        if (!seenClaims.has(cid)) {
          seenClaims.add(cid)
          matchingClaims.set(cid, {
            nachbesichtigung_status: t.nachbesichtigung_status as string | null,
            nachbesichtigung_termin_datum: t.nachbesichtigung_termin_datum as string | null,
            nachbesichtigung_angefordert_am: t.nachbesichtigung_angefordert_am as string | null,
          })
        }
      }

      faelle = (kundeFaelle ?? [])
        .filter((f) => {
          const cid = (f as { claim_id?: string | null }).claim_id
          return cid != null && matchingClaims.has(cid)
        })
        .map((f) => {
          const cid = (f as { claim_id?: string | null }).claim_id as string
          const nb = matchingClaims.get(cid)!
          return { id: f.id as string, ...nb }
        })
    }
  }

  if (!faelle?.length) {
    return (
      <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-claimondo-border p-8 max-w-md text-center">
          <p className="text-claimondo-ondo">Aktuell keine offene Nachbesichtigung.</p>
        </div>
      </div>
    )
  }

  return <NachbesichtigungClient faelle={faelle} />
}
