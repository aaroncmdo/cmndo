'use client'

// AAR-902 Karten-Integration: zwei Wege auf der Karte nebeneinander
// erreichbar. Default ist der existierende Termin-Wizard (DynamicWizard
// mit Slot-Picker), als Alternative die Schnell-Anfrage (Mini-Wizard mit
// 4 Feldern + Magic-Link an den Kunden).
//
// "ineinanderführen" (Aaron 14.05.2026): Mini-Wizard ist NICHT Ersatz —
// die Terminierung muss erhalten bleiben. Der Toggle gibt dem Nutzer die
// Wahl: schnell Mail bekommen + spaeter Termin buchen ODER direkt jetzt
// auf der Karte einen Slot reservieren.
//
// Design-Tokens: claimondo-bg, claimondo-navy, claimondo-ondo,
// claimondo-border, rounded-ios-sm, rounded-ios-md (siehe AGENTS.md
// §branding-rules + claimondo-component-set).

import { useState } from 'react'
import { CalendarCheck, Mail } from 'lucide-react'
import { MiniWizardClient } from '@/app/schaden-melden/MiniWizardClient'

type Mode = 'voll' | 'mini'

export function KartenWizardToggle({
  dynamicWizard,
}: {
  /** Vom Server-Component (page.tsx) gerenderter DynamicWizard — wird hier
   * nur durchgereicht. Pattern aus Next.js Client/Server-Composition. */
  dynamicWizard: React.ReactNode
}) {
  const [mode, setMode] = useState<Mode>('voll')

  return (
    <div>
      {/* Toggle-Tabs */}
      <div className="flex gap-1 rounded-ios-md border border-claimondo-border bg-claimondo-bg p-1 mb-4">
        <button
          type="button"
          aria-pressed={mode === 'voll'}
          onClick={() => setMode('voll')}
          className={[
            'flex-1 inline-flex items-center justify-center gap-2 rounded-ios-sm px-4 py-2.5 text-sm font-semibold transition',
            mode === 'voll'
              ? 'bg-white text-claimondo-navy shadow-claimondo-sm'
              : 'text-claimondo-ondo hover:text-claimondo-navy',
          ].join(' ')}
        >
          <CalendarCheck className="h-4 w-4" aria-hidden />
          Termin direkt buchen
        </button>
        <button
          type="button"
          aria-pressed={mode === 'mini'}
          onClick={() => setMode('mini')}
          className={[
            'flex-1 inline-flex items-center justify-center gap-2 rounded-ios-sm px-4 py-2.5 text-sm font-semibold transition',
            mode === 'mini'
              ? 'bg-white text-claimondo-navy shadow-claimondo-sm'
              : 'text-claimondo-ondo hover:text-claimondo-navy',
          ].join(' ')}
        >
          <Mail className="h-4 w-4" aria-hidden />
          Schnell-Anfrage
        </button>
      </div>

      {/* Kurzer Mode-Hinweis */}
      <p className="mb-5 text-xs text-claimondo-ondo">
        {mode === 'voll'
          ? 'Sie waehlen jetzt direkt einen Termin mit Ihrem Sachverstaendigen. Im naechsten Schritt unterschreiben Sie SA + Vollmacht.'
          : 'Wir senden Ihnen einen sicheren Login-Link per E-Mail. Sie melden sich ohne Passwort an und buchen den Termin spaeter in Ruhe.'}
      </p>

      {/* Aktiver Wizard */}
      <div role="tabpanel" aria-label={mode === 'voll' ? 'Termin direkt buchen' : 'Schnell-Anfrage'}>
        {mode === 'voll' ? dynamicWizard : <MiniWizardClient />}
      </div>
    </div>
  )
}
