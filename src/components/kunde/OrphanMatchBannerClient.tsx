'use client'

// Identitaets-Engine §12 Login-Tor — Slice B Self-Confirm Banner (Client-Teil).
//
// Dezenter, schliessbarer Hinweis. §13-A: KEIN PII-Detail vor Confirm — nur die generische
// Frage, ob ein gefundener frueherer Vorgang zum User gehoert. "Ja, das bin ich" ruft
// confirmOrphanMatchAction (Re-Point + Tombstone, Identitaets-Dedup) und danach router.refresh
// — der server-seitige Match filtert die getombstonte Person ab dann raus, der Banner ist weg.
//
// Buttons aus primitives.Button (variant 'success'/'ghost' = semantisch/brand-getoent ->
// kein Whitelabel-Regress); Tailwind claimondo-* Klassen branden automatisch.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserCheckIcon, CheckCircle2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { confirmOrphanMatchAction } from '@/app/kunde/actions'

// Anti-Nag/Perf-Gate: nach explizitem Schliessen setzt der Client dieses Cookie; der
// Server-Teil (OrphanMatchBanner) ueberspringt dann den Match-RPC bei /kunde/*-Loads.
// Muss mit dem Literal in OrphanMatchBanner.tsx uebereinstimmen.
const ORPHAN_CHECK_COOKIE = 'cmndo_orphan_checked'

export default function OrphanMatchBannerClient({ orphanPersonId }: { orphanPersonId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [erledigt, setErledigt] = useState(false)
  const [geschlossen, setGeschlossen] = useState(false)

  if (geschlossen) return null

  if (erledigt) {
    return (
      <div className="mx-4 md:mx-8 mt-4 rounded-ios-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3">
        <CheckCircle2Icon className="w-5 h-5 shrink-0 text-emerald-600" />
        <p className="text-sm font-medium text-emerald-900">
          Danke! Wir haben den früheren Vorgang Ihrem Konto zugeordnet.
        </p>
      </div>
    )
  }

  async function handleConfirm() {
    setPending(true)
    const res = await confirmOrphanMatchAction(orphanPersonId)
    setPending(false)
    if (!res.ok) {
      toast.error(res.error ?? 'Es ist ein Fehler aufgetreten. Bitte erneut versuchen.')
      return
    }
    setErledigt(true)
    router.refresh()
  }

  function handleDismiss() {
    // 7 Tage kein erneuter Match-RPC nach explizitem Schliessen. Confirm setzt das BEWUSST
    // NICHT, damit der Server fuer weitere Orphan-Matches re-queryt (Multi-Match-UX).
    document.cookie = `${ORPHAN_CHECK_COOKIE}=1; path=/; max-age=604800; SameSite=Lax`
    setGeschlossen(true)
  }

  return (
    <div className="mx-4 md:mx-8 mt-4 rounded-ios-xl bg-claimondo-ondo/[0.06] border border-claimondo-ondo/30 px-4 py-4">
      <div className="flex items-start gap-3">
        <UserCheckIcon className="w-5 h-5 shrink-0 text-claimondo-navy mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-claimondo-navy">
            Gehört ein früherer Vorgang zu Ihnen?
          </p>
          <p className="text-xs text-claimondo-ondo mt-0.5">
            Wir haben einen möglichen früheren Vorgang gefunden, der zu Ihnen gehören könnte.
            Möchten Sie ihn Ihrem Konto zuordnen?
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button
          variant="success"
          size="sm"
          onClick={handleConfirm}
          loading={pending}
          disabled={pending}
        >
          Ja, das bin ich
        </Button>
        <Button variant="ghost" size="sm" onClick={handleDismiss} disabled={pending}>
          Schließen
        </Button>
      </div>
    </div>
  )
}
