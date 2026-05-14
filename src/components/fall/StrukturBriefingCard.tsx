'use client'

// AAR-772: Struktur-Briefing — INTERNE Card für Admin/KB.
// Zeigt das strukturierte Briefing (Kurzversion + Hinweise + Warnungen +
// Checkliste vor Ort) aus `faelle.sv_briefing_struktur` jsonb.
//
// Trennt sich bewusst vom SV-Briefing (das ist Plain-Text für den
// Gutachter, automatisch generiert beim Öffnen). Das Struktur-Briefing
// ist Onboarding-Material für uns intern, nicht für den SV.

import BriefingStrukturSections from './BriefingStrukturSections'
import { LayoutGridIcon } from 'lucide-react'
import type { SvBriefingStruktur } from '@/lib/types/field-modus'

export type StrukturBriefingCardProps = {
  fallId: string
  struktur: SvBriefingStruktur | null
  generatedBy?: 'ai' | 'fallback' | null
  /** Admin/KB darf regenerieren. */
  canRegenerate: boolean
}

export default function StrukturBriefingCard({
  fallId,
  struktur,
  generatedBy,
  canRegenerate,
}: StrukturBriefingCardProps) {
  return (
    <div className="bg-white border border-claimondo-border rounded-ios-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <LayoutGridIcon className="w-4 h-4 text-[color:var(--brand-primary,#4573A2)]" />
        <h3 className="text-sm font-semibold text-claimondo-navy">Struktur-Briefing</h3>
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-claimondo-bg text-claimondo-ondo text-[9px] font-medium normal-case tracking-normal">
          intern
        </span>
      </div>
      <p className="text-[11px] text-claimondo-ondo">
        Onboarding-Hilfe für Admin/KB — Kurzversion, Hinweise, Warnungen und
        Checkliste vor Ort. Wird dem Gutachter NICHT angezeigt.
      </p>
      <BriefingStrukturSections
        fallId={fallId}
        struktur={struktur}
        generatedBy={generatedBy ?? null}
        canRegenerate={canRegenerate}
        defaultExpanded={true}
      />
    </div>
  )
}
