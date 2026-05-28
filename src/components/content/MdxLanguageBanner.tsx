'use client'

// Doc 48 §5.4: Auf nicht-deutschen Locales weist ein dezenter Banner darauf hin,
// dass der Fachartikel-Volltext (Markdown-Body) aktuell nur auf Deutsch vorliegt.
// Selbst-verbergend auf 'de' (de-Nutzer sehen nichts). Die Body-Uebersetzung ist
// Phase 2 (Native-Content); die content/*-Chrome-i18n folgt als separate Tranche.
import { useLocale, useTranslations } from 'next-intl'
import { Languages } from 'lucide-react'

export function MdxLanguageBanner() {
  const locale = useLocale()
  const t = useTranslations('mdx_banner')
  if (locale === 'de') return null
  return (
    <div
      role="note"
      className="mb-6 flex items-start gap-3 rounded-ios-md border border-claimondo-border bg-claimondo-bg px-4 py-3 text-sm leading-relaxed text-claimondo-shield"
    >
      <Languages className="mt-0.5 h-4 w-4 flex-shrink-0 text-claimondo-ondo" aria-hidden />
      <span>{t('notice')}</span>
    </div>
  )
}
