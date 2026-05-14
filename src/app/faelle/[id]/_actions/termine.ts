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

  const db = createAdminClient()
  const { data: fall } = await db
    .from('faelle')
    .select('id, kunde_id, kundenbetreuer_id, lead_id')
    .eq('id', fallId)
    .single()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  // KB-ID: primär der zugewiesene KB, fallback auf den einloggenden User
  const kbId = fall.kundenbetreuer_id ?? user.id

  const startZeit = new Date(startZeitIso)
  if (isNaN(startZeit.getTime())) return { success: false, error: 'Ungültige Startzeit' }
  if (startZeit.getTime() < Date.now() + 15 * 60 * 1000) {
    return { success: false, error: 'Termin muss mindestens 15 Minuten in der Zukunft liegen' }
  }
  const endZeit = new Date(startZeit.getTime() + KB_BERATUNG_DURATION_MIN * 60 * 1000)

  // Konflikt-Check: kein anderer KB-Termin zur gleichen Zeit für denselben KB
  const { data: konflikt } = await db
    .from('gutachter_termine')
    .select('id')
    .eq('kb_id', kbId)
    .eq('typ', 'kb_beratung')
    .in('status', ['bestaetigt', 'reserviert'])
    .eq('start_zeit', startZeit.toISOString())
    .is('cancelled_at', null)
  if (konflikt && konflikt.length > 0) {
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
      kb_id: kbId,
      typ: 'kb_beratung',
      kanal,
      video_link: videoLink,
      start_zeit: startZeit.toISOString(),
      end_zeit: endZeit.toISOString(),
      status: 'bestaetigt',
      notiz_intern: notiz ?? null,
    })
    .select('id')
    .single()
  if (error || !termin) return { success: false, error: error?.message ?? 'Insert fehlgeschlagen' }

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
        const { sendCommunication } = await import('@/lib/communications/send')
        await sendCommunication('kb_termin_bestaetigt', {
          telefon: lead.telefon,
          vorname: lead.vorname ?? '',
          '1': lead.vorname ?? '',
          '2': startZeit.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }),
          '3': startZeit.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }),
          '4': kanal,
          '5': videoLink ?? '',
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
import { sendFallCommunication } from '@/lib/communications/send-fall'

export async function createTermin(
  fallId: string,
  data: { typ: string; datum: string; dauer_minuten: number; betreff: string; notiz?: string },
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // AAR-95: Fall + Kunde-Email + KB-Email
  const { data: fall } = await supabase
    .from('faelle')
    .select('kunde_id, fall_nummer, lead_id, kundenbetreuer_id')
    .eq('id', fallId)
    .single()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  const kbUserId = fall.kundenbetreuer_id ?? user.id

  let meetLink: string | null = null
  let googleEventId: string | null = null
  let googleCalendarId: string | null = null

  // AAR-95: Bei video-call → Google Calendar Event
  if (data.typ === 'video-call') {
    const { data: kbProfile } = await supabase
      .from('profiles')
      .select('email, google_refresh_token')
      .eq('id', kbUserId)
      .single()
    if (!kbProfile?.email) return { success: false, error: 'KB-Email fehlt' }
    if (!kbProfile.google_refresh_token) {
      return {
        success: false,
        error: 'Du musst zuerst dein Google Konto unter /admin/einstellungen/google verbinden, um Videotermine zu buchen.',
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
        fallNummer: fall.fall_nummer ?? fallId.slice(0, 8),
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
  sendFallCommunication(fallId, 'kb_termin_bestaetigt', {
    termin_typ: data.typ,
    termin_datum: terminDate.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' }),
    termin_uhrzeit: terminDate.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }),
    meet_link: meetLink ?? '',
    '3': terminDate.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' }),
    '4': terminDate.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }),
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
