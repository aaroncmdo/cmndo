// src/app/gutachter/_shell/SvMobileHeader.tsx
'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeftIcon } from 'lucide-react'
import UpdatesNav from '@/components/shared/updates'
import { useSvPageChromeState } from './page-chrome-context'
import { matchSvTitle } from './page-titles'

export function SvMobileHeader({
  logoUrl,
  useBrand,
  firmenname,
}: {
  logoUrl?: string | null
  useBrand: boolean
  firmenname?: string | null
}) {
  const pathname = usePathname()
  const router = useRouter()
  const chrome = useSvPageChromeState()
  const isHome = pathname === '/gutachter' || pathname === '/gutachter/heute'
  const title = chrome.title ?? matchSvTitle(pathname) ?? ''

  return (
    <div
      className="lg:hidden fixed left-3 right-3 z-40 flex items-center justify-between gap-3"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        backgroundColor: 'color-mix(in srgb, var(--brand-sidebar-bg) 55%, transparent)',
        backdropFilter: 'saturate(180%) blur(22px)',
        WebkitBackdropFilter: 'saturate(180%) blur(22px)',
        border: '1px solid color-mix(in srgb, white 22%, transparent)',
        borderRadius: 22,
        padding: '8px 14px',
        color: 'var(--brand-text-on-primary)',
        boxShadow:
          '0 14px 36px color-mix(in srgb, var(--brand-sidebar-bg) 45%, transparent), inset 0 1px 0 color-mix(in srgb, white 25%, transparent)',
      }}
    >
      {isHome ? (
        logoUrl ? (
          <Link href="/gutachter" className="inline-flex items-center justify-center">
            <img
              src={logoUrl}
              alt={useBrand ? (firmenname ? `${firmenname} Logo` : 'Logo') : 'Claimondo Logo'}
              className={`h-6 w-auto max-w-28 object-contain ${useBrand ? '' : 'brightness-0 invert'}`}
            />
          </Link>
        ) : (
          <Link href="/gutachter" className="text-base font-bold tracking-tight" style={{ fontFamily: 'var(--brand-font-heading, inherit)' }}>
            <span className="text-white">Claim</span>
            <span style={{ color: 'var(--brand-sidebar-text, #7BA3CC)' }}>ondo</span>
          </Link>
        )
      ) : (
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" onClick={() => router.back()} aria-label="Zurück" className="shrink-0 -ml-1 p-1">
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={useBrand ? (firmenname ? `${firmenname} Logo` : 'Logo') : 'Claimondo Logo'}
              className={`h-5 w-auto max-w-16 object-contain shrink-0 ${useBrand ? '' : 'brightness-0 invert'}`}
            />
          ) : (
            <img src="/brand/logo-mark.svg" alt="Claimondo" className="h-5 w-auto object-contain shrink-0 brightness-0 invert" />
          )}
          {title ? (
            <h1 className="font-semibold text-base truncate" style={{ fontFamily: 'var(--brand-font-heading, inherit)' }}>
              {title}
            </h1>
          ) : null}
        </div>
      )}
      <UpdatesNav variant="dark" />
    </div>
  )
}
