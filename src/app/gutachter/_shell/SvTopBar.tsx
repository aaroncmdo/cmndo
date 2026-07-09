// src/app/gutachter/_shell/SvTopBar.tsx
'use client'
import { type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import WeatherBanner from '@/components/shared/WeatherBanner'
import { useSvPageChromeState } from './page-chrome-context'
import { matchSvTitle } from './page-titles'

export function SvTopBar({
  standortLat,
  standortLng,
  trailingSlot,
}: {
  standortLat: number | null
  standortLng: number | null
  trailingSlot: ReactNode
}) {
  const pathname = usePathname()
  const chrome = useSvPageChromeState()
  const title = chrome.title ?? matchSvTitle(pathname) ?? ''

  return (
    <div className="hidden lg:flex lg:items-center lg:gap-4 lg:pl-4 lg:pt-4">
      {title ? (
        <h1 className="text-lg font-semibold text-[var(--brand-primary,#0D1B3E)] truncate shrink-0">
          {title}
        </h1>
      ) : null}
      <div className="flex-1" />
      {chrome.actions ? (
        <div className="flex items-center gap-3 shrink-0">{chrome.actions}</div>
      ) : null}
      <div className="shrink-0">
        <WeatherBanner
          standortLat={standortLat}
          standortLng={standortLng}
          trailingSlot={trailingSlot}
        />
      </div>
    </div>
  )
}
