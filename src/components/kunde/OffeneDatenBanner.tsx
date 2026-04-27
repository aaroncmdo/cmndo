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

async function loadOffenCount(): Promise<number | null> {
  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) return null

    const { data: fall } = await supabase
      .from('faelle')
      .select('id')
      .eq('kunde_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!fall?.id) return null

    const claimId = await resolveClaimId(supabase, fall.id)
    if (!claimId) return null

    const claim = await getClaimForRole(supabase, claimId, 'kunde')
    if (!claim) return null

    const pflichtDocs = await getPflichtdokumenteStand(fall.id)
    const anforderungen = getOffeneDokumentAnforderungen(claim, pflichtDocs)
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
    <div className="border-b border-amber-200 bg-amber-50">
      <Link
        href="/kunde/onboarding?step=dokumente"
        className="flex items-center gap-3 px-4 py-3 hover:bg-amber-100 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center flex-shrink-0">
          <AlertCircleIcon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            {offen === 1
              ? 'Ein Dokument fehlt noch'
              : `${offen} Dokumente fehlen noch`}
          </p>
          <p className="text-xs text-amber-800">
            Tippen Sie hier, um die fehlenden Unterlagen hochzuladen.
          </p>
        </div>
        <span className="text-amber-900 text-sm font-medium">›</span>
      </Link>
    </div>
  )
}
