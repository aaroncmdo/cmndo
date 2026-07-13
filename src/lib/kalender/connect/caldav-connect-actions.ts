'use server'

// SP2a: Profil-generische Server-Actions fuer den CalDAV-Connect-Flow (SV, KB, ...).
// Ersetzt das alte SV-spezifische src/app/gutachter/einstellungen/kalender/caldav-actions.ts.
// Keyt auf die profile_id des eingeloggten Users (profiles.id == auth.uid) und schreibt
// die kanonische Tabelle kalender_verbindungen (die die Sync-Engine liest) statt der
// alten sv_kalender_verbindungen. Result-Shapes unveraendert -> CalDavConnectModal-Kompat.
//
// Flow:
//   1. testCaldavConnection — User-Eingabe validieren, CalDAV-Login probieren,
//      Kalender-Liste zurueckgeben damit User einen Hauptkalender waehlt.
//   2. saveCaldavConnection — Credentials encrypten + in kalender_verbindungen speichern.
//   3. disconnectCaldav — Zeile loeschen.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/kalender/caldav/encryption'
import { listCalendars, CalDavError, type CalDavCalendar } from '@/lib/kalender/caldav/client'
import { findProvider } from '@/lib/kalender/caldav/provider-presets'
import { revalidatePath } from 'next/cache'

// AAR-722: iCloud verlangt in der Praxis oft das App-Passwort OHNE Bindestriche.
// Wir probieren den User-Input zuerst wie eingegeben, bei Auth-Fail Fallback ohne
// Bindestriche + ohne Whitespace. Nur fuer iCloud.
async function listCalendarsWithIcloudRetry(
  creds: { serverUrl: string; username: string; password: string },
  providerId: string,
) {
  try {
    return { calendars: await listCalendars(creds), normalizedPassword: creds.password }
  } catch (err) {
    const canRetry = providerId === 'icloud' && err instanceof CalDavError && err.code === 'auth_failed'
    if (!canRetry) throw err
    const stripped = creds.password.replace(/[\s-]/g, '')
    if (stripped === creds.password || stripped.length < 8) throw err
    return {
      calendars: await listCalendars({ ...creds, password: stripped }),
      normalizedPassword: stripped,
    }
  }
}

// profiles.id == auth.uid -> die profile_id des eingeloggten Users ist user.id.
// Kein Rollen-Gate: ein User verbindet seinen EIGENEN Kalender (SV, KB, ...).
async function requireProfileId() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false as const, error: 'Nicht angemeldet' }
  return { ok: true as const, profileId: user.id }
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
  const auth = await requireProfileId()
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
    const { calendars } = await listCalendarsWithIcloudRetry(
      { serverUrl, username: input.username.trim(), password: input.password.trim() },
      input.providerId,
    )
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
  const auth = await requireProfileId()
  if (!auth.ok) return { success: false, error: auth.error }

  const provider = findProvider(input.providerId)
  if (!provider) return { success: false, error: 'Unbekannter Provider' }

  const serverUrl = (provider.serverUrl ?? input.serverUrl).trim()

  // Re-Test vor dem Speichern. AAR-722: normalisiertes Passwort speichern (ohne Bindestriche
  // bei iCloud), damit der Healthcheck-Cron mit exakt dem gleichen Passwort arbeitet.
  let normalizedPassword: string
  try {
    const res = await listCalendarsWithIcloudRetry(
      { serverUrl, username: input.username.trim(), password: input.password.trim() },
      input.providerId,
    )
    normalizedPassword = res.normalizedPassword
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Verbindung fehlgeschlagen'
    return { success: false, error: msg }
  }

  const db = createAdminClient()
  const encrypted = encrypt(normalizedPassword)
  const { error } = await db
    .from('kalender_verbindungen')
    .upsert(
      {
        profile_id: auth.profileId,
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
      { onConflict: 'profile_id,provider' },
    )
  if (error) return { success: false, error: `Speichern fehlgeschlagen: ${error.message}` }

  revalidatePath('/gutachter/einstellungen/kalender')
  revalidatePath('/gutachter/einstellungen')
  revalidatePath('/gutachter/willkommen')
  revalidatePath('/mitarbeiter/profil')
  return { success: true }
}

export async function disconnectCaldav(): Promise<{ success: boolean; error?: string }> {
  const auth = await requireProfileId()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = createAdminClient()
  const { error } = await db
    .from('kalender_verbindungen')
    .delete()
    .eq('profile_id', auth.profileId)
    .eq('provider', 'caldav')
  if (error) return { success: false, error: `Trennen fehlgeschlagen: ${error.message}` }

  revalidatePath('/gutachter/einstellungen/kalender')
  revalidatePath('/mitarbeiter/profil')
  return { success: true }
}
