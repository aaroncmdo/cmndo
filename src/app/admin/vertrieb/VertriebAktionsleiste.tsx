'use client'
// Vertrieb-Cockpit: kontextuelle Aktions-Leiste. Zeigt je aktiver Rolle-Pill x Lead/Partner
// die passenden Aktionen. „SV anlegen" oeffnet den Onboarding-Wizard als Drawer-Overlay (D2);
// CSV/Scrapen oeffnen als Cockpit-Drawer (kein Full-Page-Nav); die uebrigen Aktionen sind
// Deep-Links auf die tiefe Verwaltung.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Drawer } from '@/components/primitives'
import AnlegenTabs from '@/app/admin/sachverstaendige/anlegen/AnlegenTabs'
import QrPoolDrawerContent from './wizards/QrPoolDrawerContent'
import CsvImportPanel from '@/app/admin/partner-leads/CsvImportPanel'
import ScrapePanel from '@/app/admin/partner-leads/ScrapePanel'
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
  const [qrDrawer, setQrDrawer] = useState(false)
  const [csvDrawer, setCsvDrawer] = useState(false)
  const [scrapeDrawer, setScrapeDrawer] = useState(false)
  const aktionen = contextAktionen(rolle, typ)
  if (aktionen.length === 0) return null

  function ausloesen(a: VertriebAktion) {
    if (a.key === 'anlegen-sv') {
      setSvAnlegen(true)
      return
    }
    if (a.key === 'qrpool') {
      setQrDrawer(true)
      return
    }
    if (a.key === 'csv') {
      setCsvDrawer(true)
      return
    }
    if (a.key === 'scrape') {
      setScrapeDrawer(true)
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

      <Drawer
        open={qrDrawer}
        onClose={() => { setQrDrawer(false); router.refresh() }}
        width={860}
        ariaLabel="QR-Pool verwalten"
      >
        <QrPoolDrawerContent />
      </Drawer>

      <Drawer
        open={csvDrawer}
        onClose={() => setCsvDrawer(false)}
        width={720}
        ariaLabel="CSV importieren"
      >
        <CsvImportPanel
          onClose={() => setCsvDrawer(false)}
          onImported={() => { setCsvDrawer(false); router.refresh() }}
        />
      </Drawer>

      <Drawer
        open={scrapeDrawer}
        onClose={() => setScrapeDrawer(false)}
        width={720}
        ariaLabel="Leads scrapen"
      >
        <ScrapePanel
          onClose={() => setScrapeDrawer(false)}
          onImported={() => { setScrapeDrawer(false); router.refresh() }}
        />
      </Drawer>
    </>
  )
}
