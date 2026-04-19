'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { haversineMeters } from '@/lib/gps/geofence'
import { calculateEtaMinutes } from '@/lib/eta/calculate-eta'
import { sendCommunication } from '@/lib/communications/send'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { emitEvent } from '@/lib/notifications/emit'

// KFZ-200: Server Actions für SV-Navigation, Vor-Ort-Modus, Begutachtung.

// ─── startNavigation ─────────────────────────────────────────────────────────

export async function startNavigation(
  terminId: string
): Promise<{ success?: boolean; error?: string; redirectPath?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'unauthorized' }

  const sv = await getGutachterForUser<{ id: string; profile_id: string }>(
    supabase, user.id, 'id, profile_id'
  )
  if (!sv) return { error: 'no_sv' }

  const db = createAdminClient()

  const { data: termin, error: tErr } = await db
    .from('gutachter_termine')
    .select('id, fall_id, sv_id, start_zeit, navigation_started_at')
    .eq('id', terminId)
    .eq('typ', 'sv_begutachtung')
    .eq('sv_id', sv.id)
    .single()

  if (tErr || !termin) return { error: 'Termin nicht gefunden' }

  const now = new Date().toISOString()

  const { error: updErr } = await db
    .from('gutachter_termine')
    .update({
      navigation_started_at: now,
      sv_unterwegs_seit: now,
    })
    .eq('id', terminId)

  if (updErr) return { error: updErr.message }

  // KFZ-202: Fall-Status auf begutachtung-laeuft setzen
  try {
    await transitionFallStatus(termin.fall_id, 'begutachtung-laeuft')
  } catch { /* Transition evtl. nicht erlaubt wenn Status schon weiter */ }

  // WhatsApp an Kunden (non-critical)
  try {
    const { data: fall } = await db.from('faelle').select('lead_id').eq('id', termin.fall_id).single()
    if (fall?.lead_id) {
      const { data: lead } = await db.from('leads').select('vorname, telefon').eq('id', fall.lead_id).single()
      if (lead?.telefon) {
        await sendCommunication('sv_losgefahren', {
          telefon: lead.telefon,
          vorname: lead.vorname ?? 'Kunde',
          '1': lead.vorname ?? 'Kunde',
          '2': '—',
          '3': '—',
          '4': '—',
          '5': '—',
        }).catch(() => {})
      }
    }
  } catch { /* non-critical */ }

  // AAR-501 N6: Event emittieren (SV ist unterwegs, ETA noch unbekannt)
  try {
    await emitEvent(
      'termin.sv_unterwegs',
      { fallId: termin.fall_id, terminId: termin.id, etaMinuten: 0 },
      { fallId: termin.fall_id, triggeredBy: user.id },
    )
  } catch (err) {
    console.error('[AAR-501] emitEvent termin.sv_unterwegs failed:', err)
  }

  return {
    success: true,
    redirectPath: `/gutachter/termine/${terminId}/navigation`,
  }
}

// ─── updateLivePosition ───────────────────────────────────────────────────────

export async function updateLivePosition(
  terminId: string,
  lat: number,
  lng: number,
): Promise<{ success?: boolean; error?: string; distanceMeters?: number; arrived?: boolean }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'unauthorized' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { error: 'no_sv' }

  const db = createAdminClient()

  // Termin + Zieladresse laden
  const { data: termin, error: tErr } = await db
    .from('gutachter_termine')
    .select('id, fall_id, sv_id, sv_angekommen_am, reminder_15min_sent_at, reminder_5min_sent_at, start_zeit')
    .eq('id', terminId)
    .eq('typ', 'sv_begutachtung')
    .eq('sv_id', sv.id)
    .single()

  if (tErr || !termin) return { error: 'Termin nicht gefunden' }
  if (termin.sv_angekommen_am) return { success: true, arrived: true }

  // Fall-Adresse + Koordinaten laden
  const { data: fall } = await db
    .from('faelle')
    .select('id, lead_id, schadens_adresse, schadens_plz, schadens_ort, besichtigungsort_lat, besichtigungsort_lng')
    .eq('id', termin.fall_id)
    .single()

  let distanceMeters: number | null = null
  let etaMinutes: number | null = null

  // Distanz berechnen wenn Zielkoordinaten vorhanden
  if (fall?.besichtigungsort_lat && fall?.besichtigungsort_lng) {
    distanceMeters = Math.round(
      haversineMeters(lat, lng, Number(fall.besichtigungsort_lat), Number(fall.besichtigungsort_lng))
    )
  }

  // ETA berechnen
  const adresse = [fall?.schadens_adresse, fall?.schadens_plz, fall?.schadens_ort].filter(Boolean).join(', ')
  if (adresse) {
    etaMinutes = await calculateEtaMinutes({ lat, lng }, adresse).catch(() => null)
  }

  const now = new Date().toISOString()

  // Live-Position aktualisieren (History-Row, konsistent mit /api/sv/position-batch)
  const { error: posErr } = await db
    .from('sv_live_position')
    .insert({
      sv_id: sv.id,
      lat,
      lng,
      accuracy_m: 0,
      heading: null,
      speed_kmh: null,
      updated_at: now,
      ...(distanceMeters !== null ? { distance_to_target_meters: distanceMeters } : {}),
    })

  if (posErr) console.error('[updateLivePosition] insert error:', posErr.message)

  // Termin-ETA updaten
  if (etaMinutes !== null) {
    await db.from('gutachter_termine').update({
      sv_eta_minuten: etaMinutes,
      sv_eta_letzte_berechnung: now,
    }).eq('id', terminId)
  }

  // ETA-Reminder: 15 Minuten
  if (etaMinutes !== null && etaMinutes <= 15 && !termin.reminder_15min_sent_at) {
    await db.from('gutachter_termine').update({ reminder_15min_sent_at: now }).eq('id', terminId)
    try {
      if (fall?.lead_id) {
        const { data: lead } = await db.from('leads').select('vorname, telefon').eq('id', fall.lead_id).single()
        const { data: svProfile } = await db.from('sachverstaendige').select('profile_id').eq('id', sv.id).single()
        let svName = 'Gutachter'
        if (svProfile?.profile_id) {
          const { data: p } = await db.from('profiles').select('vorname, nachname').eq('id', svProfile.profile_id).single()
          if (p) svName = [p.vorname, p.nachname].filter(Boolean).join(' ')
        }
        if (lead?.telefon) {
          await sendCommunication('sv_fast_da', {
            telefon: lead.telefon,
            vorname: lead.vorname ?? 'Kunde',
            '1': lead.vorname ?? 'Kunde',
            '2': svName,
          }).catch(() => {})
        }
      }
    } catch { /* non-critical */ }
  }

  // ETA-Reminder: 5 Minuten
  if (etaMinutes !== null && etaMinutes <= 5 && !termin.reminder_5min_sent_at) {
    await db.from('gutachter_termine').update({ reminder_5min_sent_at: now }).eq('id', terminId)
  }

  // Ankunft: < 50 Meter
  if (distanceMeters !== null && distanceMeters < 50) {
    await arrived(terminId)
    return { success: true, distanceMeters, arrived: true }
  }

  return { success: true, distanceMeters: distanceMeters ?? undefined }
}

// ─── arrived ─────────────────────────────────────────────────────────────────

export async function arrived(terminId: string): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'unauthorized' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { error: 'no_sv' }

  const db = createAdminClient()

  const { data: termin, error: tErr } = await db
    .from('gutachter_termine')
    .select('id, fall_id, sv_id, sv_angekommen_am')
    .eq('id', terminId)
    .eq('typ', 'sv_begutachtung')
    .eq('sv_id', sv.id)
    .single()

  if (tErr || !termin) return { error: 'Termin nicht gefunden' }
  if (termin.sv_angekommen_am) return { success: true } // already arrived

  const now = new Date().toISOString()

  await db.from('gutachter_termine').update({ sv_angekommen_am: now }).eq('id', terminId)

  // WhatsApp T23 (sv_angekommen): SV angekommen
  try {
    const { data: fall } = await db.from('faelle').select('lead_id').eq('id', termin.fall_id).single()
    const { data: svRec } = await db.from('sachverstaendige').select('profile_id').eq('id', sv.id).single()
    let svName = 'Gutachter'
    if (svRec?.profile_id) {
      const { data: p } = await db.from('profiles').select('vorname, nachname').eq('id', svRec.profile_id).single()
      if (p) svName = [p.vorname, p.nachname].filter(Boolean).join(' ')
    }
    if (fall?.lead_id) {
      const { data: lead } = await db.from('leads').select('vorname, telefon').eq('id', fall.lead_id).single()
      if (lead?.telefon) {
        await sendCommunication('sv_angekommen', {
          telefon: lead.telefon,
          vorname: lead.vorname ?? 'Kunde',
          '1': lead.vorname ?? 'Kunde',
          '2': svName,
        }).catch(() => {})
      }
    }

    // Timeline
    if (fall) {
      await db.from('timeline').insert({
        fall_id: termin.fall_id,
        typ: 'termin',
        titel: `${svName} ist angekommen`,
        beschreibung: `SV ${svName} hat den Besichtigungsort erreicht. Vor-Ort-Modus aktiv.`,
      })
    }

    // AAR-89: SV-03 Task triggern (Vor-Ort-Dokumentation)
    if (svRec?.profile_id) {
      try {
        const { triggerSV03 } = await import('@/lib/gutachterTasking')
        await triggerSV03(termin.fall_id, svRec.profile_id)
      } catch (err) { console.error('[AAR-89] triggerSV03:', err) }
    }
  } catch { /* non-critical */ }

  // AAR-501 N6: Event emittieren
  try {
    await emitEvent(
      'termin.sv_angekommen',
      { fallId: termin.fall_id, terminId: termin.id },
      { fallId: termin.fall_id, triggeredBy: user.id },
    )
  } catch (err) {
    console.error('[AAR-501] emitEvent termin.sv_angekommen failed:', err)
  }

  return { success: true }
}

// ─── completeBegutachtung ─────────────────────────────────────────────────────

export async function completeBegutachtung(
  terminId: string,
  notizen?: string,
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'unauthorized' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { error: 'no_sv' }

  const db = createAdminClient()

  const { data: termin, error: tErr } = await db
    .from('gutachter_termine')
    .select('id, fall_id, sv_id, durchgefuehrt_am')
    .eq('id', terminId)
    .eq('typ', 'sv_begutachtung')
    .eq('sv_id', sv.id)
    .single()

  if (tErr || !termin) return { error: 'Termin nicht gefunden' }
  if (termin.durchgefuehrt_am) return { success: true } // already completed

  const now = new Date().toISOString()

  // Status auf durchgefuehrt setzen
  const { error: updErr } = await db
    .from('gutachter_termine')
    .update({
      status: 'durchgefuehrt',
      durchgefuehrt_am: now,
    })
    .eq('id', terminId)

  if (updErr) return { error: updErr.message }

  // KFZ-202: Fall-Status auf gutachten-eingegangen setzen
  try {
    await transitionFallStatus(termin.fall_id, 'gutachten-eingegangen')
  } catch { /* Transition evtl. nicht erlaubt wenn Status schon weiter */ }

  // Notizen speichern (non-critical)
  if (notizen) {
    await db.from('gutachter_termine').update({ sv_notizen: notizen } as Record<string, unknown>).eq('id', terminId).then(() => {})
  }

  // Discrepancy-Flags prüfen
  try {
    const { data: docs } = await db
      .from('fall_dokumente')
      .select('id, discrepancy_flag, dokument_typ')
      .eq('fall_id', termin.fall_id)
      .eq('discrepancy_flag', true)

    const discrepancyCount = docs?.length ?? 0

    // WhatsApp T8: Begutachtung fertig → gutachten_fertig (KFZ-201: sv_begutachtung_fertig konsolidiert)
    const { data: fall } = await db.from('faelle').select('lead_id').eq('id', termin.fall_id).single()
    if (fall?.lead_id) {
      const { data: lead } = await db.from('leads').select('vorname, telefon').eq('id', fall.lead_id).single()
      if (lead?.telefon) {
        await sendCommunication('gutachten_fertig', {
          telefon: lead.telefon,
          vorname: lead.vorname ?? 'Kunde',
          '1': lead.vorname ?? 'Kunde',
        }).catch(() => {})
      }
    }

    // Timeline
    const discrepancyNote = discrepancyCount > 0
      ? ` HINWEIS: ${discrepancyCount} Dokument(e) mit Abweichungen (discrepancy_flag=true).`
      : ''

    await db.from('timeline').insert({
      fall_id: termin.fall_id,
      typ: 'termin',
      titel: 'Begutachtung abgeschlossen',
      beschreibung: `SV hat die Begutachtung als abgeschlossen markiert.${discrepancyNote}`,
    })
  } catch { /* non-critical */ }

  // AAR-501 N6: Event emittieren
  try {
    await emitEvent(
      'termin.sv_abgeschlossen',
      { fallId: termin.fall_id, terminId: termin.id },
      { fallId: termin.fall_id, triggeredBy: user.id },
    )
  } catch (err) {
    console.error('[AAR-501] emitEvent termin.sv_abgeschlossen failed:', err)
  }

  return { success: true }
}
