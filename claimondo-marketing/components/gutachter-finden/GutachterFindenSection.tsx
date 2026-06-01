// Wiederverwendbare gutachter-finden-Section für Marketing-Seiten.
// NICHT zu verwechseln mit dem Monika-Embed (public <script>-Widget, AAR-939):
// dies ist eine INTERNE React-Section, die per Code auf beliebige Marketing-
// Seiten gesetzt wird — Platzierung bestimmt der Entwickler.
//
//   variant='full'   -> volle interaktive Karte (Marker + Finder + Wizard-Toggle),
//                       Höhe via `height` (default '100dvh' für die /gutachter-finden-
//                       Seite; für In-Page-Sections z.B. height="78vh").
//   variant='teaser' -> kompakter PLZ/Stadt-Finder, CTA -> volle Seite (vorzentriert).
//
// Server-Component: lädt im full-Modus die SV-Daten selbst (gutachter-finder-actions)
// und reicht den Wizard-Toggle (Schnell-Anfrage Mini-Wizard ↔ Termin-Portal-Link
// in der App) rein — self-contained, ein <GutachterFindenSection/> genügt.

import { ChevronRight } from 'lucide-react'
import { ladeSvLeads, ladeAktiveSVs } from '@/lib/actions/gutachter-finder-actions'
import { GutachterFinderMapClient } from '@/app/[locale]/gutachter-finden/GutachterFinderMapClient'
import { KartenWizardToggle } from '@/components/onboarding/KartenWizardToggle'
import { GutachterFindenTeaser } from './GutachterFindenTeaser'

type Props = {
  variant?: 'full' | 'teaser'
  /** full: Start-Zentrum (z.B. aus ?plz/?stadt server-geocodet). */
  initialCenter?: { lat: number; lng: number } | null
  initialZoom?: number
  /** full: Container-Höhe (default '100dvh' = Vollseite; Section z.B. '78vh'). */
  height?: string
  /** teaser: Copy-Overrides. */
  eyebrow?: string
  heading?: string
  subline?: string
}

export async function GutachterFindenSection({
  variant = 'full',
  initialCenter = null,
  initialZoom,
  height = '100dvh',
  eyebrow,
  heading,
  subline,
}: Props) {
  if (variant === 'teaser') {
    return <GutachterFindenTeaser eyebrow={eyebrow} heading={heading} subline={subline} />
  }

  const [svLeadsResult, aktiveSVsResult] = await Promise.all([ladeSvLeads(), ladeAktiveSVs()])
  const svLeads = svLeadsResult.ok ? svLeadsResult.data : []
  const aktiveSVs = aktiveSVsResult.ok ? aktiveSVsResult.data : []

  return (
    <GutachterFinderMapClient
      svLeads={svLeads}
      aktiveSVs={aktiveSVs}
      initialCenter={initialCenter}
      initialZoom={initialZoom ?? (initialCenter ? 11 : undefined)}
      height={height}
      // Marketing-Split: voller Termin-Wizard lebt in der App, hier nur der
      // Mini-Wizard (Schnell-Anfrage) + App-Link statt Subsystem-Duplikation.
      wizardSlot={
        <KartenWizardToggle
          dynamicWizard={
            <div className="rounded-ios-md border border-claimondo-border bg-white p-6 text-center">
              <p className="text-sm leading-relaxed text-claimondo-shield">
                Den vollständigen Termin-Assistenten mit Slot-Auswahl und Sofort-Bestätigung finden Sie im Claimondo-Portal.
              </p>
              <a
                href="https://app.claimondo.de/gutachter-finden"
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-claimondo-navy px-6 py-3 text-sm font-bold text-white transition hover:bg-claimondo-navy/90"
                data-tracking="cta-gutachter-finden-termin-app"
              >
                Zum Termin-Portal
                <ChevronRight className="h-4 w-4" aria-hidden />
              </a>
            </div>
          }
        />
      }
    />
  )
}
