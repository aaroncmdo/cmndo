'use client'

// AAR-834: SV-Fallakte — Gutachten-Auftrag-Card für den neuen gutachten-Claim-Datensatz.
// Getrennt von GutachtenCard (AAR-404) die Dokument-Uploads verwaltet.

import { useTransition } from 'react'
import { toast } from 'sonner'
import { ClipboardListIcon, CheckCircleIcon, CalendarIcon, EuroIcon } from 'lucide-react'
import { GutachtenStatusBadge } from '@/components/shared/gutachten/GutachtenStatusBadge'
import { updateGutachtenStatus } from '@/lib/gutachten/actions'
import type { GutachtenMitSv } from '@/lib/gutachten/queries'
import { formatDatum } from '@/lib/format'
import { formatEURausEuro } from '@/lib/format/currency'

const NAECHSTER_STATUS: Record<string, { status: string; label: string }> = {
  beauftragt:    { status: 'besichtigt',    label: 'Besichtigung bestätigen' },
  besichtigt:    { status: 'in_erstellung', label: 'Gutachten erstellen' },
  in_erstellung: { status: 'final',         label: 'Als final markieren' },
}

type Props = {
  gutachten: GutachtenMitSv[]
}

function AuftragZeile({ g }: { g: GutachtenMitSv }) {
  const [isPending, startTransition] = useTransition()
  const naechster = NAECHSTER_STATUS[g.status]

  function handleWeiterschalten() {
    if (!naechster) return
    startTransition(async () => {
      const res = await updateGutachtenStatus(
        g.id,
        naechster.status as Parameters<typeof updateGutachtenStatus>[1],
        {
          besichtigtAm:    naechster.status === 'besichtigt'    ? new Date().toISOString() : undefined,
          fertiggestelltAm: naechster.status === 'final'        ? new Date().toISOString() : undefined,
        },
      )
      if (res.ok) {
        toast.success(`Status auf „${naechster.status}" gesetzt`)
      } else {
        toast.error(res.error ?? 'Fehler')
      }
    })
  }

  return (
    <div className="rounded-xl border border-[#E2E8F3] bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardListIcon className="w-4 h-4 text-[#4573A2] shrink-0 mt-0.5" />
          <span className="text-sm font-medium text-[#0D1B3E]">
            {g.auftragsnummer ? `Auftrag # ${g.auftragsnummer}` : 'Gutachten-Auftrag'}
          </span>
        </div>
        <GutachtenStatusBadge status={g.status} />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#4573A2]">
        {g.besichtigungstermin && (
          <span className="flex items-center gap-1">
            <CalendarIcon className="w-3 h-3" />
            Termin: {formatDatum(g.besichtigungstermin)}
          </span>
        )}
        {g.gesamt_schadensbetrag != null && (
          <span className="flex items-center gap-1">
            <EuroIcon className="w-3 h-3" />
            {formatEURausEuro(g.gesamt_schadensbetrag)}
          </span>
        )}
      </div>

      {naechster && g.status !== 'storniert' && (
        <button
          type="button"
          onClick={handleWeiterschalten}
          disabled={isPending}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#0D1B3E] text-white text-sm font-medium hover:bg-[#1a2d5a] disabled:opacity-50 transition-colors"
        >
          <CheckCircleIcon className="w-4 h-4" />
          {isPending ? 'Wird gespeichert…' : naechster.label}
        </button>
      )}

      {g.status === 'final' && g.bericht_pdf_url && (
        <a
          href={g.bericht_pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[#4573A2] hover:underline flex items-center gap-1"
        >
          <ClipboardListIcon className="w-3.5 h-3.5" />
          Gutachten-PDF anzeigen
        </a>
      )}
    </div>
  )
}

export function GutachtenAuftragCard({ gutachten }: Props) {
  if (gutachten.length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-[#0D1B3E]">Meine Aufträge</h3>
      {gutachten.map((g) => (
        <AuftragZeile key={g.id} g={g} />
      ))}
    </div>
  )
}
