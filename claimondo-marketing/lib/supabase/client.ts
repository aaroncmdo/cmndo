import { createBrowserClient } from '@supabase/ssr'

// BUG-83 Befund 7: Persistente vs. Session-Cookies fuer "Angemeldet bleiben".
//
// Default = persistent (1 Jahr maxAge) — wir erhalten den existing
// Behavior fuer alle Aufrufer die createClient() ohne Argumente nutzen.
//
// remember=false → cookieOptions ohne maxAge → Session-Cookie. Der
// Browser loescht die Cookies sobald das Fenster geschlossen wird, der
// User muss sich neu einloggen. Praezise das gewuenschte Verhalten.
//
// Token-Refresh laeuft automatisch via Supabase autoRefreshToken=true
// (Default), kein zusaetzliches Setup noetig.

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export function createClient(options: { remember?: boolean } = {}) {
  const remember = options.remember !== false
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: remember
        ? { maxAge: ONE_YEAR_SECONDS, path: '/', sameSite: 'lax' }
        : { maxAge: undefined, path: '/', sameSite: 'lax' },
    }
  )
}
