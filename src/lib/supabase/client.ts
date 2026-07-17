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

// Realtime-Auth-Verdrahtung (f99fdb10, 15.07.): Der @supabase/ssr-Browser-Client gibt dem
// Realtime-Socket KEINEN Access-Token (kein accessToken-Callback verdrahtet) -> ALLE
// postgres_changes-Subscriptions laufen als `anon`. Auf RLS-Tabellen, die anon nicht lesen
// darf (claims / flow_links / gutachter_termine — PII-Haertung), wirft walrus dann fuer jede
// Aenderung mit aktivem Subscriber `permission denied for table <t>` (haeufigster Prod-Error
// 15.07.). Fix: den aktuellen Access-Token explizit an realtime.setAuth geben + bei jedem
// Auth-Wechsel nachziehen. setAuth(token) re-keyt auch BEREITS gejointe Channels (realtime-js
// pusht access_token bei Token-Aenderung — derselbe Pfad wie beim 1h-Token-Refresh) -> auch die
// synchron in useEffect subscribten Legs werden authenticated. createBrowserClient ist ein
// Browser-Singleton -> genau EINMAL verdrahten (Guard), sonst Listener-Leak.
let realtimeAuthWired = false
let realtimeAuthReady: Promise<unknown> = Promise.resolve()

/**
 * Resolves, sobald der Realtime-Socket seinen initialen Access-Token via
 * `setAuth` bekommen hat (bzw. `null` gesetzt wurde, falls keine Session).
 *
 * Realtime-Subscriber auf anon-gesperrten Tabellen (claims / gutachter_termine /
 * auftraege / flow_links — PII-Haertung) MUESSEN darauf warten, BEVOR sie
 * `.subscribe()` aufrufen. Der Grund: das `setAuth` unten laeuft async
 * (`getSession().then(...)`), waehrend die Komponenten den Channel synchron im
 * useEffect joinen. Ohne Gate joint der Channel als `anon`, bevor der Token
 * gesetzt ist → walrus wirft `permission denied for table <t>` beim ersten
 * WAL-Poll (haeufigster Prod-Error, 15.–17.07.). Das nachtraegliche Re-Key durch
 * `setAuth` heilt zwar folgende Events, aber der initiale anon-Join-Fehler ist
 * dann schon geloggt. `await whenRealtimeAuthReady()` schliesst dieses Fenster.
 */
export function whenRealtimeAuthReady(): Promise<unknown> {
  return realtimeAuthReady
}

export function createClient(options: { remember?: boolean } = {}) {
  const remember = options.remember !== false
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: remember
        ? { maxAge: ONE_YEAR_SECONDS, path: '/', sameSite: 'lax' }
        : { maxAge: undefined, path: '/', sameSite: 'lax' },
    }
  )

  if (!realtimeAuthWired && typeof window !== 'undefined') {
    realtimeAuthWired = true
    realtimeAuthReady = client.auth.getSession().then(({ data }) => {
      return client.realtime.setAuth(data.session?.access_token ?? null)
    })
    client.auth.onAuthStateChange((_event, session) => {
      void client.realtime.setAuth(session?.access_token ?? null)
    })
  }

  return client
}
