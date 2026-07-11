'use client'
// Vertrieb-Cockpit: kontextuelle Aktions-Leiste. Zeigt je aktiver Rolle-Pill x Lead/Partner
// die passenden Aktionen. „SV anlegen" oeffnet den Onboarding-Wizard als Drawer-Overlay (D2);
// die uebrigen Aktionen (CSV/Scrapen/Makler+Werkstatt-Liste/QR/Basis-Freigaben/SV-Karte) sind
// Deep-Links auf die tiefe Verwaltung — die sind RSC-daten-abhaengig und gehoeren als eigene
// Seiten (nicht sinnvoll in einen Drawer einbettbar).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Drawer } from '@/components/primitives'
import AnlegenTabs from '@/app/admin/sachverstaendige/anlegen/AnlegenTabs'
import { contextAktionen, type VertriebAktion } from './_lib/context-aktionen'
import type { VertriebRolle, VertriebTyp } from '@/lib/vertrieb/vertrieb-kontakt.types'

export default function VertriebAktionsleiste({
  rolle,
  typ,
}: {
  rolle: VertriebRolle | 'alle'
  typ: VertriebTyp | 'alle'
}) {
  const router = useRouter()
  const [svAnlegen, setSvAnlegen] = useState(false)
  const aktionen = contextAktionen(rolle, typ)
  if (aktionen.length === 0) return null

  function ausloesen(a: VertriebAktion) {
    if (a.key === 'anlegen-sv') {
      setSvAnlegen(true)
      return
    }
    if (a.href) router.push(a.href)
  }

  function schliessen() {
    setSvAnlegen(false)
    router.refresh()
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {aktionen.map((a) => (
          <Button
            key={a.key}
            variant={a.kind === 'anlegen' ? 'navy' : 'ondo'}
            size="sm"
            onClick={() => ausloesen(a)}
          >
            {a.label}
          </Button>
        ))}
      </div>

      <Drawer open={svAnlegen} onClose={schliessen} width={720} ariaLabel="Sachverständigen anlegen">
        <div className="space-y-4">
          <h2 className="text-heading-md text-claimondo-navy">Sachverständigen anlegen</h2>
          {/* onSuccess: Roster im Hintergrund aktualisieren, Drawer offen lassen (Result-Screen
              zeigt z. B. das Initial-Passwort). onCancel/„Zur SV-Liste": Drawer schliessen. */}
          <AnlegenTabs onSuccess={() => router.refresh()} onCancel={schliessen} />
        </div>
      </Drawer>
    </>
  )
}
