'use client'

import { useTranslations } from 'next-intl'
import { Camera, ChevronRight } from 'lucide-react'
import { buildFotoCheckUrl } from '@/lib/check/foto-check-url'
import { trackEvent } from '@/lib/analytics/track-event'

const EMBED_ORIGIN = process.env.NEXT_PUBLIC_EMBED_ORIGIN ?? 'https://app.claimondo.de'

/**
 * Prominenter Foto-Check-CTA im /check-Ergebnis (nur bei echtem Anspruch,
 * Tier voll/quote). Verkettet den qualitativen Schuld-Check mit dem
 * quantitativen Foto-Wert-Check. Reicht die Attribution ueber den
 * Domain-Wechsel durch (buildFotoCheckUrl).
 */
export function AnspruchFotoCheckCta() {
  const t = useTranslations('check')
  const href =
    typeof window !== 'undefined'
      ? buildFotoCheckUrl(EMBED_ORIGIN, window.location.search)
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
