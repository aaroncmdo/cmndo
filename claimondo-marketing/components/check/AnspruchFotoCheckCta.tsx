'use client'

import { useTranslations } from 'next-intl'
import { Camera, ChevronRight } from 'lucide-react'
import { buildFotoCheckUrl } from '@/lib/check/foto-check-url'
import { type Schuld } from '@/lib/check/result-model'
import { trackEvent } from '@/lib/analytics/track-event'

const EMBED_ORIGIN = process.env.NEXT_PUBLIC_EMBED_ORIGIN ?? 'https://app.claimondo.de'

// /check-Schuldform -> Tool-Schuldform, damit das Foto-Tool die Schuldfrage vorbefuellt
// (kein Doppelt-Fragen -> zusammenhaengender Aufnahme-Flow). 'unklar' -> kein Prefill.
const SCHULD_ZU_TOOL: Record<Schuld, string | undefined> = {
  gegner: 'unverschuldet',
  teils: 'teilschuld',
  selbst: 'selbst',
  unklar: undefined,
}

/**
 * Prominenter Foto-Check-CTA im /check-Ergebnis (nur bei echtem Anspruch,
 * Tier voll/quote). Verkettet den qualitativen Schuld-Check mit dem
 * quantitativen Foto-Wert-Check. Reicht die Attribution ueber den
 * Domain-Wechsel durch (buildFotoCheckUrl).
 */
export function AnspruchFotoCheckCta({ schuld, leadId }: { schuld?: Schuld; leadId?: string | null }) {
  const t = useTranslations('check')
  const toolSchuld = schuld ? SCHULD_ZU_TOOL[schuld] : undefined
  // `lead` nur gesetzt, wenn der Lead schon existiert (Erfolgs-Ansicht nach dem Submit).
  // Das Foto-Tool schreibt ihn auf anspruch_schaetzungen.lead_id — ohne ihn bleibt die
  // Schaetzung fuer den SV unsichtbar (prod 30.08.: 62 Schaetzungen, 0 verknuepft).
  const extra: Record<string, string | undefined> = {}
  if (toolSchuld) extra.schuld = toolSchuld
  if (leadId) extra.lead = leadId
  const href =
    typeof window !== 'undefined'
      ? buildFotoCheckUrl(EMBED_ORIGIN, window.location.search, Object.keys(extra).length > 0 ? extra : undefined)
      : `${EMBED_ORIGIN}/embed/anspruch-pruefen`

  return (
    <div className="mt-5 rounded-ios-lg border border-claimondo-ondo/30 bg-gradient-to-br from-claimondo-navy to-claimondo-shield p-6 shadow-claimondo-md">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-white/15" aria-hidden>
          <Camera className="h-6 w-6 text-white" />
        </span>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-white">{t('foto_check.heading')}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-white/85">{t('foto_check.text')}</p>
          <a
            href={href}
            data-tracking="cta-check-foto-tool"
            onClick={() => trackEvent('check_foto_cta_click')}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-claimondo-navy transition hover:bg-claimondo-bg"
          >
            {t('foto_check.button')}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  )
}
