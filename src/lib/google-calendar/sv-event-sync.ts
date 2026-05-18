// AAR-694 Teil B: SV-Event-Sync für gutachter_termine.
//
// Zentraler Helper der ein Event im SV-Google-Kalender create/update/delete
// basierend auf dem aktuellen Termin-Zustand. Wird nach jeder Termin-Mutation
// (Buchung / Bestätigung / Absage / Umplanung) als fire-and-forget aufgerufen.
//
// Fehler (Token abgelaufen, API down, SV nicht verbunden) loggen wir nur —
// der Termin-Flow geht weiter. Der Admin sieht das im Monitoring via
// google_event_synced_at.

import { google } from 'googleapis'
import { getGoogleOAuthClientForUser } from '@/lib/google/oauth-client'
import { createAdminClient } from '@/lib/supabase/admin'

type TerminShape = {
  id: string
  sv_id: string | null
  fall_id: string | null
  start_zeit: string
  end_zeit: string | null
  typ: string | null
  kanal: string | null
  adresse: string | null
  status: string | null
  cancelled_at: string | null
  google_event_id: string | null
  google_calendar_id: string | null
}

/**
 * Decides what to do based on termin status + signature state of the fall:
 *   - cancelled_at / status='abgelehnt'/'storniert'/'abgesagt' → delete event
 *   - sonst nur Event erstellen wenn:
 *       fall.sa_unterschrieben === true UND
 *       (fall.service_typ !== 'komplett' ODER fall.vollmacht_signiert_am ist gesetzt)
 *   - Reservierung intern (gutachter_termine status='reserviert') ohne SA →
 *     KEIN Google-Event. Slot wird intern via gutachter_termine + AAR-264-
 *     DB-Konflikt-Check geblockt; FreeBusy-Google ist zusätzliche Sicherung
 *     gegen externe Termine des SV.
 *   - Wenn die Bedingungen nicht (mehr) erfüllt sind und ein Event existiert
 *     → Event löschen (defensiv, falls SA zurückgezogen wird).
 */
export async function syncSvCalendarEvent(terminId: string): Promise<void> {
  const db = createAdminClient()
  const { data: termin } = await db
    .from('gutachter_termine')
    .select(
      'id, sv_id, fall_id, start_zeit, end_zeit, typ, kanal, adresse, status, cancelled_at, google_event_id, google_calendar_id',
    )
    .eq('id', terminId)
    .maybeSingle()

  if (!termin) return
  const t = termin as unknown as TerminShape

  // Hard-Cancel: Event muss weg wenn vorhanden
  const hardCancelled =
    !!t.cancelled_at ||
    t.status === 'abgelehnt' ||
    t.status === 'storniert' ||
    t.status === 'abgesagt'

  // SA + ggf. Vollmacht-Status vom Fall laden — bestimmt ob Event geschrieben wird
  let signaturesOk = false
  if (!hardCancelled && t.fall_id && (t.status === 'bestaetigt' || t.status === 'reserviert')) {
    // CMM-44 SP-B PR2a: service_typ lebt auf claims (SSoT) — via claims-Embed.
    // sa_unterschrieben + vollmacht_signiert_am sind Cluster b und bleiben
    // bis PR2b auf dem faelle-Select.
    const { data: fall } = await db
      .from('faelle')
      .select('sa_unterschrieben, vollmacht_signiert_am, claims:claim_id(service_typ)')
      .eq('id', t.fall_id)
      .maybeSingle()
    if (fall) {
      const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims
      const serviceTyp = (fallClaim?.service_typ as string | null) ?? null
      const saOk = fall.sa_unterschrieben === true
      const vollmachtOk =
        serviceTyp !== 'komplett' || !!fall.vollmacht_signiert_am
      signaturesOk = saOk && vollmachtOk
    }
  }

  const shouldDelete = hardCancelled || (!signaturesOk && !!t.google_event_id)
  const shouldCreate = !hardCancelled && signaturesOk

  // Löschen: existierendes Event im SV-Kalender entfernen
  if (shouldDelete && t.google_event_id && t.sv_id) {
    const svProfileId = await loadSvProfileId(t.sv_id)
    if (svProfileId) {
      await deleteEvent(svProfileId, t.google_event_id, t.google_calendar_id ?? 'primary').catch(
        (err) => console.warn('[sv-event-sync] delete:', err instanceof Error ? err.message : err),
      )
    }
    await db
      .from('gutachter_termine')
      .update({
        google_event_id: null,
        google_calendar_id: null,
        google_event_synced_at: new Date().toISOString(),
      })
      .eq('id', terminId)
    return
  }

  if (!shouldCreate || !t.sv_id) return

  const svProfileId = await loadSvProfileId(t.sv_id)
  if (!svProfileId) return

  // Fall-Kontext für Event-Beschreibung nachladen
  const eventContext = {
    fallNummer: t.fall_id?.slice(0, 8) ?? 'Claimondo',
    kundeName: '',
    kundeTelefon: '',
    fahrzeug: '',
  }
  if (t.fall_id) {
    // CMM-44 SP-A2 (Cluster 1): schadens_adresse aus dem Select entfernt — war
    // ungenutzt (location nutzt t.adresse), Spalte wandert nach claims.
    const { data: fall } = await db
      .from('faelle')
      .select(
        'fahrzeug_hersteller, fahrzeug_modell, kennzeichen, besichtigungsort_adresse, lead_id, claims:claim_id(claim_nummer)',
      )
      .eq('id', t.fall_id)
      .maybeSingle()
    if (fall) {
      eventContext.fallNummer =
        (Array.isArray(fall.claims) ? fall.claims[0] : fall.claims)?.claim_nummer ?? t.fall_id.slice(0, 8)
      eventContext.fahrzeug = [
        fall.fahrzeug_hersteller,
        fall.fahrzeug_modell,
        fall.kennzeichen ? `(${fall.kennzeichen})` : null,
      ]
        .filter(Boolean)
        .join(' ')
      if (fall.lead_id) {
        const { data: lead } = await db
          .from('leads')
          .select('vorname, nachname, telefon')
          .eq('id', fall.lead_id)
          .maybeSingle()
        if (lead) {
          eventContext.kundeName = [lead.vorname, lead.nachname].filter(Boolean).join(' ')
          eventContext.kundeTelefon = lead.telefon ?? ''
        }
      }
    }
  }

  const title = eventContext.kundeName
    ? `Claimondo · ${eventContext.fallNummer} · ${eventContext.kundeName}`
    : `Claimondo · ${eventContext.fallNummer}`

  const descriptionLines = [
    `Fall: ${eventContext.fallNummer}`,
    eventContext.kundeName ? `Kunde: ${eventContext.kundeName}` : null,
    eventContext.kundeTelefon ? `Telefon: ${eventContext.kundeTelefon}` : null,
    eventContext.fahrzeug ? `Fahrzeug: ${eventContext.fahrzeug}` : null,
    t.fall_id
      ? `Fallakte: ${process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'}/gutachter/fall/${t.fall_id}`
      : null,
  ].filter(Boolean) as string[]

  const startDate = new Date(t.start_zeit)
  const endDate = t.end_zeit
    ? new Date(t.end_zeit)
    : new Date(startDate.getTime() + 60 * 60 * 1000)

  const auth = await getGoogleOAuthClientForUser(svProfileId)
  if (!auth) return // Fail-silent: SV hat keinen Token
  const calendar = google.calendar({ version: 'v3', auth })

  try {
    if (t.google_event_id) {
      // Update bestehendes Event
      await calendar.events.update({
        calendarId: t.google_calendar_id ?? 'primary',
        eventId: t.google_event_id,
        sendUpdates: 'none',
        requestBody: {
          summary: title,
          description: descriptionLines.join('\n'),
          start: { dateTime: startDate.toISOString(), timeZone: 'Europe/Berlin' },
          end: { dateTime: endDate.toISOString(), timeZone: 'Europe/Berlin' },
          location: t.adresse ?? undefined,
        },
      })
      await db
        .from('gutachter_termine')
        .update({ google_event_synced_at: new Date().toISOString() })
        .eq('id', terminId)
    } else {
      // Neues Event anlegen
      const res = await calendar.events.insert({
        calendarId: 'primary',
        sendUpdates: 'none',
        requestBody: {
          summary: title,
          description: descriptionLines.join('\n'),
          start: { dateTime: startDate.toISOString(), timeZone: 'Europe/Berlin' },
          end: { dateTime: endDate.toISOString(), timeZone: 'Europe/Berlin' },
          location: t.adresse ?? undefined,
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 60 },
              { method: 'popup', minutes: 10 },
            ],
          },
        },
      })
      if (res.data.id) {
        await db
          .from('gutachter_termine')
          .update({
            google_event_id: res.data.id,
            google_calendar_id: 'primary',
            google_event_synced_at: new Date().toISOString(),
          })
          .eq('id', terminId)
      }
    }
  } catch (err) {
    console.warn(
      '[sv-event-sync] insert/update für Termin',
      terminId,
      'fehlgeschlagen:',
      err instanceof Error ? err.message : err,
    )
  }
}

/**
 * Sync für alle aktiven SV-Termine eines Falls. Wird nach SA-Unterschrift
 * + Vollmacht-Unterschrift aufgerufen — falls vor der Unterschrift ein
 * Termin reserviert/bestätigt war, wird das Event jetzt nachgeschrieben.
 */
export async function syncSvCalendarEventsForFall(fallId: string): Promise<void> {
  const db = createAdminClient()
  const { data: termine } = await db
    .from('gutachter_termine')
    .select('id')
    .eq('fall_id', fallId)
    .in('status', ['reserviert', 'bestaetigt'])
    .is('cancelled_at', null)
  for (const t of termine ?? []) {
    await syncSvCalendarEvent(t.id as string).catch((err) =>
      console.warn('[sv-event-sync] for-fall', fallId, t.id, err instanceof Error ? err.message : err),
    )
  }
}

async function loadSvProfileId(svId: string): Promise<string | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('sachverstaendige')
    .select('profile_id')
    .eq('id', svId)
    .maybeSingle()
  return (data?.profile_id as string | null) ?? null
}

async function deleteEvent(svProfileId: string, eventId: string, calendarId: string) {
  const auth = await getGoogleOAuthClientForUser(svProfileId)
  if (!auth) return
  const calendar = google.calendar({ version: 'v3', auth })
  await calendar.events.delete({ calendarId, eventId, sendUpdates: 'none' })
}
