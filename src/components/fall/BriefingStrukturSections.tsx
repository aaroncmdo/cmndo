'use client'

// AAR-385: Strukturierte Briefing-Darstellung.
// Wird in BriefingCard unterhalb der Kurzversion als collapsible Section
// gerendert. 3 Gruppen: Hinweise (✓), Warnungen (⚠), Checkliste (📋).

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2Icon,
  AlertTriangleIcon,
  ClipboardListIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  RefreshCwIcon,
  SparklesIcon,
} from 'lucide-react'
import type { SvBriefingStruktur } from '@/lib/types/field-modus'
import { regenerateSvBriefingStruktur } from '@/app/faelle/[id]/_actions/briefing'

export type BriefingStrukturSectionsProps = {
  fallId: string
  struktur: SvBriefingStruktur | null
  /** Generated_by aus dem jsonb-Blob — zeigt Fallback-Badge wenn 'fallback'. */
  generatedBy?: 'ai' | 'fallback' | null
  /** Admin/KB darf regenerieren. Wenn false → Regen-Button ausgeblendet. */
  canRegenerate: boolean
  /** Initial offen oder zu — default offen wenn Struktur vorhanden. */
  defaultExpanded?: boolean
}

export default function BriefingStrukturSections({
  fallId,
  struktur,
  generatedBy,
  canRegenerate,
  defaultExpanded,
}: BriefingStrukturSectionsProps) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? Boolean(struktur))
  const [pending, startTransition] = useTransition()
  const [local, setLocal] = useState<SvBriefingStruktur | null>(struktur)
  const [localGeneratedBy, setLocalGeneratedBy] = useState<
    'ai' | 'fallback' | null
  >(generatedBy ?? null)

  // Defensive Array-Guards: struktur kommt aus JSONB DB-Spalte, nach
  // Regenerate aus API-Response. In beiden Fällen können die Arrays
  // fehlen / null / non-array sein. Fallback auf [] verhindert .map-Crash.
  const rawCurrent = local ?? struktur
  const current = rawCurrent
    ? {
        kurzversion: typeof rawCurrent.kurzversion === 'string' ? rawCurrent.kurzversion : '',
        hinweise: Array.isArray(rawCurrent.hinweise) ? rawCurrent.hinweise : [],
        warnungen: Array.isArray(rawCurrent.warnungen) ? rawCurrent.warnungen : [],
        checkliste_vor_ort: Array.isArray(rawCurrent.checkliste_vor_ort) ? rawCurrent.checkliste_vor_ort : [],
      }
    : null

  function onRegenerate() {
    startTransition(async () => {
      const r = await regenerateSvBriefingStruktur(fallId)
      if (r.success && r.briefing) {
        setLocal(r.briefing)
        setLocalGeneratedBy(r.generated_by ?? 'ai')
        toast.success(
          r.generated_by === 'fallback'
            ? 'Fallback-Briefing erstellt (Claude nicht erreichbar)'
            : 'Strukturiertes Briefing aktualisiert',
        )
      } else {
        toast.error(r.error ?? 'Generierung fehlgeschlagen')
      }
    })
  }

  if (!current && !canRegenerate) return null

  return (
    <div className="border-t border-claimondo-border pt-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo hover:text-claimondo-navy"
        >
          <SparklesIcon className="w-3.5 h-3.5" />
          Struktur
          {localGeneratedBy === 'fallback' && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[9px] font-medium normal-case tracking-normal">
              Fallback
            </span>
          )}
          {expanded ? (
            <ChevronUpIcon className="w-3 h-3" />
          ) : (
            <ChevronDownIcon className="w-3 h-3" />
          )}
        </button>
        {canRegenerate && current && (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={pending}
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-ios-md border border-claimondo-border text-claimondo-ondo hover:bg-claimondo-bg disabled:opacity-50"
          >
            <RefreshCwIcon
              className={`w-3 h-3 ${pending ? 'animate-spin' : ''}`}
            />
            {pending ? 'Generiere …' : 'Struktur neu'}
          </button>
        )}
      </div>

      {expanded && !current && canRegenerate && (
        <div className="mt-3">
          <button
            type="button"
            onClick={onRegenerate}
            disabled={pending}
            className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-ios-md bg-[color:var(--brand-primary,#4573A2)] text-white hover:bg-claimondo-shield disabled:opacity-50"
          >
            <SparklesIcon className="w-3.5 h-3.5" />
            {pending ? 'Generiere …' : 'Strukturiertes Briefing generieren'}
          </button>
        </div>
      )}

      {expanded && current && (
        <div className="mt-3 space-y-3">
          {current.kurzversion && (
            <p className="text-sm leading-relaxed text-claimondo-navy">
              {current.kurzversion}
            </p>
          )}

          {current.hinweise.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-700 mb-1">
                <CheckCircle2Icon className="w-3.5 h-3.5" />
                Hinweise
              </div>
              <ul className="space-y-0.5 text-xs text-claimondo-navy pl-5 list-disc">
                {current.hinweise.map((h, i) => (
                  <li key={`h-${i}`}>{h}</li>
                ))}
              </ul>
            </section>
          )}

          {current.warnungen.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700 mb-1">
                <AlertTriangleIcon className="w-3.5 h-3.5" />
                Achtung
              </div>
              <ul className="space-y-0.5 text-xs text-claimondo-navy pl-5 list-disc">
                {current.warnungen.map((w, i) => (
                  <li key={`w-${i}`}>{w}</li>
                ))}
              </ul>
            </section>
          )}

          {current.checkliste_vor_ort.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brand-primary,#4573A2)] mb-1">
                <ClipboardListIcon className="w-3.5 h-3.5" />
                Vor Ort
              </div>
              <ul className="space-y-0.5 text-xs text-claimondo-navy pl-5 list-disc">
                {current.checkliste_vor_ort.map((c, i) => (
                  <li key={`c-${i}`}>{c}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
