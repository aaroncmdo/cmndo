'use client'

// Kasko-Claim ohne Bindungsantwort: Tariffrage VOR dem Werkstatt-Finder (Spec §6, Umgehung b).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ShieldCheckIcon } from 'lucide-react'
import { Card } from '@/components/primitives'
import { KaskoTarifFrage } from '@/components/self-service/KaskoTarifFrage'
import type { KaskoTarifAuswahl } from '@/lib/kasko-wb/types'
import { speichereKaskoTarifPortal } from '@/app/kunde/faelle/[id]/kasko-tarif-actions'

export default function KaskoTarifCard({
  claimId,
  onGespeichert,
}: {
  claimId: string
  /** Korrekturmodus der KaskoBindungCard: nach dem Speichern zurueck in die Ansicht (Review #5864, Befund 2). */
  onGespeichert?: (freieWerkstattwahl: boolean | null) => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function speichere(auswahl: KaskoTarifAuswahl) {
    setBusy(true)
    const r = await speichereKaskoTarifPortal(claimId, auswahl)
    setBusy(false)
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    if (r.freieWerkstattwahl === null) toast.message('Bitte prüfen Sie Ihren Versicherungsschein vor der Reparatur – unser Team meldet sich.')
    onGespeichert?.(r.freieWerkstattwahl)
    router.refresh()
  }

  return (
    <Card p={5} radius="lg">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheckIcon className="h-5 w-5 text-claimondo-ondo" aria-hidden />
        <h2 className="text-heading-sm text-claimondo-navy">Ihr Kasko-Tarif</h2>
      </div>
      {/* Kein Mail-Hinweis: der Portal-Pfad schickt keine E6-Mail (Review #5864, Befund 5). */}
      <KaskoTarifFrage kompakt anrede="Sie" mitMailHinweis={false} onErgebnis={(auswahl) => void speichere(auswahl)} busy={busy} />
    </Card>
  )
}
