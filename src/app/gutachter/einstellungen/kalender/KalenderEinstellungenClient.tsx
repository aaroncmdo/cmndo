'use client'

import { CalendarIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import KalenderConnectPanel, { type CalDavState } from '@/components/shared/KalenderConnectPanel'

// AAR-717: Client-Komponente für /gutachter/einstellungen/kalender.
// SP2b: Der Google+CalDAV-Connect-Kern lebt jetzt im geteilten KalenderConnectPanel
// (auch vom Mitarbeiter-Profil genutzt); hier bleibt nur die SV-Seiten-Shell.

export default function KalenderEinstellungenClient({
  svId: _svId,
  googleConnected,
  googleEmail,
  microsoftConnected,
  microsoftEmail,
  caldav,
}: {
  svId: string
  googleConnected: boolean
  googleEmail: string | null
  microsoftConnected: boolean
  microsoftEmail: string | null
  caldav: CalDavState | null
}) {
  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-5">
      <PageHeader
        title="Kalender"
        description="Verbinde einen Kalender, damit wir bei Terminvorschlägen Ihre private Nicht-Verfügbarkeit berücksichtigen können."
        size="lg"
        useBranding
        leadingSlot={
          <div className="w-10 h-10 rounded-full bg-[var(--brand-secondary)]/10 text-[var(--brand-primary)] flex items-center justify-center shrink-0">
            <CalendarIcon className="w-5 h-5" />
          </div>
        }
      />
      <KalenderConnectPanel
        googleConnected={googleConnected}
        googleEmail={googleEmail}
        microsoftConnected={microsoftConnected}
        microsoftEmail={microsoftEmail}
        caldav={caldav}
        returnPath="/gutachter/einstellungen/kalender"
      />
    </div>
  )
}
