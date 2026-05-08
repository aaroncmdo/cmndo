// 2026-05-06: SV-Auftrags-Termine in den Google-Kalender des SVs schreiben.
//
// Bisher war das Sync-Pattern einseitig: gutachter_termine.google_event_id
// existiert seit AAR-694, aber kein Code-Pfad hat tatsaechlich Events
// erstellt. SV-Termine wurden nur in unserer DB gespeichert — der SV sah sie
// in Claimondo, aber NICHT in seinem privaten Kalender. Das hat zu
// Diskrepanzen gefuehrt (SV trag in Apple/Google was anderes ein, wir
// kannten nicht den vollen Konflikt-Stand).
//
// CalDAV-Schreiben (Apple iCloud + Custom-Server) ist nicht implementiert —
// ist eigene Session (siehe docs/plans). Hier nur Google.
//
// Idempotenz: bestehende google_event_id wird vor INSERT geprueft. Wenn vor-
// handen, wird stattdessen update gemacht. Bei delete wird die ID auf null
// gesetzt, sodass ein erneuter sync wieder INSERT macht.
//
// Fail-soft: alle Funktionen werfen NICHT — Fehler werden geloggt und
// gutachter_termine.google_event_id bleibt null. Status-Updates muessen
// atomar bleiben (AGENTS.md non-critical Sub-Op-Regel).

import { google } from 'googleapis'
import { getGoogleOAuthClientForUser } from '@/lib/google/oauth-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { GOOGLE_CALENDAR_TIMEZONE, toBerlinWallClock } from './timezone'

type GutachterTerminRow = {
  id: string
  sv_id: string
  start_zeit: string
  end_zeit: string
  status: string
  google_event_id: string | null
  google_calendar_id: string | null
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

const TIMEZONE = GOOGLE_CALENDAR_TIMEZONE

async function getSvProfileId(svId: string): Promise<string | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('sachverstaendige')
    .select('profile_id')
    .eq('id', svId)
    .maybeSingle()
  return (data?.profile_id as string | null) ?? null
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
  // SV will im Kalender auf einen Blick: Fahrzeug + Ort + Fall-Nr
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
    lines.push(`Fahrzeug: ${[fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ')}`)
  }
  const adresse = fall.besichtigungsort_adresse ?? fall.schadens_adresse
  if (adresse) lines.push(`Adresse: ${adresse}`)
  lines.push('')
  lines.push(`Fallakte: ${appUrl}/gutachter/fall/${fallId}`)
  return lines.join('\n')
}

/**
 * Synct einen gutachter_termine-Eintrag mit dem Google-Kalender des SVs.
 * Wird aufgerufen NACH dem DB-Insert/Update. Update bestehende Event-ID
 * oder erstellt neues Event und schreibt die ID zurueck.
 *
 * Wichtig: Aufruf in try/catch wrappen — diese Funktion wirft nicht, aber
 * im Sinne der AGENTS.md-Regel sollten Caller defensiv bleiben.
 */
export async function syncSvTerminToGoogle(terminId: string, fallId: string): Promise<void> {
  const db = createAdminClient()
  const { data: termin } = await db
    .from('gutachter_termine')
    .select('id, sv_id, start_zeit, end_zeit, status, google_event_id, google_calendar_id')
    .eq('id', terminId)
    .maybeSingle()
  if (!termin) {
    console.warn('[sv-termin-sync] Termin nicht gefunden:', terminId)
    return
  }
  const t = termin as unknown as GutachterTerminRow

  // Nur synchronisieren bei aktiven Status — verlegt/abgesagt/storniert/abgelehnt
  // werden separat via deleteSvTerminFromGoogle() gehandhabt.
  if (!['reserviert', 'bestaetigt', 'verlegung_pending'].includes(t.status)) {
    if (t.google_event_id) {
      // Status hat sich auf einen "weg"-Status geaendert — Event sollte
      // bereits geloescht worden sein durch den Status-Aktions-Caller.
      // Kein expliziter Delete hier, sonst doppelte Calls.
    }
    return
  }

  const profileId = await getSvProfileId(t.sv_id)
  if (!profileId) {
    console.warn('[sv-termin-sync] SV-Profile-ID nicht gefunden fuer', t.sv_id)
    return
  }

  const auth = await getGoogleOAuthClientForUser(profileId)
  if (!auth) {
    // SV nicht mit Google verbunden — Apple-only oder gar nicht. Kein Fehler.
    return
  }

  const fall = await getFallContext(fallId)
  if (!fall) {
    console.warn('[sv-termin-sync] Fall nicht gefunden:', fallId)
    return
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
  const calendar = google.calendar({ version: 'v3', auth })
  const summary = buildEventSummary(fall)
  const description = buildEventDescription(fall, fallId, appUrl)
  const adresse = fall.besichtigungsort_adresse ?? fall.schadens_adresse ?? fall.schadens_ort ?? ''

  const eventBody = {
    summary,
    description,
    location: adresse || undefined,
    start: { dateTime: toBerlinWallClock(t.start_zeit), timeZone: TIMEZONE },
    end: { dateTime: toBerlinWallClock(t.end_zeit), timeZone: TIMEZONE },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'popup', minutes: 15 },
      ],
    },
  }

  try {
    if (t.google_event_id) {
      // Update bestehenden Event
      await calendar.events.update({
        calendarId: t.google_calendar_id ?? 'primary',
        eventId: t.google_event_id,
        requestBody: eventBody,
      })
    } else {
      // Neues Event erstellen + ID zurueck in die DB
      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: eventBody,
      })
      const eventId = response.data.id
      if (eventId) {
        await db
          .from('gutachter_termine')
          .update({
            google_event_id: eventId,
            google_calendar_id: 'primary',
          })
          .eq('id', terminId)
      }
    }
  } catch (err) {
    console.error(
      '[sv-termin-sync] Google-Sync fehlgeschlagen fuer Termin',
      terminId,
      ':',
      err instanceof Error ? err.message : err,
    )
  }
}

/**
 * Loescht den Google-Calendar-Event fuer einen gutachter_termine-Eintrag.
 * Wird bei Storno / Ablehnung / Verlegung-Quelle aufgerufen.
 */
export async function deleteSvTerminFromGoogle(terminId: string): Promise<void> {
  const db = createAdminClient()
  const { data: termin } = await db
    .from('gutachter_termine')
    .select('sv_id, google_event_id, google_calendar_id')
    .eq('id', terminId)
    .maybeSingle()
  if (!termin?.google_event_id) return

  const profileId = await getSvProfileId(termin.sv_id as string)
  if (!profileId) return

  const auth = await getGoogleOAuthClientForUser(profileId)
  if (!auth) return

  try {
    const calendar = google.calendar({ version: 'v3', auth })
    await calendar.events.delete({
      calendarId: (termin.google_calendar_id as string | null) ?? 'primary',
      eventId: termin.google_event_id as string,
    })
  } catch (err) {
    // 404 = Event existiert nicht (mehr) — ist ok.
    const msg = err instanceof Error ? err.message : String(err)
    if (!/404|not.?found/i.test(msg)) {
      console.error(
        '[sv-termin-sync] Google-Delete fehlgeschlagen fuer Termin',
        terminId,
        ':',
        msg,
      )
    }
  }

  // Event-ID zuruecksetzen damit ein spaeterer Re-Sync wieder INSERT macht.
  await db
    .from('gutachter_termine')
    .update({ google_event_id: null, google_calendar_id: null })
    .eq('id', terminId)
}
