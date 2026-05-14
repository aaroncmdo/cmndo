import type { Metadata } from 'next'
import PageHeader from '@/components/shared/PageHeader'
import { MiniWizardClient } from './MiniWizardClient'

// AAR-902 Prototyp: Mini-Wizard unter /schaden-melden/prototyp.
// Lebt parallel zum heutigen 4-Step-Wizard (/schaden-melden/schritt-1..4).
// Nach erfolgreicher Implementierung der Strecke AAR-897 wird der Prototyp
// auf /schaden-melden gehoben und schritt-1..4 entfernt (siehe PR 7).

export const metadata: Metadata = {
  title: 'Schaden melden — Sicherer Login-Link',
  description:
    'In 30 Sekunden Schaden melden. Sie erhalten direkt einen sicheren Login-Link per E-Mail.',
  robots: { index: false, follow: false },
}

export default function MiniWizardPage() {
  return (
    <div className="min-h-screen bg-claimondo-bg py-10">
      <div className="mx-auto max-w-2xl px-4">
        <div className="mb-6">
          <PageHeader
            title="Schaden melden"
            description="Drei Fragen, dann erhalten Sie per E-Mail einen sicheren Login-Link. Dort unterschreiben Sie SA + Vollmacht — wir kümmern uns um den Rest."
            size="lg"
          />
        </div>
        <div className="rounded-ios-lg border border-claimondo-border bg-white p-6 shadow-claimondo-md sm:p-8">
          <MiniWizardClient />
        </div>
      </div>
    </div>
  )
}
