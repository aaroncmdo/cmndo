'use server'

// 15.05.2026: cookies().set() ist in Server-Components ab Next 15+ verboten —
// nur in Server-Actions, Route-Handlers oder Middleware erlaubt. Der vorherige
// Helper writePromoCookie in promo-attribution.ts war ein normales async-
// File und brach beim direkten Aufruf aus schaden-melden/page.tsx mit
// "APP ROOT CRASH (CMM-14 diag) digest 890686022".
//
// Diese Datei isoliert den Write als echte Server-Action ('use server'-Marker
// auf Datei-Ebene). Aufruf aus dem Server-Component-Render-Pfad ist damit
// erlaubt — Next instrumentiert die Funktion als Action.

import { cookies } from 'next/headers'

const COOKIE_NAME = 'claimondo_promo'
const TTL_DAYS = 30

export async function setPromoCookie(code: string): Promise<void> {
  const c = await cookies()
  c.set(COOKIE_NAME, code, {
    maxAge: TTL_DAYS * 24 * 60 * 60,
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  })
}
