'use client'

// AAR-377: Shared Card für das AI-generierte SV-Briefing.
//
// Wird an 2 Stellen genutzt:
//   - Admin-Fallakte (UebersichtTab) — mit Regenerate-Button (Admin/KB)
//   - SV-Fallakte (gutachter/fall/[id]) — read-only, kein Regenerate-Button
//
// Follow-up (Field-Modus AAR-379): Wird auch in AktiverStopCard (AAR-375,
// Kurz-Briefing = erste 2 Sätze) und TerminCard (AAR-374, 1-2 Zeilen)
// eingebaut — siehe dort.

import { SparklesIcon } from 'lucide-react'
import BriefingRegenerateButton from './BriefingRegenerateButton'
import BriefingStrukturSections from './BriefingStrukturSections'
import type { SvBriefingStruktur } from '@/lib/types/field-modus'

export type BriefingCardProps = {
  fallId: string
  briefing: string | null
  generatedAt: string | null
  model: string | null
  version: number | null
  /**
   * Wenn true, wird der Regenerate-Button gerendert. Aufrufer muss vorher
   * prüfen, dass die Rolle des eingeloggten Users admin oder kundenbetreuer
   * ist (UI-Gate).
   */
  canRegenerate: boolean
  /** AAR-385: strukturierter Briefing-Blob aus `faelle.sv_briefing_struktur`. */
  struktur?: SvBriefingStruktur | null
  /** AAR-385: 'ai' | 'fallback' — Badge in Struktur-Section. */
  strukturGeneratedBy?: 'ai' | 'fallback' | null
}

function formatGeneratedAt(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return `${d.toLocaleDateString('de-DE')} ${d.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    })}`
  } catch {
    return '—'
  }
}

export default function BriefingCard({
  fallId,
  briefing,
  generatedAt,
  model,
  version,
  canRegenerate,
  struktur,
  strukturGeneratedBy,
}: BriefingCardProps) {
  const hasBriefing = Boolean(briefing && briefing.trim())

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <SparklesIcon className="w-4 h-4 text-[color:var(--brand-primary,#4573A2)]" />
          <h3 className="text-sm font-semibold text-gray-900">SV-Briefing</h3>
        </div>
        {canRegenerate && hasBriefing && (
          <BriefingRegenerateButton fallId={fallId} />
        )}
      </div>

      {hasBriefing ? (
        <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
          {briefing}
        </p>
      ) : (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-[color:var(--brand-primary,#4573A2)] border-t-transparent animate-spin" />
          <span>Briefing wird vorbereitet ...</span>
        </div>
      )}

      {hasBriefing && (
        <div className="flex items-center gap-2 flex-wrap text-[10px] uppercase tracking-wider text-gray-400 pt-2 border-t border-gray-100">
          <span>Generiert am {formatGeneratedAt(generatedAt)}</span>
          {model && <span>· {model}</span>}
          {typeof version === 'number' && version > 0 && <span>· v{version}</span>}
        </div>
      )}

      {!hasBriefing && canRegenerate && (
        <div className="pt-1">
          <BriefingRegenerateButton fallId={fallId} label="Jetzt generieren" />
        </div>
      )}

      {/* AAR-385: Strukturiertes Briefing (kurzversion + hinweise + warnungen + checkliste) */}
      <BriefingStrukturSections
        fallId={fallId}
        struktur={struktur ?? null}
        generatedBy={strukturGeneratedBy ?? null}
        canRegenerate={canRegenerate}
      />
    </div>
  )
}
