// AAR-717: Healthcheck-Logik für CalDAV-Verbindungen.
//
// Wird vom Cron `/api/cron/caldav-healthcheck` (alle 15 Min) aufgerufen.
// Pingt jede aktive CalDAV-Verbindung. Bei Fehler:
//   - last_error + last_error_at setzen
//   - Einmalig Admin-Task + SV-Task erstellen (nicht bei jedem Poll)
//   - fehler_task_id merken, damit wir's nicht duplizieren
// Bei Erfolg:
//   - last_error / last_error_at / fehler_task_id zurücksetzen
//   - last_sync_at aktualisieren
//   - offene Admin-Task auto-resolven

import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from './encryption'
import { pingConnection, CalDavError } from './client'
import { createLinkedTask } from '@/lib/tasks/create-task'
import { resolveTasksForEntity } from '@/lib/tasks/resolve-tasks'

type VerbindungRow = {
  id: string
  sv_id: string
  server_url: string
  username: string
  password_encrypted: string
  last_error: string | null
  fehler_task_id: string | null
  provider_label: string | null
}

export async function runCaldavHealthcheck(): Promise<{ checked: number; failed: number; recovered: number }> {
  const db = createAdminClient()
  const { data: rows, error } = await db
    .from('sv_kalender_verbindungen')
    .select('id, sv_id, server_url, username, password_encrypted, last_error, fehler_task_id, provider_label')
    .eq('provider', 'caldav')
  if (error) {
    console.error('[caldav-healthcheck] Query:', error.message)
    return { checked: 0, failed: 0, recovered: 0 }
  }
  const verbindungen = (rows ?? []) as unknown as VerbindungRow[]

  let failed = 0
  let recovered = 0
  for (const v of verbindungen) {
    const ok = await pingAndUpdate(v)
    if (ok.status === 'failed') failed++
    else if (ok.status === 'recovered') recovered++
  }
  return { checked: verbindungen.length, failed, recovered }
}

async function pingAndUpdate(v: VerbindungRow): Promise<{ status: 'ok' | 'failed' | 'recovered' }> {
  const db = createAdminClient()

  let plaintext: string
  try {
    plaintext = decrypt(v.password_encrypted)
  } catch (err) {
    await db
      .from('sv_kalender_verbindungen')
      .update({
        last_error: `Credential-Decrypt fehlgeschlagen — Admin muss Verbindung prüfen: ${err instanceof Error ? err.message : String(err)}`,
        last_error_at: new Date().toISOString(),
      })
      .eq('id', v.id)
    return { status: 'failed' }
  }

  try {
    await pingConnection({ serverUrl: v.server_url, username: v.username, password: plaintext })
    // Erfolg — last_error zurücksetzen, Task schließen falls vorhanden.
    if (v.last_error) {
      await db
        .from('sv_kalender_verbindungen')
        .update({
          last_error: null,
          last_error_at: null,
          last_sync_at: new Date().toISOString(),
          fehler_task_id: null,
        })
        .eq('id', v.id)
      await resolveTasksForEntity(
        'gutachter',
        v.sv_id,
        'CalDAV-Verbindung wieder erreichbar',
      )
      return { status: 'recovered' }
    }
    await db
      .from('sv_kalender_verbindungen')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', v.id)
    return { status: 'ok' }
  } catch (err) {
    const errorMsg =
      err instanceof CalDavError ? err.message : err instanceof Error ? err.message : String(err)
    // Nur beim Übergang „ok → failed" Tasks erzeugen — spätere Polls updaten nur
    // den Fehler-Text/Zeitstempel. So spammen wir die Task-Queue nicht zu.
    const istNeu = !v.last_error
    await db
      .from('sv_kalender_verbindungen')
      .update({
        last_error: errorMsg,
        last_error_at: new Date().toISOString(),
      })
      .eq('id', v.id)

    if (istNeu) {
      // Name für Task-Titel
      const { data: sv } = await db
        .from('sachverstaendige')
        .select('profile_id, firmenname, profiles!sachverstaendige_profile_id_fkey(vorname, nachname)')
        .eq('id', v.sv_id)
        .maybeSingle()
      const pRel = (sv as unknown as { profiles?: unknown })?.profiles
      const profile = Array.isArray(pRel) ? pRel[0] : pRel
      const svName =
        [profile && (profile as Record<string, unknown>).vorname, profile && (profile as Record<string, unknown>).nachname]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        (sv as unknown as { firmenname?: string | null })?.firmenname ||
        'Unbekannter SV'

      // Admin-Task
      const adminTask = await createLinkedTask({
        titel: `Kalender-Verbindung von ${svName} fehlgeschlagen`,
        beschreibung: `Provider: ${v.provider_label ?? 'CalDAV'}. Grund: ${errorMsg}`,
        prioritaet: 'normal',
        typ: 'sv_kalender_verbindung_fehlgeschlagen',
        entity_type: 'gutachter',
        entity_id: v.sv_id,
        empfaenger_rolle: 'admin',
        task_code: `sv_caldav_error_${v.sv_id}`,
        trigger_event: 'caldav_healthcheck_failed',
        auto_erstellt: true,
      })

      if (adminTask?.task_id) {
        await db
          .from('sv_kalender_verbindungen')
          .update({ fehler_task_id: adminTask.task_id })
          .eq('id', v.id)
      }

      // SV-Task
      const svProfileId = (sv as unknown as { profile_id?: string | null })?.profile_id ?? null
      await createLinkedTask({
        titel: 'Deine Kalender-Verbindung ist unterbrochen',
        beschreibung: `Bitte verbinde deinen Kalender neu unter Profil → Einstellungen → Kalender. Grund: ${errorMsg}`,
        prioritaet: 'normal',
        typ: 'sv_kalender_verbindung_fehlgeschlagen',
        entity_type: 'gutachter',
        entity_id: v.sv_id,
        empfaenger_rolle: 'sachverstaendiger',
        empfaenger_user_id: svProfileId,
        task_code: `sv_caldav_reconnect_${v.sv_id}`,
        trigger_event: 'caldav_healthcheck_failed',
        auto_erstellt: true,
      })
    }
    return { status: 'failed' }
  }
}
