// BUG-83 Befund 6: Logout-Route fuer Admin + Mitarbeiter.
// Vorher wurde aus AdminNav.tsx und mitarbeiter/layout.tsx per
// <form action="/api/auth/logout"> gepostet — die Route existierte aber
// nicht und der User landete auf einer 404.
//
// 2026-05-12 (Staging-Setup-Aaron-Bericht): request.url enthaelt die
// INTERNE Next-Server-URL (http://0.0.0.0:3001/... weil PM2 dort lauscht).
// new URL('/login', request.url) uebernahm den 0.0.0.0:3001-Origin → User
// landete auf 'https://0.0.0.0:3001/login' nach Logout (sowohl auf
// Production als auch Staging). Wir respektieren jetzt die nginx-
// Forwarded-Headers (X-Forwarded-Host, X-Forwarded-Proto), fallen sonst
// auf request.url zurueck (lokaler npm-run-dev-Fall).

import { NextResponse, type NextRequest } from 'next/server'
import { serverSignOut } from '@/lib/auth/logout'

function resolveExternalOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto')
  if (forwardedHost) {
    return `${forwardedProto ?? 'https'}://${forwardedHost}`
  }
  // Fallback: 'host'-Header (gesetzt von jedem HTTP-Client). request.url
  // ist nur die letzte Reserve fuer den lokalen Dev-Server.
  const host = request.headers.get('host')
  if (host) {
    const proto = forwardedProto ?? (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https')
    return `${proto}://${host}`
  }
  return new URL(request.url).origin
}

async function handleLogout(request: NextRequest) {
  const { redirectTo } = await serverSignOut()
  // 303 See Other: Browser folgt mit GET, was bei einem Form-POST gewuenscht
  // ist (sonst versucht der Browser den Redirect erneut per POST).
  return NextResponse.redirect(new URL(redirectTo, resolveExternalOrigin(request)), { status: 303 })
}

export async function POST(request: NextRequest) {
  return handleLogout(request)
}

// GET-Variante fuer Faelle in denen jemand den Logout per Link triggert.
export async function GET(request: NextRequest) {
  return handleLogout(request)
}
