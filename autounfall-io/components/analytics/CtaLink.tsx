'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { trackCtaClick } from '@/lib/track'

// CTA-Link mit Plausible-`cta_click`(location). Client-Wrapper, damit auch
// server-gerenderte CTAs (z. B. ArticleCta) das Funnel-Event feuern koennen.
export function CtaLink({
  href,
  location,
  className,
  children,
}: {
  href: string
  location: string
  className?: string
  children: ReactNode
}) {
  return (
    <Link href={href} className={className} onClick={() => trackCtaClick(location)}>
      {children}
    </Link>
  )
}
