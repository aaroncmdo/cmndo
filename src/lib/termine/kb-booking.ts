'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { KB_BERATUNG_DURATION_MIN, KB_BERATUNG_VORLAUF_H } from './constants'

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

  // 1. Verify fall belongs to this kunde
  const { data: fall, error: fallErr } = await db
    .from('faelle')
    .select('id, kunde_id, kundenbetreuer_id, lead_id')
    .eq('id', fallId)
    .single()

  if (fallErr || !fall) return { ok: false, error: 'Fall nicht gefunden' }
  if (fall.kunde_id !== user.id) return { ok: false, error: 'Kein Zugriff' }

  const kbId = fall.kundenbetreuer_id
  if (!kbId) return { ok: false, error: 'Kein Kundenbetreuer zugewiesen' }

  // 2. Parse start time
  const startZeit = new Date(`${datum}T${uhrzeit}:00`)
  if (isNaN(startZeit.getTime())) return { ok: false, error: 'Ungültige Zeitangabe' }

  // 3. Validate vorlauf
  const minStart = new Date(Date.now() + KB_BERATUNG_VORLAUF_H * 60 * 60 * 1000)
  if (startZeit < minStart) return { ok: false, error: 'Termin muss mindestens 2 Stunden in der Zukunft liegen' }

  const endZeit = new Date(startZeit.getTime() + KB_BERATUNG_DURATION_MIN * 60 * 1000)

  // 4. Re-validate slot not already booked (race condition check)
  const { data: conflicting, error: conflErr } = await db
    .from('gutachter_termine')
    .select('id')
    .eq('kb_id', kbId)
    .eq('typ', 'kb_beratung')
    .in('status', ['bestaetigt', 'reserviert'])
    .eq('start_zeit', startZeit.toISOString())
    .is('cancelled_at', null)

  if (conflErr) return { ok: false, error: 'Fehler bei Slot-Prüfung' }
  if (conflicting && conflicting.length > 0) return { ok: false, error: 'Dieser Termin ist nicht mehr verfügbar' }

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

  // 6. Generate video link if needed
  let videoLink: string | null = null
  if (kanal === 'video') {
    const { randomBytes } = await import('crypto')
    videoLink = `https://meet.jit.si/claimondo-${randomBytes(16).toString('hex')}`
  }

  // 7. Insert termin
  const { data: newTermin, error: insertErr } = await db
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
      notiz_kunde: notiz ?? null,
    })
    .select('id')
    .single()

  if (insertErr || !newTermin) {
    return { ok: false, error: `Termin konnte nicht gespeichert werden: ${insertErr?.message ?? 'Unbekannter Fehler'}` }
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

  const { data: fall, error: fallErr } = await db
    .from('faelle')
    .select('id, kunde_id')
    .eq('id', termin.fall_id)
    .single()

  if (fallErr || !fall) return { ok: false, error: 'Fall nicht gefunden' }
  if (fall.kunde_id !== user.id) return { ok: false, error: 'Kein Zugriff' }

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
    .update({ status: 'kunde_storniert', cancelled_at: now })
    .eq('id', terminId)

  if (updateErr) return { ok: false, error: `Stornierung fehlgeschlagen: ${updateErr.message}` }

  // 4. Timeline entry
  const { error: tlErr } = await db.from('timeline').insert({
    fall_id: termin.fall_id,
    typ: 'termin',
    titel: 'KB-Beratungstermin storniert (Kunde)',
    beschreibung: `Termin am ${new Date(termin.start_zeit).toLocaleDateString('de-DE')} wurde vom Kunden storniert.`,
  })
  if (tlErr) console.error('[cancelKbTermin] Timeline-Insert:', tlErr.message)

  return { ok: true }
}
