'use client'

// AAR-316 W2+W3: Sprach-Banner-Komponente. Zeigt sich nur wenn sprache !== 'de'
// und bietet einen Google-Translate-Link auf die aktuelle Seite.

import { Languages, ExternalLinkIcon } from 'lucide-react'
import { SPRACH_BANNER, googleTranslateUrl, type SpracheCode } from '@/lib/i18n/sprach-banner'
import { useEffect, useState } from 'react'

export function SprachBanner({ sprache }: { sprache: SpracheCode | null | undefined }) {
  const [currentUrl, setCurrentUrl] = useState<string>('')
  useEffect(() => {
    if (typeof window !== 'undefined') setCurrentUrl(window.location.href)
  }, [])

  if (!sprache || sprache === 'de') return null
  const texts = SPRACH_BANNER[sprache]
  if (!texts) return null

  const translateUrl = currentUrl ? googleTranslateUrl(currentUrl, sprache) : '#'

  return (
    <div
      dir={texts.rtl ? 'rtl' : 'ltr'}
      className="sticky top-0 z-40 bg-[#4573A2] text-white px-3 py-2 text-xs sm:text-sm flex items-center justify-between gap-2 flex-wrap"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Languages className="w-4 h-4 shrink-0" />
        <span className="truncate">{texts.title}</span>
      </div>
      {currentUrl && (
        <a
          href={translateUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/20 hover:bg-white/30 font-medium"
        >
          {texts.translateCta}
          <ExternalLinkIcon className="w-3 h-3" />
        </a>
      )}
    </div>
  )
}
