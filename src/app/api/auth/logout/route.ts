// BUG-83 Befund 6: Logout-Route fuer Admin + Mitarbeiter.
// Vorher wurde aus AdminNav.tsx und mitarbeiter/layout.tsx per
// <form action="/api/auth/logout"> gepostet — die Route existierte aber
// nicht und der User landete auf einer 404.
//
// 2026-05-12 (Staging-Setup-Aaron-Bericht): request.url traegt hinter nginx/PM2
// die INTERNE Bind-Adresse (0.0.0.0:3001) → new URL('/login', request.url)
// landete nach Logout auf 0.0.0.0. Der Origin-Resolver ist jetzt zentral
// (src/lib/external-url.ts) und wird auch von /api/auth/callback +
// /api/auth/linkedin/callback genutzt (gleicher Bug, FlowLink-Audit 2026-07-06).

import { NextResponse, type NextRequest } from 'next/server'
import { serverSignOut } from '@/lib/auth/logout'
import { externalOrigin } from '@/lib/external-url'

async function handleLogout(request: NextRequest) {
  const { redirectTo } = await serverSignOut()
  // 303 See Other: Browser folgt mit GET, was bei einem Form-POST gewuenscht
  // ist (sonst versucht der Browser den Redirect erneut per POST).
  return NextResponse.redirect(new URL(redirectTo, externalOrigin(request)), { status: 303 })
}

export async function POST(request: NextRequest) {
  return handleLogout(request)
}

// GET-Variante fuer Faelle in denen jemand den Logout per Link triggert.
export async function GET(request: NextRequest) {
  return handleLogout(request)
}
