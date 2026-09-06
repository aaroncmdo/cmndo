'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SectionCard } from '@/components/shared/SectionCard'

// KFZ-152 Phase 3 Follow-up: Community-Privatsphäre-Section — aus ProfilClient
// extrahiert (Task 2). Nur für Community-Mitglieder sichtbar (Gate bleibt in
// ProfilClient: rolle_in_organisation === 'community_member').

function PrivacyToggle({ svId, initial }: { svId: string; initial: boolean }) {
  const [active, setActive] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function toggle() {
    setSaving(true)
    setError(null)
    const next = !active
    setActive(next)
    try {
      const supabase = createClient()
      const { error: updErr } = await supabase
        .from('sachverstaendige')
        .update({ community_anonym: next })
        .eq('id', svId)
      if (updErr) {
        setError(updErr.message)
        setActive(!next) // rollback UI
      } else {
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className={`relative inline-flex items-center w-12 h-6 rounded-full transition-colors disabled:opacity-50 ${
          active ? 'bg-success' : 'bg-claimondo-border'
        }`}
      >
        <span className={`inline-block w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
          active ? 'translate-x-6' : 'translate-x-0.5'
        }`} />
      </button>
      <span className="ml-3 text-sm text-claimondo-navy">
        {active ? 'Anonym aktiviert' : 'Name sichtbar'}
        {saving && <span className="text-claimondo-ondo/70 text-xs ml-2">speichert...</span>}
      </span>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  )
}

export function ProfilCommunityPrivacy({ svId, initial }: { svId: string; initial: boolean }) {
  return (
    <SectionCard className="p-6 mt-5">
      <h2 className="text-sm font-medium text-claimondo-ondo mb-1">Community-Privatsphäre</h2>
      <p className="text-xs text-claimondo-ondo/70 mb-4">
        Wenn aktiv, sehen andere Community-Mitglieder im Leaderboard „Anonym" statt Ihres Namens.
        Ihre Statistiken (Fälle, Umsatz) bleiben sichtbar — nur Ihr Name wird verborgen.
      </p>
      <PrivacyToggle svId={svId} initial={initial} />
    </SectionCard>
  )
}
