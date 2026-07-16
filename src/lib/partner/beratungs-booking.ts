// Natives Beratungs-/Onboarding-Booking fuer Cold-Mail-Prospects (Task #9).
//
// Aaron-Modell (16.07.): "wir als dedizierte Hosts, immer aus dem verbundenen
// Google-Konto, 30 Minuten" — buchbare Hosts = Vertriebs-Staff MIT verbundenem
// Google-Konto (profiles.google_refresh_token). Der Meet-Link entsteht IMMER
// ueber das verbundene Konto des gewaehlten Hosts (createMeetEvent ownerUserId).
//
// Dieses Modul buendelt:
//   1. erstellePartnerOnboardingTermin — der aus legePartnerOnboardingTermin
//      (admin/partner-leads/actions.ts) extrahierte Kern (Termin + Meet +
//      Einladung + Log), host-parametrisiert. Admin-Action + Public-Booking
//      teilen EINEN Pfad.
//   2. ladeBeratungsHosts / ladeFreieBeratungsSlots — Slot-Angebot (Mo-Fr
//      9-17 Berlin, 30-min-Raster, 4h Vorlauf, 14 Tage Horizont) minus Busy
//      (admin_termine 'offen' ∪ aktive kb_beratung — dieselbe Busy-Definition
//      wie pruefeKbBelegt, das beim COMMIT als fail-closed Recheck laeuft).
//   3. bucheBeratungPublic — Selbstbuchung des Prospects (Dedupe + Raster-
//      Validierung + Host-First-Fit + fail-closed Recheck).
//
// KEIN 'use server' (AAR-664) — importierbar von Admin-Action UND /beratung.

import type { SupabaseClient } from '@supabase/supabase-js'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'
import { createMeetEvent } from '@/lib/google-calendar/events'
import { pruefeKbBelegt } from '@/lib/termine/kb-belegung'
import {
  baueTerminTitel,
  berechneEndzeit,
  baueTerminBeschreibung,
  baueTerminAktivitaetText,
  ONBOARDING_TERMIN_DAUER_MIN,
  type OnboardingTerminKanal,
} from './onboarding-termin'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>

// Gespiegelt aus admin/partner-leads/actions.ts (VERTRIEB_ROLLEN) — dort 'use server',
// Konstanten-Export verboten (AAR-664). Aenderungen BEIDSEITIG nachziehen.
const VERTRIEB_HOST_ROLLEN = ['admin', 'dispatch', 'leadbearbeiter']

export const BERATUNG_VORLAUF_H = 4
export const BERATUNG_HORIZONT_TAGE = 14
// Angebots-Fenster (Berlin-Wall-Clock), Mo-Fr. Bewusst fix statt working_hours:
// die Hosts sind Vertriebs-Staff, kein KB-Profil-Setup noetig.
const FENSTER_START = '09:00'
const FENSTER_ENDE = '17:00'
const WERKTAGE = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])

export type BeratungsHost = { id: string; email: string | null; name: string | null }

/** Buchbare Hosts = Vertriebs-Staff mit verbundenem Google-Konto. */
export async function ladeBeratungsHosts(db: Db): Promise<BeratungsHost[]> {
  const { data } = await db
    .from('profiles')
    .select('id, email, vorname, nachname')
    .in('rolle', VERTRIEB_HOST_ROLLEN)
    .not('google_refresh_token', 'is', null)
  return ((data ?? []) as Array<{ id: string; email: string | null; vorname: string | null; nachname: string | null }>)
    .map((p) => ({
      id: p.id,
      email: p.email,
      name: [p.vorname, p.nachname].filter(Boolean).join(' ') || null,
    }))
    // Stabile Reihenfolge -> deterministisches First-Fit.
    .sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * Pure Raster-Generierung: alle Slot-Starts (UTC-Instants) im Angebotsfenster.
 * Iteration analog kb-slots (lokale Tage; auf UTC-Servern koennen Slots direkt
 * um Mitternacht Berlin um einen Tag versetzt einsortiert sein — gleiche,
 * bewusste Vereinfachung wie getAvailableKbSlots).
 */
export function generiereBeratungsSlotStarts(nowMs: number = Date.now()): Date[] {
  const earliest = nowMs + BERATUNG_VORLAUF_H * 60 * 60 * 1000
  const starts: Date[] = []
  for (let offset = 0; offset < BERATUNG_HORIZONT_TAGE; offset++) {
    const day = new Date(nowMs)
    day.setDate(day.getDate() + offset)
    day.setHours(12, 0, 0, 0) // Mittag als DST-sicherer Anker fuer das Datum
    const wochentag = day.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Europe/Berlin' })
    if (!WERKTAGE.has(wochentag)) continue

    const p2 = (n: number) => String(n).padStart(2, '0')
    const dateStr = `${day.getFullYear()}-${p2(day.getMonth() + 1)}-${p2(day.getDate())}`
    const fensterStart = new Date(berlinWallClockToUtc(`${dateStr}T${FENSTER_START}:00`)).getTime()
    const fensterEnde = new Date(berlinWallClockToUtc(`${dateStr}T${FENSTER_ENDE}:00`)).getTime()

    for (
      let t = fensterStart;
      t + ONBOARDING_TERMIN_DAUER_MIN * 60 * 1000 <= fensterEnde;
      t += ONBOARDING_TERMIN_DAUER_MIN * 60 * 1000
    ) {
      if (t >= earliest) starts.push(new Date(t))
    }
  }
  return starts
}

type BusyRange = { start: number; end: number }

function ueberlappt(aStart: number, aEnd: number, b: BusyRange): boolean {
  return aStart < b.end && aEnd > b.start
}

/**
 * Slot-Angebot: frei, wenn MINDESTENS EIN Host frei ist. Busy-Quellen bulk
 * geladen (eine Query je Tabelle), Semantik deckungsgleich mit pruefeKbBelegt.
 */
export async function ladeFreieBeratungsSlots(
  db: Db,
  nowMs: number = Date.now(),
): Promise<Array<{ startIso: string; datum: string; uhrzeit: string }>> {
  const hosts = await ladeBeratungsHosts(db)
  if (hosts.length === 0) return []
  const hostIds = hosts.map((h) => h.id)

  const windowStart = new Date(nowMs).toISOString()
  const windowEnd = new Date(nowMs + BERATUNG_HORIZONT_TAGE * 24 * 60 * 60 * 1000).toISOString()

  const busyByHost = new Map<string, BusyRange[]>(hostIds.map((id) => [id, []]))

  // Offene admin_termine der Hosts (Onboardings, Rueckrufe, Meetings).
  const { data: adminTermine } = await db
    .from('admin_termine')
    .select('zugewiesen_an, start_zeit, end_zeit')
    .in('zugewiesen_an', hostIds)
    .eq('status', 'offen')
    .lt('start_zeit', windowEnd)
    .gte('start_zeit', windowStart)
  for (const t of (adminTermine ?? []) as Array<{ zugewiesen_an: string; start_zeit: string; end_zeit: string | null }>) {
    const start = Date.parse(t.start_zeit)
    if (Number.isNaN(start)) continue
    const end = t.end_zeit ? Date.parse(t.end_zeit) : start
    busyByHost.get(t.zugewiesen_an)?.push({ start, end })
  }

  // Aktive kb_beratung-Termine (falls ein Host auch Kundenbetreuer ist).
  const { data: kbTermine } = await db
    .from('gutachter_termine')
    .select('kb_id, start_zeit, end_zeit')
    .in('kb_id', hostIds)
    .eq('typ', 'kb_beratung')
    .in('status', ['bestaetigt', 'reserviert'])
    .is('cancelled_at', null)
    .lt('start_zeit', windowEnd)
    .gte('start_zeit', windowStart)
  for (const t of (kbTermine ?? []) as Array<{ kb_id: string; start_zeit: string; end_zeit: string | null }>) {
    const start = Date.parse(t.start_zeit)
    if (Number.isNaN(start)) continue
    const end = t.end_zeit ? Date.parse(t.end_zeit) : start + ONBOARDING_TERMIN_DAUER_MIN * 60 * 1000
    busyByHost.get(t.kb_id)?.push({ start, end })
  }

  const dauerMs = ONBOARDING_TERMIN_DAUER_MIN * 60 * 1000
  return generiereBeratungsSlotStarts(nowMs)
    .filter((slot) => {
      const s = slot.getTime()
      const e = s + dauerMs
      return hostIds.some((id) => !(busyByHost.get(id) ?? []).some((b) => ueberlappt(s, e, b)))
    })
    .map((slot) => ({
      startIso: slot.toISOString(),
      datum: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(slot),
      uhrzeit: slot.toLocaleTimeString('de-DE', {
        timeZone: 'Europe/Berlin',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    }))
}

// ─── Kern: Termin + Meet + Einladung (extrahiert aus legePartnerOnboardingTermin) ──

export type ErstelleOnboardingTerminInput = {
  leadId: string
  /** zugewiesen_an + Meet-Owner — MUSS ein Vertriebs-Staff mit Google-Verbindung sein. */
  hostId: string
  /** Audit (erstellt_von); Self-Booking setzt den Host, Admin-Action den Bearbeiter. */
  erstelltVon?: string | null
  startIso: string
  kanal: OnboardingTerminKanal
  treffpunktAdresse?: string | null
}

export type ErstelleOnboardingTerminResult =
  | { ok: true; terminId: string; videoLink: string | null; warnung?: string }
  | { ok: false; error: string }

export async function erstellePartnerOnboardingTermin(
  admin: Db,
  input: ErstelleOnboardingTerminInput,
): Promise<ErstelleOnboardingTerminResult> {
  const start = new Date(input.startIso)
  if (Number.isNaN(start.getTime())) return { ok: false, error: 'Bitte ein gültiges Datum wählen.' }
  if (start.getTime() < Date.now() - 60_000) {
    return { ok: false, error: 'Der Termin liegt in der Vergangenheit.' }
  }

  const { data: lead } = await admin
    .from('partner_leads')
    .select('id, firma, email, ansprechpartner_vorname, ansprechpartner_nachname')
    .eq('id', input.leadId)
    .maybeSingle()
  if (!lead) return { ok: false, error: 'Prospect nicht gefunden.' }

  const firma = (lead.firma as string | null) ?? null
  const leadEmail = ((lead.email as string | null) ?? '').trim() || null
  const ansprechpartner =
    [lead.ansprechpartner_vorname, lead.ansprechpartner_nachname].filter(Boolean).join(' ') || null
  const titel = baueTerminTitel(firma)
  const endIso = berechneEndzeit(input.startIso)
  const treffpunktAdresse =
    input.kanal === 'vor_ort' ? (input.treffpunktAdresse ?? '').trim() || null : null

  // Basis-Insert (Kanal-Felder folgen per Update, sobald Meet/Geocode da ist).
  const { data: inserted, error: insErr } = await admin
    .from('admin_termine')
    .insert({
      typ: 'partner_onboarding',
      titel,
      beschreibung: baueTerminBeschreibung({ kanal: input.kanal, treffpunktAdresse }),
      start_zeit: input.startIso,
      end_zeit: endIso,
      status: 'offen',
      kanal: input.kanal,
      partner_lead_id: input.leadId,
      treffpunkt_adresse: treffpunktAdresse,
      zugewiesen_an: input.hostId,
      erstellt_von: input.erstelltVon ?? input.hostId,
      erinnerung_min_vorher: 60,
    } as never)
    .select('id')
    .single()
  if (insErr || !inserted) {
    return { ok: false, error: insErr?.message ?? 'Termin konnte nicht angelegt werden.' }
  }
  const terminId = (inserted as { id: string }).id

  let warnung: string | undefined
  let videoLink: string | null = null

  if (input.kanal === 'online') {
    try {
      const { data: hostProfile } = await admin
        .from('profiles')
        .select('email')
        .eq('id', input.hostId)
        .maybeSingle()
      const hostEmail = (hostProfile?.email as string | null)?.trim() || null
      if (!hostEmail) throw new Error('Kein Host-Postfach hinterlegt.')
      const attendees: Array<{ email: string; displayName?: string }> = [{ email: hostEmail }]
      if (leadEmail) attendees.push({ email: leadEmail, displayName: ansprechpartner ?? undefined })

      const meet = await createMeetEvent({
        ownerUserId: input.hostId,
        attendees,
        title: titel,
        description: `Onboarding-Gespräch mit ${firma ?? 'dem Partner'}.`,
        startISO: input.startIso,
        dauerMinuten: ONBOARDING_TERMIN_DAUER_MIN,
        withMeet: true,
        idempotencyKey: terminId,
      })
      videoLink = meet.meetLink
      await admin
        .from('admin_termine')
        .update({
          video_link: meet.meetLink,
          beschreibung: baueTerminBeschreibung({ kanal: input.kanal, videoLink: meet.meetLink }),
          google_event_id: meet.eventId,
          google_calendar_id: meet.calendarId,
          google_event_synced_at: new Date().toISOString(),
        } as never)
        .eq('id', terminId)
    } catch (err) {
      console.error('[erstellePartnerOnboardingTermin] Meet (non-critical):', err)
      warnung =
        'Termin angelegt, aber kein Google-Meet-Link — Host ist nicht mit Google verbunden (/admin/einstellungen/google).'
    }
  } else {
    if (treffpunktAdresse) {
      try {
        const { geocodeMitFallback } = await import('@/lib/termine/engine/geocode')
        const geo = await geocodeMitFallback(treffpunktAdresse)
        if (geo) {
          await admin
            .from('admin_termine')
            .update({
              treffpunkt_adresse: geo.adresse ?? treffpunktAdresse,
              treffpunkt_lat: geo.lat,
              treffpunkt_lng: geo.lng,
            } as never)
            .eq('id', terminId)
        }
      } catch (err) {
        console.error('[erstellePartnerOnboardingTermin] Geocode (non-critical):', err)
      }
    }
    try {
      const { syncAdminTerminCalendarEvent } = await import('@/lib/google-calendar/admin-event-sync')
      await syncAdminTerminCalendarEvent(terminId)
    } catch (err) {
      console.error('[erstellePartnerOnboardingTermin] Kalender-Sync (non-critical):', err)
    }
  }

  // Auto-Log als Aktivitaet (typ='sonstiges' ist im CHECK erlaubt).
  try {
    await admin.from('partner_lead_aktivitaeten').insert({
      partner_lead_id: input.leadId,
      typ: 'sonstiges',
      text: baueTerminAktivitaetText(input.startIso, input.kanal),
      erstellt_von: input.erstelltVon ?? input.hostId,
    })
  } catch (err) {
    console.error('[erstellePartnerOnboardingTermin] Aktivitaets-Log (non-critical):', err)
  }

  // Einladung an den Prospect (best-effort).
  try {
    const { sendePartnerOnboardingEinladung } = await import('@/lib/email/google/flows')
    await sendePartnerOnboardingEinladung({
      empfaengerEmail: leadEmail,
      firma,
      ansprechpartner,
      kanal: input.kanal,
      startIso: input.startIso,
      endIso,
      videoLink,
      treffpunktAdresse,
      terminId,
    })
  } catch (err) {
    console.error('[erstellePartnerOnboardingTermin] Einladung (non-critical):', err)
  }

  return warnung ? { ok: true, terminId, videoLink, warnung } : { ok: true, terminId, videoLink }
}

// ─── Public-Selbstbuchung (Prospect waehlt Slot) ────────────────────────────

export async function bucheBeratungPublic(
  db: Db,
  input: { leadId: string; startIso: string },
): Promise<{ ok: true; videoLink: string | null; startIso: string } | { ok: false; error: string }> {
  // Raster-Validierung: der Start MUSS ein aktuell angebotener Slot sein
  // (verhindert beliebige Zeiten/vergangene Slots trotz gueltiger Signatur).
  const raster = new Set(generiereBeratungsSlotStarts().map((d) => d.toISOString()))
  const startIso = new Date(input.startIso).toISOString()
  if (!raster.has(startIso)) {
    return { ok: false, error: 'Dieser Termin ist nicht (mehr) verfügbar — bitte einen anderen wählen.' }
  }

  // Dedupe: ein offener Onboarding-Termin pro Prospect reicht.
  const { data: offen } = await db
    .from('admin_termine')
    .select('id, start_zeit')
    .eq('partner_lead_id', input.leadId)
    .eq('typ', 'partner_onboarding')
    .eq('status', 'offen')
    .gte('start_zeit', new Date().toISOString())
    .limit(1)
  if (offen && offen.length > 0) {
    return { ok: false, error: 'Es ist bereits ein Beratungstermin gebucht — Details stehen in Ihrer E-Mail.' }
  }

  const hosts = await ladeBeratungsHosts(db)
  if (hosts.length === 0) {
    return { ok: false, error: 'Aktuell sind keine Termine buchbar — bitte später erneut versuchen.' }
  }

  const endIso = berechneEndzeit(startIso)
  // First-Fit ueber die (stabil sortierten) Hosts — fail-closed Recheck pro Host
  // (pruefeKbBelegt = dieselbe Busy-Definition wie das Angebot).
  for (const host of hosts) {
    const belegt = await pruefeKbBelegt(db, host.id, startIso, endIso)
    if (!belegt.ok) continue // fail-closed: unsicherer Host wird uebersprungen
    if (!belegt.frei) continue
    const res = await erstellePartnerOnboardingTermin(db, {
      leadId: input.leadId,
      hostId: host.id,
      erstelltVon: host.id,
      startIso,
      kanal: 'online',
    })
    if (!res.ok) {
      // M1: keine rohen DB-Fehler an den anonymen Client.
      console.error('[bucheBeratungPublic] Kern fehlgeschlagen:', res.error)
      return { ok: false, error: 'Buchung fehlgeschlagen — bitte versuchen Sie es erneut.' }
    }
    return { ok: true, videoLink: res.videoLink, startIso }
  }

  return { ok: false, error: 'Der gewählte Termin ist nicht mehr frei — bitte einen anderen wählen.' }
}
