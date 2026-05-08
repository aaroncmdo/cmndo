'use server'

// CMM-40: Server-Action fuer den Re-Termin-Slot-Pick.
//
// Ablauf:
//   1. Token validieren (Fall existiert, Token noch aktiv, nicht storniert)
//   2. Slot-Konflikt-Check (race-safe: SV koennte zwischen Page-Render und
//      Submit einen Termin gebucht haben)
//   3. Insert gutachter_termine status='reserviert' (kunde-vorgeschlag)
//   4. Update faelle.re_termin_token_eingelaufen_am = now() — entwertet den
//      Token + signalisiert dem no-show-timeout-Cron, NICHT zu stornieren
//   5. Result-Pattern { ok, error? }

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

const SLOT_DURATION_H = 1

export async function waehleReTerminSlot(
  token: string,
  slotStartIso: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!token || !slotStartIso) {
    return { ok: false, error: 'Ungueltige Anfrage' }
  }

  const start = new Date(slotStartIso)
  if (Number.isNaN(start.getTime())) {
    return { ok: false, error: 'Ungueltiger Termin' }
  }
  // Slot darf nicht in der Vergangenheit liegen
  if (start.getTime() < Date.now()) {
    return { ok: false, error: 'Termin liegt in der Vergangenheit' }
  }

  const end = new Date(start)
  end.setHours(end.getHours() + SLOT_DURATION_H)

  const db = createAdminClient()

  // Token-Lookup
  const { data: fall } = await db
    .from('faelle')
    .select('id, sv_id, lead_id, re_termin_token_eingelaufen_am, storniert_am')
    .eq('re_termin_token', token)
    .single()

  if (!fall) return { ok: false, error: 'Token nicht gefunden' }
  if (fall.storniert_am) return { ok: false, error: 'Fall wurde storniert' }
  if (fall.re_termin_token_eingelaufen_am) return { ok: false, error: 'Termin wurde bereits ausgewaehlt' }
  if (!fall.sv_id) return { ok: false, error: 'Kein Sachverstaendiger zugewiesen' }

  // Race-safe Konflikt-Check
  const { data: konflikte } = await db
    .from('gutachter_termine')
    .select('id')
    .eq('sv_id', fall.sv_id)
    .not('status', 'in', '("storniert","abgelehnt","abgesagt")')
    .lt('start_zeit', end.toISOString())
    .gt('end_zeit', start.toISOString())
    .limit(1)

  if (konflikte && konflikte.length > 0) {
    return { ok: false, error: 'Dieser Slot ist nicht mehr verfuegbar — bitte einen anderen waehlen.' }
  }

  // Insert: kunde-vorgeschlagener Termin als 'reserviert'. SV bestaetigt
  // ueber sein Portal — dann wird daraus 'bestaetigt'.
  const { data: inserted, error: insertErr } = await db.from('gutachter_termine').insert({
    fall_id: fall.id,
    sv_id: fall.sv_id,
    start_zeit: start.toISOString(),
    end_zeit: end.toISOString(),
    status: 'reserviert',
    typ: 'besichtigung',
  }).select('id').single()

  if (insertErr) {
    return { ok: false, error: insertErr.message }
  }

  // 2026-05-06: SV-Termin direkt in Google- + CalDAV-Kalender. Status
  // reserviert wird auch gesynct, damit der SV den Vorschlag im Kalender
  // sieht. Non-critical, parallel.
  if (inserted?.id) {
    const tid = inserted.id as string
    const fid = fall.id as string
    await Promise.all([
      (async () => {
        try {
          const { syncSvTerminToGoogle } = await import('@/lib/google-calendar/sv-termin-sync')
          await syncSvTerminToGoogle(tid, fid)
        } catch (err) {
          console.error('[sv-termin-sync] Google Re-Termin-Slot:', err)
        }
      })(),
      (async () => {
        try {
          const { syncSvTerminToCalDav } = await import('@/lib/kalender/caldav/sv-termin-sync')
          await syncSvTerminToCalDav(tid, fid)
        } catch (err) {
          console.error('[sv-termin-sync] CalDAV Re-Termin-Slot:', err)
        }
      })(),
    ])
  }

  // Token entwerten (verhindert Doppel-Wahl + Storno-Cron skipt)
  const { error: updateErr } = await db
    .from('faelle')
    .update({ re_termin_token_eingelaufen_am: new Date().toISOString() })
    .eq('id', fall.id)

  if (updateErr) {
    console.error('[CMM-40] Token-Entwertung fehlgeschlagen:', updateErr.message)
  }

  // Timeline-Eintrag fuer KB-Sicht
  try {
    await db.from('timeline').insert({
      fall_id: fall.id,
      typ: 'termin',
      titel: 'Re-Termin durch Kunde vorgeschlagen',
      beschreibung: `Neuer Slot: ${start.toLocaleString('de-DE')}. Wartet auf SV-Bestaetigung.`,
      erstellt_von: null,
    })
  } catch (err) {
    console.error('[CMM-40] Timeline-Insert fehlgeschlagen (non-critical):', err)
  }

  // CMM-41: SV-Mitteilung — der SV soll im Portal sehen, dass ein neuer
  // Slot-Vorschlag eingetroffen ist. Non-critical: Mitteilungs-Fehler darf
  // den Slot-Pick nicht abbrechen.
  try {
    const { data: lead } = fall.lead_id != null
      ? await db.from('leads').select('vorname, nachname').eq('id', fall.lead_id as string).single()
      : { data: null }
    const { createGutachterMitteilung } = await import('@/lib/mitteilungen')
    const datum = start.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const uhrzeit = start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    const kundeName = lead
      ? `${(lead.vorname as string | null) ?? ''} ${(lead.nachname as string | null) ?? ''}`.trim() || 'Kunde'
      : 'Kunde'
    await createGutachterMitteilung(fall.sv_id as string, 're_termin_kundenwahl', fall.id as string, {
      kunde_name: kundeName,
      datum,
      uhrzeit,
    })
  } catch (err) {
    console.error('[CMM-41] SV-Mitteilung fehlgeschlagen (non-critical):', err)
  }

  revalidatePath(`/faelle/${fall.id}`)
  revalidatePath(`/gutachter/fall/${fall.id}`)

  return { ok: true }
}
