'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import type { FlottenFahrzeug } from '@/lib/kunde/firma-flotte'
import { bindeKarteAnFahrzeugPublic } from './actions'
import { SchadenVervollstaendigenButton } from '@/components/flotte/SchadenVervollstaendigenButton'

function fahrzeugLabel(f: FlottenFahrzeug): string {
  const marke = [f.hersteller, f.modell].filter(Boolean).join(' ')
  const kz = f.kennzeichen ?? 'ohne Kennzeichen'
  return marke ? `${kz} — ${marke}` : kz
}

/**
 * Rollen-Panel auf /schaden/[token] fuer den eingeloggten Flottenmanager der
 * Karten-Firma. `bind` = ungebundene Karte einem Fahrzeug zuweisen; `manage` =
 * gebundene Karte (Info + bewusstes "Schaden melden", KEIN Auto-Claim beim Tap).
 */
export function FlottenmanagerKartePanel({
  zweig,
  token,
  firmaName,
  fahrzeuge,
  gebundenesFahrzeugId,
  fortsetzenClaimId,
}: {
  zweig: 'bind' | 'manage'
  token: string
  firmaName: string
  fahrzeuge: FlottenFahrzeug[]
  gebundenesFahrzeugId: string | null
  /** T5-3a: existiert ein ersterfassung-Claim für das gebundene Fahrzeug → „Gutachter finden". */
  fortsetzenClaimId?: string | null
}) {
  const router = useRouter()
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function onBind() {
    if (!selected) {
      setFehler('Bitte ein Fahrzeug auswählen.')
      return
    }
    setBusy(true)
    setFehler(null)
    const res = await bindeKarteAnFahrzeugPublic(token, selected)
    setBusy(false)
    if (res.ok) {
      router.refresh() // Seite zeigt nun die Verwaltungs-Ansicht (gebunden)
    } else {
      setFehler(res.error ?? 'Binden fehlgeschlagen.')
    }
  }

  const gebundenes = gebundenesFahrzeugId
    ? (fahrzeuge.find((f) => f.vehicleId === gebundenesFahrzeugId) ?? null)
    : null

  return (
    <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <SectionCard>
          {zweig === 'bind' ? (
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1 text-center">
                <h1 className="text-heading-md text-claimondo-navy">Netzwerkkarte binden</h1>
                <p className="text-body-sm text-claimondo-ondo">
                  Diese Karte ist noch keinem Fahrzeug von {firmaName} zugewiesen. Wählen Sie
                  das Fahrzeug, zu dem sie gehört.
                </p>
              </div>

              {fahrzeuge.length === 0 ? (
                <p className="text-body-sm text-warning-strong text-center">
                  Ihre Flotte enthält noch keine Fahrzeuge.
                </p>
              ) : (
                <>
                  <select
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                    className="w-full rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-body-sm text-claimondo-navy"
                  >
                    <option value="">Fahrzeug auswählen …</option>
                    {fahrzeuge.map((f) => (
                      <option key={f.vehicleId} value={f.vehicleId}>
                        {fahrzeugLabel(f)}
                      </option>
                    ))}
                  </select>
                  <Button variant="ondo" loading={busy} onClick={onBind}>
                    An Fahrzeug binden
                  </Button>
                </>
              )}

              {fehler && <p className="text-body-sm text-danger-strong text-center">{fehler}</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1 text-center">
                <h1 className="text-heading-md text-claimondo-navy">Netzwerkkarte</h1>
                <p className="text-body-sm text-claimondo-ondo">
                  {gebundenes
                    ? `Gebunden an ${fahrzeugLabel(gebundenes)}.`
                    : 'Diese Karte ist an ein Fahrzeug Ihrer Flotte gebunden.'}
                </p>
              </div>
              <p className="text-body-xs text-claimondo-ondo text-center">
                Möchten Sie für dieses Fahrzeug einen Schaden melden? Der Schaden-Assistent
                startet erst auf Ihre Bestätigung.
              </p>
              <Button variant="ondo" onClick={() => router.push(`/schaden/${token}?melden=1`)}>
                Schaden melden
              </Button>
              {fortsetzenClaimId && (
                <div className="flex flex-col gap-2 border-t border-claimondo-border/60 pt-3">
                  <p className="text-body-xs text-claimondo-ondo text-center">
                    Für dieses Fahrzeug ist bereits ein Schaden erfasst. Setzen Sie ihn jetzt fort —
                    Gutachter, Werkstatt und Termin wählen Sie im Ablauf.
                  </p>
                  <SchadenVervollstaendigenButton claimId={fortsetzenClaimId} />
                </div>
              )}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
