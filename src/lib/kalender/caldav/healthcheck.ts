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
//
// SP2a: liest/schreibt die kanonische Tabelle kalender_verbindungen (profil-gekeyt)
// statt sv_kalender_verbindungen. Die Task-Verlinkung ist SV-spezifisch (entity 'gutachter'),
// daher wird die SV per profile_id aufgelöst; Nicht-SV-Verbindungen (künftige KB, SP2b)
// bekommen last_error, aber keinen gutachter-Task.

import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from './encryption'
import { pingConnection, CalDavError } from './client'
import { createLinkedTask } from '@/lib/tasks/create-task'
import { resolveTasksForEntity } from '@/lib/tasks/resolve-tasks'

type VerbindungRow = {
  id: string
  profile_id: string
  server_url: string
  username: string
  password_encrypted: string
  last_error: string | null
  fehler_task_id: string | null
  provider_label: string | null
}

// SP2a: Die Task-Verlinkung ist gutachter-spezifisch → SV per profile_id auflösen.
// Null = Nicht-SV-Verbindung (z.B. künftige KB); Caller überspringt dann die Task-Erzeugung.
async function svFuerProfil(
  db: ReturnType<typeof createAdminClient>,
  profileId: string,
): Promise<{ id: string; firmenname: string | null; profiles: unknown } | null> {
  const { data } = await db
    .from('sachverstaendige')
    .select('id, firmenname, profiles!sachverstaendige_profile_id_fkey(vorname, nachname)')
    .eq('profile_id', profileId)
    .maybeSingle()
  return (data as unknown as { id: string; firmenname: string | null; profiles: unknown } | null) ?? null
}

export async function runCaldavHealthcheck(): Promise<{ checked: number; failed: number; recovered: number }> {
  const db = createAdminClient()
  const { data: rows, error } = await db
    .from('kalender_verbindungen')
    .select('id, profile_id, server_url, username, password_encrypted, last_error, fehler_task_id, provider_label')
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
      .from('kalender_verbindungen')
      .update({
        last_error: `Credential-Decrypt fehlgeschlagen — Admin muss Verbindung prüfen: ${err instanceof Error ? err.message : String(err)}`,
        last_error_at: new Date().toISOString(),
      })
      .eq('id', v.id)
    return { status: 'failed' }
  }

  try {
    await pingConnection({ serverUrl: v.server_url, username: v.username, password: plaintext })
    // Erfolg — last_error zuruecksetzen, Warnungen aufloesen.
    const warErrorVermerkt = !!v.last_error
    if (warErrorVermerkt) {
      await db
        .from('kalender_verbindungen')
        .update({
          last_error: null,
          last_error_at: null,
          last_sync_at: new Date().toISOString(),
          fehler_task_id: null,
        })
        .eq('id', v.id)
    } else {
      await db
        .from('kalender_verbindungen')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', v.id)
    }

    // ⚠ Warnungen IMMER aufloesen, nicht nur wenn `last_error` gesetzt WAR.
    //
    // Vorher stand das Aufloesen im `if (v.last_error)`-Zweig. Wurde `last_error` auf
    // irgendeinem anderen Weg genullt (Recovery in einem Lauf, der die Tasks nicht fand;
    // manueller Eingriff; Aenderung am Fehlerpfad), blieb die Warnung fuer immer offen --
    // die Aufraeumlogik haengte an einem FLAG statt am tatsaechlichen Zustand.
    // Prod-Messung 14.08.: 7 offene "Kalender-Verbindung fehlgeschlagen"-Tasks bei
    // 5 von 5 gesunden Verbindungen (alle mit Sync derselben Stunde, kein last_error).
    // Ein Alarm, der ein behobenes Problem meldet, kostet dasselbe Vertrauen wie ein
    // uebersehener -- nach ein paar davon sieht niemand mehr hin.
    //
    // resolveTasksForEntity ist idempotent: gibt es nichts Offenes, tut es nichts.
    const sv = await svFuerProfil(db, v.profile_id)
    if (sv) {
      await resolveTasksForEntity('gutachter', sv.id, 'CalDAV-Verbindung wieder erreichbar')
    }
    if (warErrorVermerkt) return { status: 'recovered' }
    return { status: 'ok' }
  } catch (err) {
    const errorMsg =
      err instanceof CalDavError ? err.message : err instanceof Error ? err.message : String(err)
    // Nur beim Übergang „ok → failed" Tasks erzeugen — spätere Polls updaten nur
    // den Fehler-Text/Zeitstempel. So spammen wir die Task-Queue nicht zu.
    const istNeu = !v.last_error
    await db
      .from('kalender_verbindungen')
      .update({
        last_error: errorMsg,
        last_error_at: new Date().toISOString(),
      })
      .eq('id', v.id)

    if (istNeu) {
      // SV für die gutachter-Task-Verlinkung auflösen. Nicht-SV-Verbindung (künftige KB):
      // last_error ist gesetzt, aber kein gutachter-Task.
      const sv = await svFuerProfil(db, v.profile_id)
      if (!sv) {
        console.warn('[caldav-healthcheck] kein SV für Profil', v.profile_id, '— gutachter-Task übersprungen')
        return { status: 'failed' }
      }
      const pRel = (sv as { profiles?: unknown }).profiles
      const profile = Array.isArray(pRel) ? pRel[0] : pRel
      const svName =
        [profile && (profile as Record<string, unknown>).vorname, profile && (profile as Record<string, unknown>).nachname]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        sv.firmenname ||
        'Unbekannter SV'

      // Admin-Task
      const adminTask = await createLinkedTask({
        titel: `Kalender-Verbindung von ${svName} fehlgeschlagen`,
        beschreibung: `Provider: ${v.provider_label ?? 'CalDAV'}. Grund: ${errorMsg}`,
        prioritaet: 'normal',
        typ: 'sv_kalender_verbindung_fehlgeschlagen',
        entity_type: 'gutachter',
        entity_id: sv.id,
        empfaenger_rolle: 'admin',
        task_code: `sv_caldav_error_${sv.id}`,
        trigger_event: 'caldav_healthcheck_failed',
        auto_erstellt: true,
      })

      if (adminTask?.task_id) {
        await db
          .from('kalender_verbindungen')
          .update({ fehler_task_id: adminTask.task_id })
          .eq('id', v.id)
      }

      // SV-Task — empfaenger_user_id = profile_id (direkt aus der Row).
      await createLinkedTask({
        titel: 'Deine Kalender-Verbindung ist unterbrochen',
        beschreibung: `Bitte verbinde deinen Kalender neu unter Profil → Einstellungen → Kalender. Grund: ${errorMsg}`,
        prioritaet: 'normal',
        typ: 'sv_kalender_verbindung_fehlgeschlagen',
        entity_type: 'gutachter',
        entity_id: sv.id,
        empfaenger_rolle: 'sachverstaendiger',
        empfaenger_user_id: v.profile_id,
        task_code: `sv_caldav_reconnect_${sv.id}`,
        trigger_event: 'caldav_healthcheck_failed',
        auto_erstellt: true,
      })
    }
    return { status: 'failed' }
  }
}
