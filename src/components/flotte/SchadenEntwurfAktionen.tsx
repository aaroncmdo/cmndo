'use client'

// Draft-Entwurf-Lifecycle (Aaron 24.07.): Aktionen fuer einen baren „Schaden-Entwurf" (Lead vor
// Claim-Konvertierung) in der FahrzeugSchaedenSection. Zwei Wege:
//   • Weitermachen  → FM-gegatete Action liefert FlowLink-Token → navigiert auf /flow/[token].
//                     Die Claim-Konvertierung passiert db-driven am /flow-Ende (nicht hier).
//   • Stornieren    → 2-Stufen-Bestaetigung (Draft-Storno ist destruktiv: Lead disqualifiziert +
//                     FlowLink abgelaufen), analog ConfirmEntfernenButton — hier aber inline, weil
//                     die beiden Aktionen zusammen eine Einheit bilden.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/primitives'

export function SchadenEntwurfAktionen({
  leadId,
  vehicleId,
  onFortsetzen,
  onStornieren,
}: {
  leadId: string
  vehicleId: string
  onFortsetzen: (leadId: string) => Promise<{ ok: true; token: string } | { ok: false; error: string }>
  onStornieren: (leadId: string, vehicleId: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<null | 'fort' | 'storno'>(null)
  const [armed, setArmed] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function weitermachen() {
    setBusy('fort')
    setFehler(null)
    const res = await onFortsetzen(leadId)
    if (!res.ok) {
      setBusy(null)
      setFehler(res.error)
      return
    }
    // busy bleibt gesetzt bis zur Navigation (kein Flackern zurueck auf „Weitermachen").
    router.push(`/flow/${res.token}`)
  }

  async function stornieren() {
    setBusy('storno')
    setFehler(null)
    const res = await onStornieren(leadId, vehicleId)
    setBusy(null)
    if (!res.ok) {
      setFehler(res.error ?? 'Storno fehlgeschlagen.')
      return
    }
    setArmed(false)
    router.refresh()
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-1">
        <Button variant="ondo" size="sm" loading={busy === 'fort'} disabled={busy === 'storno'} onClick={weitermachen}>
          Weitermachen
        </Button>
        {!armed ? (
          <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => setArmed(true)}>
            Stornieren
          </Button>
        ) : (
          <>
            <Button variant="danger" size="sm" loading={busy === 'storno'} onClick={stornieren}>
              Wirklich stornieren?
            </Button>
            <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => setArmed(false)}>
              Abbrechen
            </Button>
          </>
        )}
      </div>
      {fehler && <span className="text-body-xs text-danger-strong">{fehler}</span>}
    </div>
  )
}
