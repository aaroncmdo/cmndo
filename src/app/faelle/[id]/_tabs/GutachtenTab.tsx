'use client'

// AAR-834: Gutachten-Tab in der Admin-Fallakte
// Zeigt alle Gutachten eines Claims: Status, SV, Termine, Schadensbetrag, Fotos-Count

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  ClipboardListIcon,
  CalendarIcon,
  UserIcon,
  EuroIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  XCircleIcon,
  CheckCircleIcon,
} from 'lucide-react'
import { GutachtenStatusBadge } from '@/components/shared/gutachten/GutachtenStatusBadge'
import { updateGutachtenStatus, storniereGutachten } from '@/lib/gutachten/actions'
import type { GutachtenMitSv } from '@/lib/gutachten/queries'
import { formatDatum } from '@/lib/format'
import { formatEURausEuro } from '@/lib/format/currency'

type Props = {
  fallId: string
  claimId: string | null
  gutachten: GutachtenMitSv[]
}

function GutachtenZeile({
  g,
  fallId,
}: {
  g: GutachtenMitSv
  fallId: string
}) {
  const [expanded, setExpanded]   = useState(false)
  const [isPending, startTransition] = useTransition()

  const svName = g.sachverstaendige?.profiles
    ? [g.sachverstaendige.profiles.vorname, g.sachverstaendige.profiles.nachname]
        .filter(Boolean)
        .join(' ') || '—'
    : '—'

  function handleStatusWeiter() {
    const NAECHSTER: Record<string, string> = {
      beauftragt:    'besichtigt',
      besichtigt:    'in_erstellung',
      in_erstellung: 'final',
    }
    const neu = NAECHSTER[g.status]
    if (!neu) return
    startTransition(async () => {
      const res = await updateGutachtenStatus(g.id, neu as Parameters<typeof updateGutachtenStatus>[1])
      if (res.ok) {
        toast.success(`Status auf „${neu}" gesetzt`)
      } else {
        toast.error(res.error ?? 'Fehler beim Status-Update')
      }
    })
  }

  function handleStornieren() {
    startTransition(async () => {
      const res = await storniereGutachten(g.id, 'Manuell storniert (Admin)')
      if (res.ok) {
        toast.success('Gutachten storniert')
      } else {
        toast.error(res.error ?? 'Fehler beim Stornieren')
      }
    })
  }

  const kannWeiterschalten = ['beauftragt', 'besichtigt', 'in_erstellung'].includes(g.status)
  const kannStornieren     = ['beauftragt', 'besichtigt', 'in_erstellung'].includes(g.status)

  return (
    <div className="border border-[#E2E8F3] rounded-xl bg-white overflow-hidden">
      {/* Header-Zeile */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#f8f9fb] transition-colors text-left"
      >
        {expanded
          ? <ChevronDownIcon  className="w-4 h-4 text-[#4573A2] shrink-0" />
          : <ChevronRightIcon className="w-4 h-4 text-[#4573A2] shrink-0" />
        }
        <ClipboardListIcon className="w-4 h-4 text-[#4573A2] shrink-0" />
        <span className="flex-1 font-medium text-[#0D1B3E] text-sm">
          {g.auftragsnummer ? `# ${g.auftragsnummer}` : `Gutachten ${g.id.slice(0, 8)}`}
        </span>
        <GutachtenStatusBadge status={g.status} />
      </button>

      {/* Meta-Row */}
      <div className="px-4 pb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#4573A2]">
        <span className="flex items-center gap-1">
          <UserIcon className="w-3 h-3" />
          {svName}
        </span>
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

      {/* Expanded Detail */}
      {expanded && (
        <div className="border-t border-[#E2E8F3] px-4 py-4 space-y-4">
          {/* Daten-Grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-[#7BA3CC] mb-0.5">Besichtigt am</p>
              <p className="text-[#0D1B3E]">{g.besichtigt_am ? formatDatum(g.besichtigt_am) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-[#7BA3CC] mb-0.5">Fertiggestellt am</p>
              <p className="text-[#0D1B3E]">{g.fertiggestellt_am ? formatDatum(g.fertiggestellt_am) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-[#7BA3CC] mb-0.5">Unterschrieben am</p>
              <p className="text-[#0D1B3E]">{g.unterschrieben_am ? formatDatum(g.unterschrieben_am) : '—'}</p>
            </div>
            {g.notiz && (
              <div className="col-span-2">
                <p className="text-xs text-[#7BA3CC] mb-0.5">Notiz</p>
                <p className="text-[#0D1B3E]">{g.notiz}</p>
              </div>
            )}
          </div>

          {/* Bericht-PDF */}
          {g.bericht_pdf_url && (
            <a
              href={g.bericht_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-[#4573A2] hover:underline"
            >
              <ClipboardListIcon className="w-4 h-4" />
              Gutachten-PDF öffnen
            </a>
          )}

          {/* Aktionen */}
          {(kannWeiterschalten || kannStornieren) && (
            <div className="flex gap-2 pt-1">
              {kannWeiterschalten && (
                <button
                  type="button"
                  onClick={handleStatusWeiter}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0D1B3E] text-white text-xs font-medium hover:bg-[#1a2d5a] disabled:opacity-50 transition-colors"
                >
                  <CheckCircleIcon className="w-3.5 h-3.5" />
                  Weiterschalten
                </button>
              )}
              {kannStornieren && (
                <button
                  type="button"
                  onClick={handleStornieren}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  <XCircleIcon className="w-3.5 h-3.5" />
                  Stornieren
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function GutachtenTab({ fallId, claimId, gutachten }: Props) {
  if (!claimId) {
    return (
      <div className="text-sm text-[#7BA3CC] py-8 text-center">
        Kein Claim für diesen Fall angelegt.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-[#0D1B3E]">Gutachten</h3>
          <p className="text-xs text-[#7BA3CC] mt-0.5">
            {gutachten.length === 0
              ? 'Noch kein Gutachten beauftragt'
              : `${gutachten.length} Gutachten`}
          </p>
        </div>
        {/* Beauftragen-Button — Formular folgt in einem Folge-Ticket */}
        <button
          type="button"
          disabled
          title="Beauftragen — kommt in nächstem Sprint"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0D1B3E] text-white text-xs font-medium opacity-40 cursor-not-allowed"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Gutachten beauftragen
        </button>
      </div>

      {/* Liste */}
      {gutachten.length === 0 ? (
        <div className="border-2 border-dashed border-[#E2E8F3] rounded-xl py-10 text-center text-sm text-[#7BA3CC]">
          Noch kein Gutachten für diesen Claim
        </div>
      ) : (
        <div className="space-y-3">
          {gutachten.map((g) => (
            <GutachtenZeile key={g.id} g={g} fallId={fallId} />
          ))}
        </div>
      )}
    </div>
  )
}
