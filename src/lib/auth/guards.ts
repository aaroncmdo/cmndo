// K4-Konsolidierung: Ownership-Guards für Server-Actions.
//
// Problem: ~50 Actions im Projekt wiederholen dasselbe Muster:
//   const supabase = await createClient()
//   const user = (await supabase.auth.getUser())?.data?.user ?? null
//   if (!user) return { success: false, error: 'Nicht angemeldet' }
//   const { data: profile } = await supabase
//     .from('profiles').select('rolle').eq('id', user.id).single()
//   if (profile?.rolle !== 'admin') return { success: false, ... }
//
// Inkonsistent verteilt: single() vs. maybeSingle(), throws vs. Error-
// Returns, Rollen-Casts mit as string.
//
// Diese Helper geben einen schmalen API-Satz:
//   requireAuth() → AuthedUser oder typisierter Fehler
//   requireRole([...]) → AuthedUser mit verifizierter Rolle
//
// Return-Shape bleibt kompatibel zum bestehenden Action-Pattern
// ({ success, error }). Convention: Call-Site destrukturiert das Ergebnis.

import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export type UserRolle =
  | 'admin'
  | 'dispatch'
  | 'kundenbetreuer'
  | 'sachverstaendiger'
  | 'kanzlei'
  | 'kunde'
  | 'makler'

export type AuthedUser = {
  id: string
  email: string | null
  rolle: UserRolle
  vorname: string | null
  nachname: string | null
}

type Client = SupabaseClient<Database>

export type GuardFailure = {
  success: false
  error: string
  user: null
  supabase: Client
}

export type GuardSuccess = {
  success: true
  error?: undefined
  user: AuthedUser
  supabase: Client
}

export type GuardResult = GuardSuccess | GuardFailure

/**
 * Prüft, ob ein User eingeloggt ist und lädt dessen Profil.
 * Gibt immer einen supabase-Client zurück, damit Caller den Client direkt
 * weiterverwenden können und nicht ein zweites Mal createClient() rufen.
 */
export async function requireAuth(): Promise<GuardResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) {
    return { success: false, error: 'Nicht angemeldet', user: null, supabase }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) {
    return { success: false, error: 'Profil nicht gefunden', user: null, supabase }
  }

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email ?? null,
      rolle: profile.rolle as UserRolle,
      vorname: (profile.vorname as string | null) ?? null,
      nachname: (profile.nachname as string | null) ?? null,
    },
    supabase,
  }
}

/**
 * Prüft Auth + dass der User eine der erlaubten Rollen hat.
 * Gibt denselben GuardResult wie requireAuth zurück — Caller können also
 * auth-only und role-guarded Aufrufe einheitlich behandeln.
 */
export async function requireRole(rollen: UserRolle[]): Promise<GuardResult> {
  const res = await requireAuth()
  if (!res.success) return res
  if (!rollen.includes(res.user.rolle)) {
    return {
      success: false,
      error: `Rolle "${res.user.rolle}" nicht berechtigt`,
      user: null,
      supabase: res.supabase,
    }
  }
  return res
}
