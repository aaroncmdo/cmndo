// AAR-716: SV-Auftrags-Termine in den CalDAV-Kalender des SVs schreiben.
//
// Spiegel von src/lib/google-calendar/sv-termin-sync.ts für Apple-iCloud-,
// Fastmail-, Nextcloud- und Custom-CalDAV-SVs (z. B. Kelvin = Apple-only).
//
// Aufruf-Pattern: nach gutachter_termine-Insert/Update parallel zu
// syncSvTerminToGoogle. Beide sind fail-soft — wenn der SV nur einen
// Provider verbunden hat, no-op'd der andere.
//
// Idempotenz: caldav_object_url + caldav_event_uid in gutachter_termine
// gespeichert. Wenn vorhanden → Update; sonst Create + URL/UID
// zurückschreiben. Bei Delete wird die Spalte auf NULL zurückgesetzt.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  CalDavError,
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from './client'
import { decrypt } from './encryption'

type GutachterTerminRow = {
  id: string
  sv_id: string
  start_zeit: string
  end_zeit: string
  status: string
  caldav_object_url: string | null
  caldav_event_uid: string | null
}

type FallContext = {
  fall_nummer: string | null
  schadens_ort: string | null
  schadens_adresse: string | null
  besichtigungsort_adresse: string | null
  kennzeichen: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  kunde_name: string | null
  kunde_telefon: string | null
}

type CalDavConnection = {
  id: string
  server_url: string
  username: string
  password_encrypted: string
  calendar_url: string | null
}

async function getCalDavConnection(svId: string): Promise<CalDavConnection | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('sv_kalender_verbindungen')
    .select('id, server_url, username, password_encrypted, calendar_url')
    .eq('sv_id', svId)
    .eq('provider', 'caldav')
    .maybeSingle()
  if (!data) return null
  if (!data.calendar_url) return null // Kalender noch nicht ausgewählt
  return data as CalDavConnection
}

async function getFallContext(fallId: string): Promise<FallContext | null> {
  const db = createAdminClient()
  const { data: fall } = await db
    .from('faelle')
    .select(
      'fall_nummer, schadens_ort, schadens_adresse, besichtigungsort_adresse, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, lead_id, kunde_id',
    )
    .eq('id', fallId)
    .maybeSingle()
  if (!fall) return null

  let kunde_name: string | null = null
  let kunde_telefon: string | null = null
  if (fall.lead_id) {
    const { data: lead } = await db
      .from('leads')
      .select('vorname, nachname, telefon')
      .eq('id', fall.lead_id as string)
      .maybeSingle()
    if (lead) {
      kunde_name = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || null
      kunde_telefon = (lead.telefon as string | null) ?? null
    }
  }
  if (!kunde_name && fall.kunde_id) {
    const { data: profile } = await db
      .from('profiles')
      .select('vorname, nachname, telefon')
      .eq('id', fall.kunde_id as string)
      .maybeSingle()
    if (profile) {
      kunde_name = [profile.vorname, profile.nachname].filter(Boolean).join(' ') || null
      kunde_telefon = (profile.telefon as string | null) ?? null
    }
  }

  return {
    fall_nummer: (fall.fall_nummer as string | null) ?? null,
    schadens_ort: (fall.schadens_ort as string | null) ?? null,
    schadens_adresse: (fall.schadens_adresse as string | null) ?? null,
    besichtigungsort_adresse: (fall.besichtigungsort_adresse as string | null) ?? null,
    kennzeichen: (fall.kennzeichen as string | null) ?? null,
    fahrzeug_hersteller: (fall.fahrzeug_hersteller as string | null) ?? null,
    fahrzeug_modell: (fall.fahrzeug_modell as string | null) ?? null,
    kunde_name,
    kunde_telefon,
  }
}

function buildEventSummary(fall: FallContext): string {
  const auto = [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ')
  const ort = fall.besichtigungsort_adresse ?? fall.schadens_adresse ?? fall.schadens_ort ?? ''
  const fallRef = fall.fall_nummer ? ` · ${fall.fall_nummer}` : ''
  const kennz = fall.kennzeichen ? ` (${fall.kennzeichen})` : ''
  const head = auto ? `${auto}${kennz}` : 'Schadenbesichtigung'
  return `${head}${ort ? ' — ' + ort : ''}${fallRef}`.trim()
}

function buildEventDescription(fall: FallContext, fallId: string, appUrl: string): string {
  const lines: string[] = []
  lines.push('Claimondo-Auftrag — Schadenbesichtigung')
  lines.push('')
  if (fall.kunde_name) lines.push(`Kunde: ${fall.kunde_name}`)
  if (fall.kunde_telefon) lines.push(`Telefon: ${fall.kunde_telefon}`)
  if (fall.kennzeichen) lines.push(`Kennzeichen: ${fall.kennzeichen}`)
  if (fall.fahrzeug_hersteller || fall.fahrzeug_modell) {
    lines.push(
      `Fahrzeug: ${[fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ')}`,
    )
  }
  const adresse = fall.besichtigungsort_adresse ?? fall.schadens_adresse
  if (adresse) lines.push(`Adresse: ${adresse}`)
  lines.push('')
  lines.push(`Fallakte: ${appUrl}/gutachter/fall/${fallId}`)
  return lines.join('\n')
}

/**
 * Synchronisiert einen gutachter_termine-Eintrag in den CalDAV-Kalender
 * des zugewiesenen SVs. Wirft NICHT — Fehler werden geloggt und
 * caldav_synced_at bleibt entsprechend unverändert.
 */
export async function syncSvTerminToCalDav(terminId: string, fallId: string): Promise<void> {
  const db = createAdminClient()
  const { data: termin } = await db
    .from('gutachter_termine')
    .select('id, sv_id, start_zeit, end_zeit, status, caldav_object_url, caldav_event_uid')
    .eq('id', terminId)
    .maybeSingle()
  if (!termin) {
    console.warn('[caldav-sv-termin-sync] Termin nicht gefunden:', terminId)
    return
  }
  const t = termin as unknown as GutachterTerminRow

  // Nur synchronisieren bei aktiven Status — verlegt/abgesagt/storniert/abgelehnt
  // werden separat via deleteSvTerminFromCalDav() gehandhabt.
  if (!['reserviert', 'bestaetigt', 'verlegung_pending'].includes(t.status)) {
    return
  }

  const conn = await getCalDavConnection(t.sv_id)
  if (!conn) {
    // SV hat keine CalDAV-Verbindung — no-op (Google-Sync läuft parallel).
    return
  }

  let password: string
  try {
    password = decrypt(conn.password_encrypted)
  } catch (err) {
    console.error(
      '[caldav-sv-termin-sync] Decrypt fehlgeschlagen für SV',
      t.sv_id,
      ':',
      err instanceof Error ? err.message : err,
    )
    return
  }

  const fall = await getFallContext(fallId)
  if (!fall) {
    console.warn('[caldav-sv-termin-sync] Fall nicht gefunden:', fallId)
    return
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
  const summary = buildEventSummary(fall)
  const description = buildEventDescription(fall, fallId, appUrl)
  const adresse = fall.besichtigungsort_adresse ?? fall.schadens_adresse ?? fall.schadens_ort ?? ''

  const creds = {
    serverUrl: conn.server_url,
    username: conn.username,
    password,
  }

  try {
    if (t.caldav_object_url && t.caldav_event_uid) {
      // Update bestehendes Event
      await updateCalendarEvent({
        creds,
        objectUrl: t.caldav_object_url,
        event: {
          uid: t.caldav_event_uid,
          summary,
          description,
          location: adresse || undefined,
          startIso: t.start_zeit,
          endIso: t.end_zeit,
        },
      })
      await db
        .from('gutachter_termine')
        .update({ caldav_synced_at: new Date().toISOString() })
        .eq('id', terminId)
    } else {
      // Neues Event erstellen + URL/UID zurückschreiben
      const result = await createCalendarEvent({
        creds,
        calendarUrl: conn.calendar_url!,
        event: {
          summary,
          description,
          location: adresse || undefined,
          startIso: t.start_zeit,
          endIso: t.end_zeit,
        },
      })
      await db
        .from('gutachter_termine')
        .update({
          caldav_object_url: result.objectUrl,
          caldav_event_uid: result.uid,
          caldav_synced_at: new Date().toISOString(),
        })
        .eq('id', terminId)
    }
  } catch (err) {
    if (err instanceof CalDavError) {
      console.error(
        '[caldav-sv-termin-sync] Sync fehlgeschlagen für Termin',
        terminId,
        '(',
        err.code,
        '):',
        err.message,
      )
      // Bei auth_failed — Verbindung als fehlerhaft markieren damit
      // SV im Profil eine Warnung sieht.
      if (err.code === 'auth_failed') {
        await db
          .from('sv_kalender_verbindungen')
          .update({
            last_error: 'Login fehlgeschlagen — App-Passwort prüfen',
            last_error_at: new Date().toISOString(),
          })
          .eq('id', conn.id)
      }
    } else {
      console.error(
        '[caldav-sv-termin-sync] Unerwarteter Fehler für Termin',
        terminId,
        ':',
        err instanceof Error ? err.message : err,
      )
    }
  }
}

/**
 * Löscht das CalDAV-Event eines gutachter_termine-Eintrags. Wird bei
 * Storno / Ablehnung / Verlegung-Quelle aufgerufen.
 */
export async function deleteSvTerminFromCalDav(terminId: string): Promise<void> {
  const db = createAdminClient()
  const { data: termin } = await db
    .from('gutachter_termine')
    .select('sv_id, caldav_object_url')
    .eq('id', terminId)
    .maybeSingle()
  if (!termin?.caldav_object_url) return

  const conn = await getCalDavConnection(termin.sv_id as string)
  if (!conn) return

  let password: string
  try {
    password = decrypt(conn.password_encrypted)
  } catch (err) {
    console.error(
      '[caldav-sv-termin-sync] Decrypt für Delete fehlgeschlagen:',
      err instanceof Error ? err.message : err,
    )
    return
  }

  try {
    await deleteCalendarEvent({
      creds: {
        serverUrl: conn.server_url,
        username: conn.username,
        password,
      },
      objectUrl: termin.caldav_object_url as string,
    })
  } catch (err) {
    console.error(
      '[caldav-sv-termin-sync] Delete fehlgeschlagen für Termin',
      terminId,
      ':',
      err instanceof Error ? err.message : err,
    )
    return
  }

  await db
    .from('gutachter_termine')
    .update({
      caldav_object_url: null,
      caldav_event_uid: null,
      caldav_synced_at: null,
    })
    .eq('id', terminId)
}
