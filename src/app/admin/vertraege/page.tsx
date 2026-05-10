// Aaron 2026-04-30: Vertragseditor — Admin lädt PDFs hoch + setzt
// Unterschriftsposition per Klick.

import { FileSignatureIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import { listVertragsVorlagen } from './actions'
import VertragseditorClient from './VertragseditorClient'

export const dynamic = 'force-dynamic'

export default async function VertraegePage() {
  const result = await listVertragsVorlagen()

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-claimondo-border flex-shrink-0">
        <PageHeader
          title="Vertragseditor"
          description="PDF-Vorlagen für Sicherungsabtretung, Honorarvereinbarung, Datenschutz und Widerruf — mit Klick auf das PDF die Unterschriftsposition setzen."
          icon={FileSignatureIcon}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        <VertragseditorClient
          initialVorlagen={result.ok ? result.vorlagen : []}
          loadError={result.ok ? null : result.error ?? null}
        />
      </div>
    </div>
  )
}
