// Aaron 2026-04-30: Vertragseditor — Admin lädt PDFs hoch + setzt
// Unterschriftsposition per Klick.

import { FileSignatureIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import { listVertragsVorlagen, listSvsForEditor } from './actions'
import VertragseditorClient from './VertragseditorClient'

export const dynamic = 'force-dynamic'

export default async function VertraegePage() {
  const [vorlagen, svs] = await Promise.all([
    listVertragsVorlagen(null),
    listSvsForEditor(),
  ])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-claimondo-border flex-shrink-0">
        <PageHeader
          title="Vertragseditor"
          description="PDF-Vorlagen für Sicherungsabtretung, Honorarvereinbarung, Datenschutz und Widerruf — mit Klick auf das PDF die Unterschriftsposition setzen. Pro SV können eigene Vorlagen hinterlegt werden, sonst gilt die Default-Vorlage."
          icon={FileSignatureIcon}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        <VertragseditorClient
          initialVorlagen={vorlagen.ok ? vorlagen.vorlagen : []}
          loadError={vorlagen.ok ? null : vorlagen.error ?? null}
          svs={svs.ok ? svs.svs : []}
        />
      </div>
    </div>
  )
}
