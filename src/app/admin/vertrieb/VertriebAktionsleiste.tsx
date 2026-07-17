'use client'
// Vertrieb-Cockpit: kontextuelle Aktions-Leiste. Zeigt je aktiver Rolle-Pill x Lead/Partner
// die passenden Aktionen. ALLE Aktionen oeffnen als Cockpit-Drawer (kein Full-Page-Nav mehr):
// SV-/Makler-/Werkstatt-anlegen, CSV-Import, Scrapen, QR-Pool, Basis-Freigaben. Die href in
// context-aktionen bleibt nur defensiver Fallback (jeder key wird in ausloesen() intercepted).
//
// B1 (CRM-Drawer-URL-Sync): der offene Aktions-Drawer haengt am ?aktion=<key>-Param
// (useUrlDrawerParam) — Deep-Link oeffnet direkt, Browser-Back schliesst den Drawer,
// Filter/Scroll der Liste bleiben erhalten (shallow pushState, kein Router-Nav).
import { useRouter } from 'next/navigation'
import { Button, Drawer } from '@/components/primitives'
import AnlegenTabs from '@/app/admin/sachverstaendige/anlegen/AnlegenTabs'
import QrPoolDrawerContent from './wizards/QrPoolDrawerContent'
import BasisFreigabenDrawerContent from './wizards/BasisFreigabenDrawerContent'
import CsvImportPanel from '@/app/admin/partner-leads/CsvImportPanel'
import ScrapePanel from '@/app/admin/partner-leads/ScrapePanel'
import WerkstattAnlegenForm from '@/app/admin/werkstaetten/WerkstattAnlegenForm'
import MaklerAnlegenDrawerContent from './wizards/MaklerAnlegenDrawerContent'
import SequenzenDrawerContent from './wizards/SequenzenDrawerContent'
import FirmenFlottenDrawerContent from './wizards/FirmenFlottenDrawerContent'
import { contextAktionen, type VertriebAktion } from './_lib/context-aktionen'
import { useUrlDrawerParam } from '@/lib/navigation/use-url-drawer-param'
import type { VertriebRolle, VertriebTyp } from '@/lib/vertrieb/vertrieb-kontakt.types'

// Aktions-Keys, die einen Cockpit-Drawer oeffnen (Rest faellt auf a.href zurueck).
const DRAWER_KEYS = new Set([
  'anlegen-picker',
  'anlegen-sv',
  'qrpool',
  'freigaben',
  'csv',
  'scrape',
  'sequenzen',
  'anlegen-werkstatt',
  'anlegen-makler',
  'anlegen-flotte',
])

export default function VertriebAktionsleiste({
  rolle,
  typ,
}: {
  rolle: VertriebRolle | 'alle'
  typ: VertriebTyp | 'alle'
}) {
  const router = useRouter()
  const aktionDrawer = useUrlDrawerParam('aktion')
  const offen = aktionDrawer.value
  const aktionen = contextAktionen(rolle, typ)
  if (aktionen.length === 0) return null

  function ausloesen(a: VertriebAktion) {
    if (DRAWER_KEYS.has(a.key)) {
      aktionDrawer.open(a.key)
      return
    }
    if (a.href) router.push(a.href)
  }

  function schliessen() {
    aktionDrawer.close()
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

      {/* Onboarding-Entsperrer (UI-Audit 17.07.): EIN prominenter "Partner anlegen"-Einstieg
          in der Alle-Ansicht. Jede Wahl schaltet ?aktion auf den Ziel-Drawer um (schliesst den
          Picker + oeffnet den bereits verdrahteten Anlage-Assistenten in einem Schritt). */}
      <Drawer open={offen === 'anlegen-picker'} onClose={schliessen} width={480} ariaLabel="Partner anlegen">
        <div className="space-y-4">
          <div>
            <h2 className="text-heading-md text-claimondo-navy">Partner anlegen</h2>
            <p className="text-body-sm text-claimondo-ondo mt-1">
              Wähle den Partner-Typ — der passende Anlage-Assistent öffnet sich.
            </p>
          </div>
          {/* Button-Primitive ist strikt einzeilig (inline height/lineHeight) — daher
              Emoji-markierte Einzeiler (Pattern wie "📨 Cold-Mail-Sequenzen"), die Sub-
              Beschreibung steht als muted Zeile darunter (ausserhalb des Klick-Targets). */}
          <div className="grid gap-3">
            {([
              { key: 'anlegen-sv', label: '🔎  Sachverständiger', sub: 'Solo · Büro · Akademie · Community' },
              { key: 'anlegen-makler', label: '🤝  Makler', sub: 'Vermittler-Account + Provisionsmodell' },
              { key: 'anlegen-werkstatt', label: '🔧  Werkstatt', sub: 'Reparatur-Partner + QR-Pool' },
              { key: 'anlegen-flotte', label: '🚗  Firmen-Flotte', sub: 'Flottenmanager + Fuhrpark' },
            ] as const).map((c) => (
              <div key={c.key} className="space-y-1">
                <Button variant="ondo" size="lg" fullWidth onClick={() => aktionDrawer.open(c.key)}>
                  {c.label}
                </Button>
                <p className="text-body-xs text-claimondo-ondo px-1">{c.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </Drawer>

      <Drawer open={offen === 'anlegen-sv'} onClose={schliessen} width={720} ariaLabel="Sachverständigen anlegen">
        <div className="space-y-4">
          <h2 className="text-heading-md text-claimondo-navy">Sachverständigen anlegen</h2>
          {/* onSuccess: Roster im Hintergrund aktualisieren, Drawer offen lassen (Result-Screen
              zeigt z. B. das Initial-Passwort). onCancel/„Zur SV-Liste": Drawer schliessen. */}
          <AnlegenTabs onSuccess={() => router.refresh()} onCancel={schliessen} />
        </div>
      </Drawer>

      <Drawer
        open={offen === 'qrpool'}
        onClose={schliessen}
        width={860}
        ariaLabel="QR-Pool verwalten"
      >
        <QrPoolDrawerContent />
      </Drawer>

      <Drawer
        open={offen === 'freigaben'}
        onClose={schliessen}
        width={720}
        ariaLabel="Basis-Freigaben"
      >
        <BasisFreigabenDrawerContent />
      </Drawer>

      <Drawer
        open={offen === 'csv'}
        onClose={() => aktionDrawer.close()}
        width={720}
        ariaLabel="CSV importieren"
      >
        <CsvImportPanel
          onClose={() => aktionDrawer.close()}
          onImported={schliessen}
        />
      </Drawer>

      <Drawer
        open={offen === 'scrape'}
        onClose={() => aktionDrawer.close()}
        width={720}
        ariaLabel="Leads scrapen"
      >
        <ScrapePanel
          onClose={() => aktionDrawer.close()}
          onImported={schliessen}
        />
      </Drawer>

      <Drawer
        open={offen === 'sequenzen'}
        onClose={() => aktionDrawer.close()}
        width={720}
        ariaLabel="Cold-Mail-Sequenzen"
      >
        <SequenzenDrawerContent />
      </Drawer>

      <Drawer
        open={offen === 'anlegen-werkstatt'}
        onClose={() => aktionDrawer.close()}
        width={720}
        ariaLabel="Werkstatt anlegen"
      >
        <WerkstattAnlegenForm
          onClose={() => aktionDrawer.close()}
          onCreated={schliessen}
        />
      </Drawer>

      <Drawer
        open={offen === 'anlegen-makler'}
        onClose={() => aktionDrawer.close()}
        width={720}
        ariaLabel="Makler anlegen"
      >
        <MaklerAnlegenDrawerContent
          onClose={() => aktionDrawer.close()}
          onCreated={schliessen}
        />
      </Drawer>

      {/* Firmen-Flotte: der EINE Einstieg (Pill "Firmen-Flotte anlegen"). Vorher fiel der key
          durch ausloesen() hindurch auf router.push('/admin/firmen-flotte') -- der redundante
          Cockpit-oben-rechts-Button (FirmenFlottenCockpitEntry) oeffnete denselben Drawer. */}
      <Drawer
        open={offen === 'anlegen-flotte'}
        onClose={schliessen}
        width={860}
        ariaLabel="Firmen-Flotte anlegen"
      >
        <FirmenFlottenDrawerContent />
      </Drawer>
    </>
  )
}
