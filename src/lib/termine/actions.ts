'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { haversineMeters } from '@/lib/gps/geofence'
import { calculateEtaMinutes } from '@/lib/eta/calculate-eta'
import { sendCommunication } from '@/lib/communications/send'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { emitEvent } from '@/lib/notifications/emit'

// Termin-Mutationen werden in 4 Portalen angezeigt (SV/Kunde/Admin/Dispatch).
// Helper revalidiert alle relevanten Routen.
function revalidateTerminRoutes(fallId: string) {
  revalidatePath('/gutachter/heute')
  revalidatePath('/gutachter/feldmodus')
  revalidatePath(`/gutachter/fall/${fallId}`)
  revalidatePath(`/kunde/faelle/${fallId}`)
  revalidatePath(`/admin/faelle/${fallId}`)
  revalidatePath(`/faelle/${fallId}`)
}

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

  revalidateTerminRoutes(termin.fall_id)

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
  // CMM-44 SP-A2 (Cluster 1): schadenort_* aus claims (SSoT) via claim_id-Embed.
  const { data: fall } = await db
    .from('faelle')
    .select('id, lead_id, besichtigungsort_lat, besichtigungsort_lng, claims:claim_id(schadenort_adresse, schadenort_plz, schadenort_ort)')
    .eq('id', termin.fall_id)
    .single()
  const fallClaim = Array.isArray(fall?.claims) ? fall.claims[0] : fall?.claims

  let distanceMeters: number | null = null
  let etaMinutes: number | null = null

  // Distanz berechnen wenn Zielkoordinaten vorhanden
  if (fall?.besichtigungsort_lat && fall?.besichtigungsort_lng) {
    distanceMeters = Math.round(
      haversineMeters(lat, lng, Number(fall.besichtigungsort_lat), Number(fall.besichtigungsort_lng))
    )
  }

  // ETA berechnen
  const adresse = [fallClaim?.schadenort_adresse, fallClaim?.schadenort_plz, fallClaim?.schadenort_ort].filter(Boolean).join(', ')
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

  // Bei ETA-Reminder-Trigger revalidieren — sonst sieht Kunde den
  // „SV ist fast da"-Banner nicht. High-Frequency-Polls ohne Reminder
  // werden NICHT revalidiert (würde Cache thrashen).
  if (
    etaMinutes !== null &&
    ((etaMinutes <= 15 && !termin.reminder_15min_sent_at) ||
      (etaMinutes <= 5 && !termin.reminder_5min_sent_at))
  ) {
    revalidateTerminRoutes(termin.fall_id)
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

    // SV-03 (Vor-Ort Dokumentation) deaktiviert — Task wird erst wieder
    // aktiviert wenn die Vor-Ort-Erfassung in der App produktionsreif ist.
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

  revalidateTerminRoutes(termin.fall_id)

  return { success: true }
}

// ─── updateAuftragLive (CMM-36) ───────────────────────────────────────────────
//
// Vom SV-Client gerufen während der Anfahrt — schreibt sv_unterwegs_seit
// (einmalig) + sv_eta_minuten + sv_eta_letzte_berechnung. Damit sieht der
// Kunde den Live-Banner ohne dass der SV manuell „losgefahren" drücken muss.

export async function updateAuftragLive(
  terminId: string,
  etaMinuten: number | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'unauthorized' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { ok: false, error: 'no_sv' }

  const db = createAdminClient()

  const { data: termin } = await db
    .from('gutachter_termine')
    .select('id, sv_id, fall_id, sv_unterwegs_seit, sv_angekommen_am')
    .eq('id', terminId)
    .eq('sv_id', sv.id)
    .single()

  if (!termin) return { ok: false, error: 'Termin nicht gefunden' }
  if (termin.sv_angekommen_am) return { ok: true } // bereits angekommen, nichts mehr zu tun

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    sv_eta_letzte_berechnung: now,
  }
  if (etaMinuten != null) patch.sv_eta_minuten = etaMinuten
  const isFirstUnterwegs = !termin.sv_unterwegs_seit
  if (isFirstUnterwegs) patch.sv_unterwegs_seit = now

  const { error } = await db.from('gutachter_termine').update(patch).eq('id', terminId)
  if (error) return { ok: false, error: error.message }

  // Nur den einmaligen Übergang „SV losgefahren" revalidieren — high-frequency
  // ETA-Polls würden sonst den Cache kontinuierlich invalidieren.
  if (isFirstUnterwegs) revalidateTerminRoutes(termin.fall_id)

  return { ok: true }
}

// ─── markTerminDurchgefuehrt (CMM-32) ─────────────────────────────────────────
//
// Geofence-Out-Detection vom GPS-Hook: SV ist >2 km vom Ziel weg → Termin
// gilt als durchgeführt. Idempotent.

export async function markTerminDurchgefuehrt(
  terminId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'unauthorized' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { ok: false, error: 'no_sv' }

  const db = createAdminClient()
  const { data: termin } = await db
    .from('gutachter_termine')
    .select('id, sv_id, fall_id, sv_angekommen_am, durchgefuehrt_am')
    .eq('id', terminId)
    .eq('sv_id', sv.id)
    .single()

  if (!termin) return { ok: false, error: 'Termin nicht gefunden' }
  if (termin.durchgefuehrt_am) return { ok: true }
  if (!termin.sv_angekommen_am) return { ok: false, error: 'SV war noch nicht angekommen' }

  await db
    .from('gutachter_termine')
    .update({ durchgefuehrt_am: new Date().toISOString() })
    .eq('id', terminId)

  revalidateTerminRoutes(termin.fall_id)
  return { ok: true }
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
  // CMM-59: Spalte heisst notizen_vor_ort — der fruehere Write auf sv_notizen
  // lief gegen eine nicht-existente Spalte und schlug (fire-and-forget) still
  // fehl. Der as-Record-Cast war nur da, um den Type-Fehler zu verstecken.
  if (notizen) {
    await db.from('gutachter_termine').update({ notizen_vor_ort: notizen }).eq('id', terminId).then(() => {})
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

  revalidateTerminRoutes(termin.fall_id)

  return { success: true }
}
