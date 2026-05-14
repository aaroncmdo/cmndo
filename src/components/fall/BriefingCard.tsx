'use client'

// AAR-377 / AAR-772: Shared Card für das AI-generierte SV-Briefing.
//
// Klarer Rollen-Split nach Aaron-Feedback:
//   - **SV-Briefing** (DIESE Card): für den Gutachter, wird automatisch
//     beim Öffnen der Fallakte generiert. Auch im Feldmodus eingeblendet.
//     Plain-Text-Briefing aus `faelle.sv_briefing_text`.
//   - **Struktur-Briefing**: separat in `<StrukturBriefingCard>`, nur für
//     internes Admin-/KB-Onboarding eines neuen Falls. Liest
//     `faelle.sv_briefing_struktur` jsonb.
//
// Konsumenten:
//   - Admin-Fallakte (UebersichtTab) — Card + Regenerate-Button
//   - SV-Fallakte (gutachter/fall/[id]) — Card read-only
//   - Feldmodus (AktuellerStopCard) — nur briefing-Text einblenden
//
// Diese Card rendert KEINE Struktur mehr (war früher in derselben Card
// gestackt, was die zwei Funktionen vermischt hat).

import { SparklesIcon } from 'lucide-react'
import BriefingRegenerateButton from './BriefingRegenerateButton'

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
}

function formatGeneratedAt(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return `${d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })} ${d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin',
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
}: BriefingCardProps) {
  const hasBriefing = Boolean(briefing && briefing.trim())

  return (
    <div className="bg-white border border-claimondo-border rounded-ios-xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <SparklesIcon className="w-4 h-4 text-[color:var(--brand-primary,#4573A2)]" />
          <h3 className="text-sm font-semibold text-claimondo-navy">SV-Briefing</h3>
        </div>
        {canRegenerate && hasBriefing && (
          <BriefingRegenerateButton fallId={fallId} />
        )}
      </div>

      {hasBriefing ? (
        <p className="text-sm leading-relaxed text-claimondo-navy whitespace-pre-wrap">
          {briefing}
        </p>
      ) : (
        <div className="flex items-center gap-2 text-xs text-claimondo-ondo">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-[color:var(--brand-primary,#4573A2)] border-t-transparent animate-spin" />
          <span>Briefing wird vorbereitet ...</span>
        </div>
      )}

      {hasBriefing && (
        <div className="flex items-center gap-2 flex-wrap text-[10px] uppercase tracking-wider text-claimondo-ondo/70 pt-2 border-t border-claimondo-border">
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
    </div>
  )
}
