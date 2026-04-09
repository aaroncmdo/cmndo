// BUG-83 Befund 6: Logout-Route fuer Admin + Mitarbeiter.
// Vorher wurde aus AdminNav.tsx und mitarbeiter/layout.tsx per
// <form action="/api/auth/logout"> gepostet — die Route existierte aber
// nicht und der User landete auf einer 404.

import { NextResponse, type NextRequest } from 'next/server'
import { serverSignOut } from '@/lib/auth/logout'

async function handleLogout(request: NextRequest) {
  const { redirectTo } = await serverSignOut()
  // 303 See Other: Browser folgt mit GET, was bei einem Form-POST gewuenscht
  // ist (sonst versucht der Browser den Redirect erneut per POST).
  return NextResponse.redirect(new URL(redirectTo, request.url), { status: 303 })
}

export async function POST(request: NextRequest) {
  return handleLogout(request)
}

// GET-Variante fuer Faelle in denen jemand den Logout per Link triggert.
export async function GET(request: NextRequest) {
  return handleLogout(request)
}
