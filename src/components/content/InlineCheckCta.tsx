import { useTranslations } from 'next-intl'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

/**
 * Dezenter Mid/Artikel-CTA Richtung kostenlose Anspruchs-Prüfung (/check).
 * Voller Border + bg-Tint (kein Side-Stripe). Chrome aus dem `content`-Namespace.
 */
export function InlineCheckCta() {
  const t = useTranslations('content')
  return (
    <div className="my-8 flex flex-wrap items-center justify-between gap-4 rounded-ios-md border border-claimondo-ondo/25 bg-claimondo-bg p-5">
      <div className="max-w-prose">
        <b style={HEAD_FONT} className="block text-[1.0625rem] text-claimondo-navy">{t('inline_check.heading')}</b>
        <span className="text-sm text-claimondo-shield">
          {t('inline_check.text')}
        </span>
      </div>
      <a href="/check" className="shrink-0 rounded-full bg-claimondo-ondo px-5 py-2.5 text-sm font-bold text-white transition hover:bg-claimondo-navy">
        {t('inline_check.button')}
      </a>
    </div>
  )
}
