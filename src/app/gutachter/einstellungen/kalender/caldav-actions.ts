'use server'

// AAR-717: Server-Actions für den CalDAV-Connect-Flow im SV-Portal.
//
// Flow:
//   1. testConnection — User-Eingabe validieren, CalDAV-Login probieren,
//      Kalender-Liste zurückgeben damit User einen Hauptkalender wählt.
//   2. saveConnection — Nach Kalender-Wahl Credentials encrypten und in
//      sv_kalender_verbindungen speichern. Bei bestehender Verbindung
//      (gleicher Provider) wird überschrieben.
//   3. disconnect — Zeile löschen, keine Soft-Delete.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { encrypt } from '@/lib/kalender/caldav/encryption'
import { listCalendars, CalDavError, type CalDavCalendar } from '@/lib/kalender/caldav/client'
import { findProvider, type CalDavProviderId } from '@/lib/kalender/caldav/provider-presets'
import { revalidatePath } from 'next/cache'

async function requireSv() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false as const, error: 'Nicht angemeldet' }
  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { ok: false as const, error: 'Kein SV-Profil' }
  return { ok: true as const, svId: sv.id, userId: user.id }
}

export async function testCaldavConnection(input: {
  providerId: string
  serverUrl: string
  username: string
  password: string
}): Promise<
  | { success: true; calendars: CalDavCalendar[]; providerLabel: string }
  | { success: false; error: string; errorCode: 'auth_failed' | 'network' | 'not_found' | 'other' }
> {
  const auth = await requireSv()
  if (!auth.ok) return { success: false, error: auth.error, errorCode: 'other' }

  const provider = findProvider(input.providerId)
  if (!provider) return { success: false, error: 'Unbekannter Provider', errorCode: 'other' }

  const serverUrl = (provider.serverUrl ?? input.serverUrl).trim()
  if (!serverUrl.startsWith('http')) {
    return { success: false, error: 'Server-URL muss mit http(s):// beginnen', errorCode: 'other' }
  }
  if (!input.username || !input.password) {
    return { success: false, error: 'Benutzername und Passwort sind Pflicht', errorCode: 'auth_failed' }
  }

  try {
    const calendars = await listCalendars({
      serverUrl,
      username: input.username.trim(),
      password: input.password,
    })
    if (calendars.length === 0) {
      return { success: false, error: 'Keine Kalender gefunden', errorCode: 'not_found' }
    }
    return { success: true, calendars, providerLabel: provider.label }
  } catch (err) {
    if (err instanceof CalDavError) {
      return { success: false, error: err.message, errorCode: err.code }
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unbekannter Fehler',
      errorCode: 'other',
    }
  }
}

export async function saveCaldavConnection(input: {
  providerId: string
  serverUrl: string
  username: string
  password: string
  calendarUrl: string
  calendarDisplayName: string
}): Promise<{ success: boolean; error?: string }> {
  const auth = await requireSv()
  if (!auth.ok) return { success: false, error: auth.error }

  const provider = findProvider(input.providerId)
  if (!provider) return { success: false, error: 'Unbekannter Provider' }

  const serverUrl = (provider.serverUrl ?? input.serverUrl).trim()

  // Re-Test vor dem Speichern — falls der Modal-State zwischen testConnection
  // und saveConnection abgelaufen ist oder User den Kalender aus einer alten
  // Session fälscht.
  try {
    await listCalendars({ serverUrl, username: input.username.trim(), password: input.password })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Verbindung fehlgeschlagen'
    return { success: false, error: msg }
  }

  const db = createAdminClient()
  const encrypted = encrypt(input.password)
  const { error } = await db
    .from('sv_kalender_verbindungen')
    .upsert(
      {
        sv_id: auth.svId,
        provider: 'caldav' as const,
        server_url: serverUrl,
        username: input.username.trim(),
        password_encrypted: encrypted,
        calendar_url: input.calendarUrl,
        calendar_display_name: input.calendarDisplayName,
        provider_label: provider.label,
        connected_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
        last_error: null,
        last_error_at: null,
      },
      { onConflict: 'sv_id,provider' },
    )
  if (error) return { success: false, error: `Speichern fehlgeschlagen: ${error.message}` }

  revalidatePath('/gutachter/einstellungen/kalender')
  revalidatePath('/gutachter/willkommen')
  return { success: true }
}

export async function disconnectCaldav(): Promise<{ success: boolean; error?: string }> {
  const auth = await requireSv()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = createAdminClient()
  const { error } = await db
    .from('sv_kalender_verbindungen')
    .delete()
    .eq('sv_id', auth.svId)
    .eq('provider', 'caldav')
  if (error) return { success: false, error: `Trennen fehlgeschlagen: ${error.message}` }

  revalidatePath('/gutachter/einstellungen/kalender')
  return { success: true }
}

export type { CalDavProviderId }
