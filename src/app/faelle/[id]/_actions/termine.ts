'use server'

// AAR-169 / KB-Termine: KB-initiierte Buchung eines Videotermins mit dem Kunden.
// bookKbTermin (lib/termine/kb-booking.ts) ist kunden-initiiert — hier baut
// der KB einen Termin im Namen des Kunden und schickt die Einladung per WA.
//
// Geschäftsregel 14.04.2026: „Videotermin: KB solo, NICHT mit LexDrive".

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { KB_BERATUNG_DURATION_MIN } from '@/lib/termine/constants'
import { pruefeKbBelegt } from '@/lib/termine/kb-belegung'
import { syncKbTerminOut } from '@/lib/termine/kb-termin-sync'

export async function createKbVideoterminByKb(
  fallId: string,
  startZeitIso: string,
  kanal: 'video' | 'telefon',
  notiz?: string,
): Promise<{ success: boolean; terminId?: string; videoLink?: string | null; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as string | undefined
  if (rolle !== 'admin' && rolle !== 'kundenbetreuer') {
    return { success: false, error: 'Nur KB/Admin darf Videotermine buchen' }
  }

  // CMM-44 SP-A: kundenbetreuer_id ist claims-Duplikat-Spalte (claims = SSoT)
  // -> via claim_id aus claims nested embed laden statt aus faelle.
  const db = createAdminClient()
  // CMM-49 (faelle-Drop-Runway): via v_claim_full (flat). vcf.id=claim_id (für den Termin-Insert);
  // kundenbetreuer_id claims-SSoT; kunde_id/lead_id div=0.
  const { data: fall } = await db
    .from('v_claim_full')
    .select('id, kunde_id, lead_id, kundenbetreuer_id')
    .eq('fall_id', fallId)
    .single()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  // KB-ID: primär der zugewiesene KB, fallback auf den einloggenden User
  const kbId = (fall.kundenbetreuer_id as string | null) ?? user.id

  const startZeit = new Date(startZeitIso)
  if (isNaN(startZeit.getTime())) return { success: false, error: 'Ungültige Startzeit' }
  if (startZeit.getTime() < Date.now() + 15 * 60 * 1000) {
    return { success: false, error: 'Termin muss mindestens 15 Minuten in der Zukunft liegen' }
  }
  const endZeit = new Date(startZeit.getTime() + KB_BERATUNG_DURATION_MIN * 60 * 1000)

  // Fail-CLOSED Konflikt-Check gegen die KB-Busy-Definition (kb_beratung-Overlap ∪ admin_termine-Overlap),
  // identisch zum Offer getAvailableKbSlots + zu bookKbTermin. Der fruehere Read pruefte nur kb_beratung
  // auf EXAKTE Startzeit + KEIN admin_termine.
  const kbBelegt = await pruefeKbBelegt(db, kbId, startZeit.toISOString(), endZeit.toISOString())
  if (!kbBelegt.ok) {
    return { success: false, error: 'Fehler bei Slot-Prüfung' }
  }
  if (!kbBelegt.frei) {
    return { success: false, error: 'Slot bereits belegt' }
  }

  let videoLink: string | null = null
  if (kanal === 'video') {
    const { randomBytes } = await import('crypto')
    videoLink = `https://meet.jit.si/claimondo-${randomBytes(16).toString('hex')}`
  }

  const { data: termin, error } = await db
    .from('gutachter_termine')
    .insert({
      fall_id: fallId,
      claim_id: fall.id,
      kb_id: kbId,
      typ: 'kb_beratung',
      kanal,
      video_link: videoLink,
      start_zeit: startZeit.toISOString(),
      end_zeit: endZeit.toISOString(),
      status: 'bestaetigt',
    })
    .select('id')
    .single()
  if (error || !termin) {
    // 23P01 = Exclusion-Constraint (KB<->KB atomar): Slot in der TOCTOU-Luecke vergeben.
    if (error?.code === '23P01') {
      return { success: false, error: 'Slot bereits belegt' }
    }
    return { success: false, error: error?.message ?? 'Insert fehlgeschlagen' }
  }

  // Interne Buchungs-Notiz in die Staff-only Intern-Tabelle (honorar/notiz-Auslagerung,
  // Kunde-Leak-Fix — notiz_intern lebt nicht mehr auf gutachter_termine). Fail-soft:
  // die Buchung ist durch, eine fehlgeschlagene Notiz darf den Flow nicht brechen
  // (Muster wie Timeline/WA unten).
  if (notiz) {
    const { error: internError } = await db
      .from('gutachter_termine_intern')
      .upsert({ termin_id: termin.id as string, notiz_intern: notiz }, { onConflict: 'termin_id' })
    if (internError) console.error('[createKbVideoterminByKb] intern-notiz:', internError)
  }

  // SP2c: KB-Termin in den externen Kalender syncen (Jitsi -> beide Provider). Fail-soft.
  await syncKbTerminOut(termin.id as string)

  await db.from('timeline').insert({
    fall_id: fallId,
    typ: 'termin',
    titel: `KB-${kanal === 'video' ? 'Video' : 'Telefon'}termin gebucht (KB-initiated)`,
    beschreibung: `${startZeit.toLocaleString('de-DE')} · ${kanal === 'video' ? 'Video' : 'Telefon'}${videoLink ? ` · ${videoLink}` : ''}${notiz ? ` · ${notiz}` : ''}`,
    erstellt_von: user.id,
  })

  // Kunde per WA informieren (non-critical)
  if (fall.lead_id) {
    try {
      const { data: lead } = await db
        .from('leads')
        .select('telefon, vorname')
        .eq('id', fall.lead_id)
        .single()
      if (lead?.telefon) {
        // C3a: durable via Notification-Outbox. DIES ist der lebende KB-Termin-Pfad
        // (gerufen von _tabs/UebersichtTab.tsx) — eine verlorene Bestaetigung heisst,
        // der Kunde erscheint nicht. Empfaengerkreis unveraendert: die lead.telefon-
        // Guard bleibt, sendFallCommunication resolved denselben Kunden.
        // dedupKey mit der ID des soeben angelegten Termins: ein Fall hat legitim
        // MEHRERE KB-Termine, jeder bekommt genau eine Bestaetigung.
        await enqueue({
          dedupKey: buildDedupKey({
            template: 'kb_termin_bestaetigt',
            claimId: fallId,
            fenster: termin.id as string,
          }),
          kanal: 'whatsapp',
          template: 'kb_termin_bestaetigt',
          claimId: fallId,
          payload: {
            '1': lead.vorname ?? '',
            '2': startZeit.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }),
            '3': startZeit.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }),
            '4': kanal,
            '5': videoLink ?? '',
          },
        })
      }
    } catch (err) {
      console.warn('[createKbVideoterminByKb] WA-Versand fehlgeschlagen:', err)
    }
  }

  revalidatePath(`/faelle/${fallId}`)
  return { success: true, terminId: termin.id, videoLink }
}

// AAR-684 Phase 2: KFZ-41 Termine — createTermin (Video-Call via Google
// Calendar, Phone-Only ohne) + updateTerminStatus (cancel-Flow inkl.
// Google-Event-Löschung).
import { enqueue, buildDedupKey } from '@/lib/notifications/outbox'

/**
 * ⚠ DEAD CODE (verifiziert 11.08.2026): `createTermin` hat **keinen Aufrufer** —
 * `grep createTermin src/` liefert nur diese Definition + den Barrel-Re-Export in
 * `_actions/index.ts`. Der LEBENDE KB-Termin-Pfad ist `createKbVideoterminByKb`
 * (oben, gerufen von `_tabs/UebersichtTab.tsx`); der schreibt nach
 * `gutachter_termine`, diese Funktion nach `termine`.
 * Der `enqueue`-Wiring hier stammt aus der C3a-Tranche 3 und feuert folglich NIE.
 * Vor einer Reaktivierung: erst pruefen, ob `termine` ueberhaupt noch bespielt wird.
 */
export async function createTermin(
  fallId: string,
  data: { typ: string; datum: string; dauer_minuten: number; betreff: string; notiz?: string },
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // AAR-95: Fall + Kunde-Email + KB-Email
  // CMM-44 SP-A: kundenbetreuer_id ist claims-Duplikat-Spalte (claims = SSoT)
  // -> via claim_id aus claims nested embed laden statt aus faelle.
  // CMM-49 (faelle-Drop-Runway): via v_claim_full (flat). kundenbetreuer_id/claim_nummer claims-SSoT.
  const { data: fall } = await supabase
    .from('v_claim_full')
    .select('kunde_id, lead_id, kundenbetreuer_id, claim_nummer')
    .eq('fall_id', fallId)
    .single()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  const kbUserId = (fall.kundenbetreuer_id as string | null) ?? user.id

  let meetLink: string | null = null
  let googleEventId: string | null = null
  let googleCalendarId: string | null = null

  // AAR-95: Bei video-call → Google Calendar Event
  if (data.typ === 'video-call') {
    const { data: kbProfile } = await supabase
      .from('profiles')
      .select('email, google_connected_at')
      .eq('id', kbUserId)
      .single()
    if (!kbProfile?.email) return { success: false, error: 'KB-Email fehlt' }
    if (!kbProfile.google_connected_at) {
      return {
        success: false,
        error: 'Sie müssen zuerst Ihr Google Konto unter /admin/einstellungen/google verbinden, um Videotermine zu buchen.',
      }
    }

    let kundeEmail: string | null = null
    let kundeName = 'Kunde'
    if (fall.lead_id) {
      const { data: lead } = await supabase.from('leads').select('vorname, nachname, email').eq('id', fall.lead_id).single()
      kundeEmail = lead?.email ?? null
      kundeName = [lead?.vorname, lead?.nachname].filter(Boolean).join(' ') || 'Kunde'
    }
    if (!kundeEmail) return { success: false, error: 'Kunde-Email fehlt — Termin kann nicht erstellt werden' }

    try {
      const { createVideoEvent } = await import('@/lib/google-calendar/events')
      const eventResult = await createVideoEvent({
        kbUserId,
        kbEmail: kbProfile.email,
        kundeEmail,
        kundeName,
        fallNummer: (fall.claim_nummer as string | null) ?? fallId.slice(0, 8),
        startISO: data.datum,
        dauerMinuten: data.dauer_minuten,
        beschreibung: data.notiz,
      })
      meetLink = eventResult.meetLink
      googleEventId = eventResult.eventId
      googleCalendarId = eventResult.calendarId
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Google-Calendar-Event fehlgeschlagen' }
    }
  }

  const { error } = await supabase.from('termine').insert({
    fall_id: fallId,
    kunde_user_id: fall?.kunde_id ?? null,
    betreuer_user_id: user.id,
    typ: data.typ,
    datum: data.datum,
    dauer_minuten: data.dauer_minuten,
    betreff: data.betreff,
    notiz: data.notiz || null,
    meet_link: meetLink,
    google_event_id: googleEventId,
    google_calendar_id: googleCalendarId,
    event_synced_at: googleEventId ? new Date().toISOString() : null,
    event_sync_status: googleEventId ? 'synced' : 'not_synced',
    status: 'geplant',
  })

  if (error) return { success: false, error: error.message }

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: `Termin vereinbart: ${data.betreff}`,
    beschreibung: `${data.typ === 'video-call' ? 'Video-Call' : 'Telefonat'} am ${new Date(data.datum).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} (${data.dauer_minuten} Min)${meetLink ? ` · ${meetLink}` : ''}`,
    erstellt_von: user.id,
  })

  const terminDate = new Date(data.datum)
  // C3a: durable via Notification-Outbox — eine verlorene Terminbestaetigung heisst,
  // dass der Kunde nicht erscheint. dedupKey mit dem Termin-Zeitpunkt als Fenster:
  // ein Fall hat legitim MEHRERE Termine, ein Key ohne Fenster haette jede weitere
  // Bestaetigung unterdrueckt; der Insert traegt kein .select(), eine Termin-ID
  // steht hier also nicht zur Verfuegung.
  await enqueue({
    dedupKey: buildDedupKey({ template: 'kb_termin_bestaetigt', claimId: fallId, fenster: data.datum }),
    kanal: 'whatsapp',
    template: 'kb_termin_bestaetigt',
    claimId: fallId,
    payload: {
      termin_typ: data.typ,
      termin_datum: terminDate.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' }),
      termin_uhrzeit: terminDate.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }),
      meet_link: meetLink ?? '',
      '3': terminDate.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' }),
      '4': terminDate.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }),
    },
  }).catch(() => {})

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath('/mitarbeiter/performance')
  revalidatePath('/kunde')
  return { success: true }
}

export async function updateTerminStatus(
  terminId: string,
  status: string,
  ergebnisNotiz?: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const updateData: Record<string, unknown> = { status }
  if (ergebnisNotiz) updateData.ergebnis_notiz = ergebnisNotiz

  const { data: termin, error } = await supabase
    .from('termine')
    .update(updateData)
    .eq('id', terminId)
    .select('fall_id, betreff, typ, google_event_id, google_calendar_id, betreuer_user_id')
    .single()

  if (error) return { success: false, error: error.message }

  // AAR-95: Bei Absage Google-Event löschen
  if (status === 'abgesagt' && termin?.google_event_id && termin?.betreuer_user_id) {
    try {
      const { cancelVideoEvent } = await import('@/lib/google-calendar/events')
      await cancelVideoEvent(
        termin.betreuer_user_id as string,
        termin.google_event_id as string,
        (termin.google_calendar_id as string | null) ?? 'primary',
      )
    } catch (err) { console.error('[AAR-95] cancelVideoEvent:', err) }
  }

  if (termin?.fall_id) {
    const label = status === 'durchgefuehrt' ? 'Termin durchgefuehrt' :
                  status === 'abgesagt' ? 'Termin abgesagt' :
                  status === 'nicht-erschienen' ? 'Termin: Nicht erschienen' : `Termin: ${status}`

    await supabase.from('timeline').insert({
      fall_id: termin.fall_id,
      typ: 'system',
      titel: `${label}: ${termin.betreff ?? ''}`,
      beschreibung: ergebnisNotiz || null,
      erstellt_von: user.id,
    })

    revalidatePath(`/faelle/${termin.fall_id}`)
  }
  revalidatePath('/mitarbeiter/performance')
  revalidatePath('/kunde')
  return { success: true }
}
