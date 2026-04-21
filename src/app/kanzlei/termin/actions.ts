'use server'

// AAR-kanzlei-termin: Server-Actions für die Kanzlei-Termin-Buchung.
//
// Flow:
//   1. Kanzlei wählt Admin + Slot + Typ (video|vor_ort) + optional Fall-Kontext
//   2. createKanzleiAdminTermin() validiert den Slot (min. 30 Min in der Zukunft,
//      keine Überschneidung im Admin-Kalender innerhalb unserer Tabelle),
//      legt den Google-Calendar-Event im Admin-Kalender an (mit Meet-Link
//      falls typ=video), speichert in kanzlei_admin_termine und
//      schickt eine In-App-Notification an den Admin.
//   3. cancelKanzleiAdminTermin() — stornieren durch Kanzlei, löscht auch
//      das Google-Event damit der Admin-Kalender sauber bleibt.
//
// Admin bekommt den Termin automatisch in seinen Google-Kalender, weil der
// Event auf seinem primary-Kalender angelegt wird (sendUpdates='all').
// Kanzlei-User bekommt die Google-Auto-Invite-Mail als Attendee.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type TerminTyp = 'video' | 'vor_ort'

export interface BuchungInput {
  adminUserId: string
  startISO: string
  dauerMinuten: number
  typ: TerminTyp
  titel: string
  beschreibung?: string
  fallId?: string | null
}

export type BuchungResult =
  | { success: true; terminId: string; meetLink: string | null }
  | { success: false; error: string }

type AuthProfile = {
  rolle: string | null
  email: string | null
  vorname: string | null
  nachname: string | null
}
type AuthUser = { id: string }
type KanzleiAuth =
  | { ok: true; user: AuthUser; profile: AuthProfile | null }
  | { ok: false; error: string }

async function requireKanzleiUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<KanzleiAuth> {
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, email, vorname, nachname')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'kanzlei') {
    return { ok: false, error: 'Nur Kanzlei-Rolle darf Termine buchen' }
  }
  return { ok: true, user: { id: user.id }, profile: profile as AuthProfile }
}

export async function createKanzleiAdminTermin(
  input: BuchungInput,
): Promise<BuchungResult> {
  const supabase = await createClient()
  const auth = await requireKanzleiUser(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  if (!input.adminUserId) return { success: false, error: 'Kein Admin ausgewählt' }
  if (!input.startISO) return { success: false, error: 'Kein Startzeitpunkt' }
  if (input.dauerMinuten < 15 || input.dauerMinuten > 240) {
    return { success: false, error: 'Dauer muss zwischen 15 und 240 Minuten liegen' }
  }
  if (!['video', 'vor_ort'].includes(input.typ)) {
    return { success: false, error: 'Ungültiger Termin-Typ' }
  }
  const titel = input.titel.trim()
  if (titel.length < 3) return { success: false, error: 'Titel zu kurz' }

  const start = new Date(input.startISO)
  if (isNaN(start.getTime())) return { success: false, error: 'Ungültiges Datum' }
  if (start.getTime() < Date.now() + 30 * 60 * 1000) {
    return {
      success: false,
      error: 'Startzeit muss mindestens 30 Minuten in der Zukunft liegen',
    }
  }
  const end = new Date(start.getTime() + input.dauerMinuten * 60 * 1000)

  const db = createAdminClient()

  // Admin-Profil laden (Email für Google-Attendee + Notification-Target)
  const { data: adminProfile, error: adminErr } = await db
    .from('profiles')
    .select('id, email, vorname, nachname, rolle')
    .eq('id', input.adminUserId)
    .maybeSingle()
  if (adminErr || !adminProfile) {
    return { success: false, error: 'Admin nicht gefunden' }
  }
  if (adminProfile.rolle !== 'admin') {
    return { success: false, error: 'Ausgewählter User ist kein Admin' }
  }

  // Überschneidungs-Check (innerhalb unserer Tabelle — Google-Calendar-
  // externe Termine sind ohne FreeBusy-API nicht sichtbar).
  const { data: kollisionen } = await db
    .from('kanzlei_admin_termine')
    .select('id, start_zeit, end_zeit')
    .eq('admin_user_id', input.adminUserId)
    .eq('status', 'gebucht')
    .lt('start_zeit', end.toISOString())
    .gt('end_zeit', start.toISOString())
  if (kollisionen && kollisionen.length > 0) {
    return {
      success: false,
      error: 'Slot kollidiert mit einem bestehenden Kanzlei-Admin-Termin',
    }
  }

  // Google-Calendar-Event auf Admin-Primary-Calendar erstellen
  let googleEventId: string | null = null
  let meetLink: string | null = null
  try {
    const { createMeetEvent } = await import('@/lib/google-calendar/events')
    const attendeeList: Array<{ email: string; displayName?: string }> = []
    if (adminProfile.email) {
      attendeeList.push({
        email: adminProfile.email as string,
        displayName: [adminProfile.vorname, adminProfile.nachname].filter(Boolean).join(' '),
      })
    }
    if (auth.profile?.email) {
      attendeeList.push({
        email: auth.profile.email as string,
        displayName: [auth.profile.vorname, auth.profile.nachname]
          .filter(Boolean)
          .join(' '),
      })
    }
    const ev = await createMeetEvent({
      ownerUserId: input.adminUserId,
      attendees: attendeeList,
      title: `Claimondo · ${titel}`,
      description: input.beschreibung,
      startISO: start.toISOString(),
      dauerMinuten: input.dauerMinuten,
      withMeet: input.typ === 'video',
      idempotencyKey: `kanzlei-admin-${auth.user.id}-${start.getTime()}`,
    })
    googleEventId = ev.eventId
    meetLink = ev.meetLink
  } catch (err) {
    // Wenn der Admin Google noch nicht verbunden hat oder die Calendar-API
    // einen Fehler wirft, speichern wir den Termin trotzdem und markieren
    // ihn für die manuelle Nachbearbeitung — Kanzlei sieht eine Warnung.
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[AAR-kanzlei-termin] Calendar-Event fehlgeschlagen:', msg)
    return {
      success: false,
      error:
        'Der Admin-Kalender ist noch nicht mit Google verbunden — bitte einen anderen Admin wählen oder später erneut versuchen.',
    }
  }

  const { data: row, error: insErr } = await db
    .from('kanzlei_admin_termine')
    .insert({
      kanzlei_user_id: auth.user.id,
      admin_user_id: input.adminUserId,
      fall_id: input.fallId ?? null,
      start_zeit: start.toISOString(),
      end_zeit: end.toISOString(),
      typ: input.typ,
      titel,
      beschreibung: input.beschreibung ?? null,
      google_event_id: googleEventId,
      google_meet_link: meetLink,
    })
    .select('id')
    .single()
  if (insErr || !row) {
    return { success: false, error: insErr?.message ?? 'Insert fehlgeschlagen' }
  }

  // In-App-Notification an den Admin
  try {
    const { createNotification } = await import('@/lib/notifications')
    const kanzleiName =
      [auth.profile?.vorname, auth.profile?.nachname].filter(Boolean).join(' ') ||
      (auth.profile?.email as string | null) ||
      'Kanzlei-Partner'
    const zeitStr = start.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    await createNotification(
      input.adminUserId,
      'kanzlei-termin',
      `Kanzlei-Termin gebucht: ${zeitStr}`,
      `${kanzleiName} hat einen ${input.typ === 'video' ? 'Video-' : 'Vor-Ort-'}Termin gebucht: „${titel}"${input.fallId ? '. Fallbezogen — siehe Fallakte.' : '.'}`,
      input.fallId ? `/faelle/${input.fallId}` : '/admin',
    )
  } catch (err) {
    console.error('[AAR-kanzlei-termin] Notification fehlgeschlagen:', err)
  }

  revalidatePath('/kanzlei/termin')
  return { success: true, terminId: row.id as string, meetLink }
}

export async function cancelKanzleiAdminTermin(
  terminId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const auth = await requireKanzleiUser(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const db = createAdminClient()
  const { data: termin, error: loadErr } = await db
    .from('kanzlei_admin_termine')
    .select('id, admin_user_id, kanzlei_user_id, google_event_id, status')
    .eq('id', terminId)
    .maybeSingle()
  if (loadErr || !termin) return { success: false, error: 'Termin nicht gefunden' }
  if (termin.kanzlei_user_id !== auth.user.id) {
    return { success: false, error: 'Kein Zugriff auf diesen Termin' }
  }
  if (termin.status !== 'gebucht') {
    return { success: false, error: 'Termin ist nicht im Status gebucht' }
  }

  // Google-Event löschen (non-critical — wenn fehlt, trotzdem in DB absagen)
  if (termin.google_event_id) {
    try {
      const { getGoogleOAuthClientForUser } = await import('@/lib/google/oauth-client')
      const auth2 = await getGoogleOAuthClientForUser(termin.admin_user_id as string)
      if (auth2) {
        const { google } = await import('googleapis')
        const calendar = google.calendar({ version: 'v3', auth: auth2 })
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: termin.google_event_id as string,
          sendUpdates: 'all',
        })
      }
    } catch (err) {
      console.error('[AAR-kanzlei-termin] Calendar-Delete fehlgeschlagen:', err)
    }
  }

  const { error: updErr } = await db
    .from('kanzlei_admin_termine')
    .update({ status: 'abgesagt', updated_at: new Date().toISOString() })
    .eq('id', terminId)
  if (updErr) return { success: false, error: updErr.message }

  revalidatePath('/kanzlei/termin')
  return { success: true }
}
