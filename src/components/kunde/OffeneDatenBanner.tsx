// CMM-22: Persistenter Pflichtdaten-Banner im Kunden-Portal-Layout.
// Server-Component die selbst den aktuellen Claim + Pflicht-Dokumente
// lädt und basierend auf der Smart-Doku-Logik (CMM-21) entscheidet ob
// gerendert wird. Klick → /kunde/onboarding?step=dokumente.
//
// Sichtbarkeit: nur wenn mindestens ein offener Pflicht-Slot existiert
// (countOffenePflicht > 0). Sobald alles erfüllt ist → return null,
// Banner verschwindet automatisch.
//
// CMM-23: alle Loader in try/catch — wenn IRGENDWAS in dieser Component
// crashed (RLS-Edge-Case, Schema-Drift, etc.), darf das nicht den ganzen
// Server-Render der Layout-Page killen.

import Link from 'next/link'
import { AlertCircleIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getClaimForRole, resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { getOffeneDokumentAnforderungen, countOffenePflicht } from '@/lib/claims/data-requirements'
import { getPflichtdokumenteStand } from '@/app/kunde/onboarding/actions'
import { getAlleSlots } from '@/lib/dokumente/katalog'
import { buildDokumentKontext } from '@/lib/dokumente/build-kontext'

async function loadOffenCount(): Promise<number | null> {
  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) return null

    // CMM-65: created_at lebt auf claims (SSoT). supabase-js kann nicht nach eingebetteter
    // to-one-Spalte ordnen -> claims.created_at via !inner + clientseitig neuesten picken.
    // CMM-49 (faelle-Drop-Runway): Anker claims-zentrisch via Bridge statt .from('faelle').
    // kunde_id == claims.geschaedigter_user_id (Divergenz=0), bridge.fall_id == faelle.id.
    const { data: kundeFaelle } = await supabase
      .from('faelle_claim_bridge')
      .select('fall_id, claims:claim_id!inner(geschaedigter_user_id, created_at)')
      .eq('claims.geschaedigter_user_id', user.id)
    const fall = (kundeFaelle ?? [])
      .map((f) => ({ id: f.fall_id as string, _c: (Array.isArray(f.claims) ? f.claims[0] : f.claims)?.created_at ?? '' }))
      .sort((a, b) => b._c.localeCompare(a._c))[0] ?? null
    if (!fall?.id) return null

    const claimId = await resolveClaimId(supabase, fall.id)
    if (!claimId) return null

    const claim = await getClaimForRole(supabase, claimId, 'kunde')
    if (!claim) return null

    const pflichtDocs = await getPflichtdokumenteStand(fall.id)
    const katalogRows = await getAlleSlots(supabase)
    const ctx = buildDokumentKontext({ claim })
    const anforderungen = getOffeneDokumentAnforderungen(katalogRows, ctx, pflichtDocs)
    return countOffenePflicht(anforderungen)
  } catch (err) {
    console.error('[OffeneDatenBanner] crashed, hiding banner:', err)
    return null
  }
}

export default async function OffeneDatenBanner() {
  const offen = await loadOffenCount()
  if (offen == null || offen === 0) return null

  return (
    <div className="border-b border-warning/30 bg-warning-soft">
      <Link
        href="/kunde/onboarding?step=dokumente"
        className="flex items-center gap-3 px-4 py-3 hover:bg-warning/15 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-warning text-white flex items-center justify-center flex-shrink-0">
          <AlertCircleIcon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-warning-strong">
            {offen === 1
              ? 'Ein Dokument fehlt noch'
              : `${offen} Dokumente fehlen noch`}
          </p>
          <p className="text-xs text-warning-strong">
            Tippen Sie hier, um die fehlenden Unterlagen hochzuladen.
          </p>
        </div>
        <span className="text-warning-strong text-sm font-medium">›</span>
      </Link>
    </div>
  )
}
