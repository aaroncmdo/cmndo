'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { KB_BERATUNG_DURATION_MIN, KB_BERATUNG_VORLAUF_H } from './constants'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { pruefeKbBelegt } from './kb-belegung'
import { syncKbTerminOut, entferneKbTerminOut } from './kb-termin-sync'

type BookResult =
  | { ok: true; terminId: string }
  | { ok: false; error: string }

type CancelResult =
  | { ok: true }
  | { ok: false; error: string }

export async function bookKbTermin(
  fallId: string,
  datum: string,
  uhrzeit: string,
  kanal: 'telefon' | 'video',
  notiz?: string,
): Promise<BookResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt' }

  const db = createAdminClient()

  // 1. Verify fall belongs to this kunde — CMM-49: claims-zentrisch via resolveClaimId-Chokepoint.
  //    geschaedigter_user_id == kunde_id (0-diff live verifiziert 78/0/0); kundenbetreuer_id = claims-SSoT.
  //    `fall`-Shim haelt die alten Feldnamen, damit die Downstream-Nutzung unveraendert bleibt.
  const claimId = await resolveClaimId(db, fallId)
  const { data: claimRow } = claimId
    ? await db.from('claims').select('geschaedigter_user_id, lead_id, kundenbetreuer_id').eq('id', claimId).maybeSingle()
    : { data: null }
  if (!claimRow) return { ok: false, error: 'Fall nicht gefunden' }
  const fall = {
    kunde_id: (claimRow.geschaedigter_user_id as string | null),
    lead_id: (claimRow.lead_id as string | null),
    claim_id: claimId,
  }
  if (fall.kunde_id !== user.id) return { ok: false, error: 'Kein Zugriff' }

  const kbId = (claimRow.kundenbetreuer_id as string | null) ?? null
  if (!kbId) return { ok: false, error: 'Kein Kundenbetreuer zugewiesen' }

  // 2. Parse start time — AAR-956 TZ: {datum,uhrzeit} aus getAvailableKbSlots sind
  // Berlin-Wall-Clock -> echter UTC-Instant (konsistent zur Slot-Generierung + Belegt-Check).
  const startZeit = new Date(berlinWallClockToUtc(`${datum}T${uhrzeit}:00`))
  if (isNaN(startZeit.getTime())) return { ok: false, error: 'Ungültige Zeitangabe' }

  // 3. Validate vorlauf
  const minStart = new Date(Date.now() + KB_BERATUNG_VORLAUF_H * 60 * 60 * 1000)
  if (startZeit < minStart) return { ok: false, error: 'Termin muss mindestens 2 Stunden in der Zukunft liegen' }

  const endZeit = new Date(startZeit.getTime() + KB_BERATUNG_DURATION_MIN * 60 * 1000)

  // 4. Fail-CLOSED Re-Check gegen die KB-Busy-Definition (kb_beratung-Overlap ∪ admin_termine-Overlap),
  //    identisch zum Offer getAvailableKbSlots. Der fruehere Read pruefte nur kb_beratung auf EXAKTE
  //    Startzeit + KEIN admin_termine → ein KB konnte ueber einen eigenen Rueckruf/Meeting gebucht werden.
  const kbBelegt = await pruefeKbBelegt(db, kbId, startZeit.toISOString(), endZeit.toISOString())
  if (!kbBelegt.ok) return { ok: false, error: 'Fehler bei Slot-Prüfung' }
  if (!kbBelegt.frei) return { ok: false, error: 'Dieser Termin ist nicht mehr verfügbar' }

  // 5. Check max 1 open kb_beratung per fall
  const { data: existing, error: existErr } = await db
    .from('gutachter_termine')
    .select('id')
    .eq('fall_id', fallId)
    .eq('typ', 'kb_beratung')
    .in('status', ['bestaetigt', 'reserviert'])
    .is('cancelled_at', null)

  if (existErr) return { ok: false, error: 'Fehler bei Duplikat-Prüfung' }
  if (existing && existing.length > 0) return { ok: false, error: 'Sie haben bereits einen offenen Beratungstermin' }

  // 6. Video-Link: bei kanal='video' Google-Meet generieren wenn der KB
  // mit Google verbunden ist. Schlägt OAuth fehl, fallen wir auf Jitsi
  // zurück (UX > Hard-Fail) und schreiben einen Hinweis ins Timeline-Feld.
  let videoLink: string | null = null
  let googleEventId: string | null = null
  let googleCalendarId: string | null = null
  let googleSyncedAt: string | null = null
  let meetFallback = false

  if (kanal === 'video') {
    try {
      // Kunden- + KB-Daten für Attendee-Liste
      const { data: kbProfile } = await db
        .from('profiles')
        .select('vorname, nachname, email')
        .eq('id', kbId)
        .single()
      let kundeEmail: string | null = null
      let kundeName = 'Kunde'
      if (fall.kunde_id) {
        const { data: kundeProf } = await db
          .from('profiles')
          .select('vorname, nachname, email')
          .eq('id', fall.kunde_id)
          .single()
        if (kundeProf) {
          kundeEmail = (kundeProf.email as string | null) ?? null
          kundeName = [kundeProf.vorname, kundeProf.nachname].filter(Boolean).join(' ') || 'Kunde'
        }
      }
      if (!kundeEmail && fall.lead_id) {
        const { data: lead } = await db.from('leads').select('email, vorname, nachname').eq('id', fall.lead_id).single()
        if (lead) {
          kundeEmail = (lead.email as string | null) ?? null
          kundeName = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || kundeName
        }
      }

      const attendees: Array<{ email: string; displayName?: string }> = []
      if (kbProfile?.email) {
        attendees.push({
          email: kbProfile.email as string,
          displayName: [kbProfile.vorname, kbProfile.nachname].filter(Boolean).join(' ') || undefined,
        })
      }
      if (kundeEmail) attendees.push({ email: kundeEmail, displayName: kundeName })

      if (attendees.length === 0) throw new Error('Keine Teilnehmer-E-Mails verfügbar')

      const { createMeetEvent } = await import('@/lib/google-calendar/events')
      const meet = await createMeetEvent({
        ownerUserId: kbId,
        attendees,
        title: `Beratungstermin · ${kundeName}`,
        description: notiz ?? undefined,
        startISO: startZeit.toISOString(),
        dauerMinuten: KB_BERATUNG_DURATION_MIN,
        withMeet: true,
        idempotencyKey: `kb-${fallId}-${startZeit.getTime()}`,
      })
      videoLink = meet.meetLink
      googleEventId = meet.eventId
      googleCalendarId = meet.calendarId
      googleSyncedAt = new Date().toISOString()
    } catch (err) {
      console.warn('[bookKbTermin] Google-Meet Fallback auf Jitsi:', err instanceof Error ? err.message : err)
      meetFallback = true
      const { randomBytes } = await import('crypto')
      videoLink = `https://meet.jit.si/claimondo-${randomBytes(16).toString('hex')}`
    }
  }

  // 7. Insert termin
  const { data: newTermin, error: insertErr } = await db
    .from('gutachter_termine')
    .insert({
      fall_id: fallId,
      claim_id: fall.claim_id,
      kb_id: kbId,
      typ: 'kb_beratung',
      kanal,
      video_link: videoLink,
      google_event_id: googleEventId,
      google_calendar_id: googleCalendarId,
      google_event_synced_at: googleSyncedAt,
      start_zeit: startZeit.toISOString(),
      end_zeit: endZeit.toISOString(),
      status: 'bestaetigt',
      notiz_kunde: notiz ?? null,
    })
    .select('id')
    .single()

  if (insertErr || !newTermin) {
    // 23P01 = Exclusion-Constraint (KB<->KB atomar): Slot in der TOCTOU-Luecke vergeben.
    if (insertErr?.code === '23P01') {
      return { ok: false, error: 'Dieser Termin ist nicht mehr verfügbar' }
    }
    return { ok: false, error: `Termin konnte nicht gespeichert werden: ${insertErr?.message ?? 'Unbekannter Fehler'}` }
  }

  // SP2c: Termin in den externen KB-Kalender syncen (Meet-Video -> nur CalDAV). Fail-soft.
  await syncKbTerminOut(newTermin.id as string)

  if (meetFallback) {
    await db.from('timeline').insert({
      fall_id: fallId,
      typ: 'system',
      titel: 'Google-Meet nicht generiert',
      beschreibung: 'KB ist nicht mit Google verbunden — Fallback auf Jitsi-Link. KB sollte Google verbinden für Kalender-Sync.',
    }).then(({ error }) => { if (error) console.warn('[bookKbTermin] timeline:', error.message) })
  }

  // 8. Timeline entry
  const { error: tlErr } = await db.from('timeline').insert({
    fall_id: fallId,
    typ: 'termin',
    titel: 'KB-Beratungstermin gebucht',
    beschreibung: `${datum} um ${uhrzeit} Uhr (${kanal === 'video' ? 'Video' : 'Telefon'})`,
  })
  if (tlErr) console.error('[bookKbTermin] Timeline-Insert:', tlErr.message)

  // 9. WhatsApp to kunde (non-critical)
  try {
    let telefon: string | null = null
    let vorname = 'Kunde'

    if (fall.lead_id) {
      const { data: lead } = await db.from('leads').select('telefon, vorname').eq('id', fall.lead_id).single()
      if (lead?.telefon) telefon = lead.telefon
      if (lead?.vorname) vorname = lead.vorname
    }

    if (!telefon && fall.kunde_id) {
      const { data: profile } = await db.from('profiles').select('telefon, vorname').eq('id', fall.kunde_id).single()
      if (profile?.telefon) telefon = profile.telefon
      if (profile?.vorname) vorname = profile.vorname
    }

    if (telefon) {
      const { sendCommunication } = await import('@/lib/communications/send')
      await sendCommunication('kb_termin_bestaetigt', {
        telefon,
        vorname,
        '1': vorname,
        '2': datum,
        '3': uhrzeit,
        '4': kanal === 'video' ? `Video-Call${videoLink ? ': ' + videoLink : ''}` : 'Telefon',
      })
    }
  } catch { /* non-critical */ }

  return { ok: true, terminId: newTermin.id }
}

export async function cancelKbTermin(terminId: string): Promise<CancelResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt' }

  const db = createAdminClient()

  // 1. Load termin + fall to verify ownership
  const { data: termin, error: terminErr } = await db
    .from('gutachter_termine')
    .select('id, fall_id, start_zeit, status, cancelled_at')
    .eq('id', terminId)
    .eq('typ', 'kb_beratung')
    .single()

  if (terminErr || !termin) return { ok: false, error: 'Termin nicht gefunden' }

  // CMM-49: Ownership claims-zentrisch (geschaedigter_user_id == kunde_id, 0-diff) via resolveClaimId.
  const claimId = termin.fall_id ? await resolveClaimId(db, termin.fall_id as string) : null
  const { data: claim } = claimId
    ? await db.from('claims').select('geschaedigter_user_id').eq('id', claimId).maybeSingle()
    : { data: null }
  if (!claim) return { ok: false, error: 'Fall nicht gefunden' }
  if (claim.geschaedigter_user_id !== user.id) return { ok: false, error: 'Kein Zugriff' }

  // 2. Check termin is > 1h in future
  const startZeit = new Date(termin.start_zeit)
  const minCancelBefore = new Date(Date.now() + 60 * 60 * 1000)
  if (startZeit < minCancelBefore) {
    return { ok: false, error: 'Termin kann nur bis 1 Stunde vorher storniert werden' }
  }

  // 3. Update status
  const now = new Date().toISOString()
  const { error: updateErr } = await db
    .from('gutachter_termine')
    // FIX (Status-Enum-Audit 05.07.): 'kunde_storniert' ist KEIN gueltiger
    // gutachter_termine.status (CHECK) -> Update warf 400, Storno schlug fehl.
    // 'storniert' = gueltiger Cancel-State; Kunde-Attribution via cancelled_am + Timeline.
    .update({ status: 'storniert', cancelled_at: now })
    .eq('id', terminId)

  if (updateErr) return { ok: false, error: `Stornierung fehlgeschlagen: ${updateErr.message}` }

  // SP2c: storniertes KB-Event aus Google + CalDAV entfernen. Fail-soft.
  await entferneKbTerminOut(terminId)

  // 4. Timeline entry
  const { error: tlErr } = await db.from('timeline').insert({
    fall_id: termin.fall_id,
    typ: 'termin',
    titel: 'KB-Beratungstermin storniert (Kunde)',
    beschreibung: `Termin am ${new Date(termin.start_zeit).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })} wurde vom Kunden storniert.`,
  })
  if (tlErr) console.error('[cancelKbTermin] Timeline-Insert:', tlErr.message)

  return { ok: true }
}
