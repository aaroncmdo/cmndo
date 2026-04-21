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
          '2': startZeit.toLocaleDateString('de-DE'),
          '3': startZeit.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
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
