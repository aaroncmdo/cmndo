'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { startOutboundCall, findFreeRelaySeat } from './client'

/**
 * KFZ-144: Bridge-Call starten (Kunde↔SV via Relay-Seat).
 */
export async function startBridgeCall({
  initiator,
  fallId,
}: {
  initiator: 'kunde' | 'sv'
  fallId: string
}): Promise<{ callId: string; status: string } | { error: string }> {
  // Auth
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' }

  const db = createAdminClient()

  // Fall + Kunden/SV-Daten laden
  const { data: fall } = await db.from('faelle').select('id, kunde_id, sv_id, lead_id, fall_nummer').eq('id', fallId).single()
  if (!fall) return { error: 'Fall nicht gefunden' }

  // Authorisierung
  if (initiator === 'kunde') {
    if (fall.kunde_id !== user.id) {
      // Fallback: Lead-Email check
      if (fall.lead_id) {
        const { data: lead } = await db.from('leads').select('email').eq('id', fall.lead_id).single()
        if (lead?.email !== user.email) return { error: 'Kein Zugriff' }
      } else {
        return { error: 'Kein Zugriff' }
      }
    }
  } else {
    // SV muss dem Fall zugewiesen sein
    const { data: sv } = await db.from('sachverstaendige').select('id').or(`profile_id.eq.${user.id},user_id.eq.${user.id}`).single()
    if (!sv || fall.sv_id !== sv.id) return { error: 'Kein Zugriff' }
  }

  // Telefonnummern laden
  let kundeNummer: string | null = null
  let svNummer: string | null = null

  if (fall.kunde_id) {
    const { data: kp } = await db.from('profiles').select('telefon').eq('id', fall.kunde_id).single()
    kundeNummer = kp?.telefon ?? null
  }
  if (!kundeNummer && fall.lead_id) {
    const { data: lead } = await db.from('leads').select('telefon').eq('id', fall.lead_id).single()
    kundeNummer = lead?.telefon ?? null
  }

  if (fall.sv_id) {
    const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', fall.sv_id).single()
    if (sv?.profile_id) {
      const { data: sp } = await db.from('profiles').select('telefon').eq('id', sv.profile_id).single()
      svNummer = sp?.telefon ?? null
    }
  }

  if (!kundeNummer) return { error: 'Keine Telefonnummer für den Kunden hinterlegt' }
  if (!svNummer) return { error: 'Keine Telefonnummer für den Sachverständigen hinterlegt' }

  // Relay-Seat finden
  const seat = await findFreeRelaySeat()
  if (!seat) return { error: 'Alle Vermittlungs-Leitungen sind belegt. Bitte in 2 Minuten erneut versuchen.' }

  // Leg A/B bestimmen
  const legA = initiator === 'kunde' ? kundeNummer : svNummer
  const legB = initiator === 'kunde' ? svNummer : kundeNummer

  // Call in DB anlegen
  const bridgeData = {
    typ: initiator === 'kunde' ? 'kunde_zu_sv' : 'sv_zu_kunde',
    relay_seat_id: seat.id,
    leg_a_nummer: legA,
    leg_b_nummer: legB,
    leg_a_status: 'klingelt',
    leg_b_status: 'wartet',
    verbunden_um: null,
    getrennt_um: null,
    getrennt_grund: null,
  }

  const tempAircallId = `bridge_${Date.now()}`
  const { data: call, error: insertErr } = await db.from('calls').insert({
    aircall_call_id: tempAircallId,
    fall_id: fallId,
    lead_id: fall.lead_id,
    initiator_user_id: user.id,
    richtung: 'bridge',
    status: 'initiiert',
    von_nummer: legA,
    zu_nummer: legB,
    gestartet_am: new Date().toISOString(),
    bridge: bridgeData,
  }).select('id').single()

  if (insertErr) {
    // Seat freigeben bei Fehler
    const { freeRelaySeat } = await import('./client')
    await freeRelaySeat(seat.id)
    return { error: insertErr.message }
  }

  // Seat mit Call-ID verknüpfen
  await db.from('aircall_relay_seats').update({ belegt_call_id: call!.id }).eq('id', seat.id)

  // Aircall: Initiator anrufen via Relay-Seat
  try {
    const result = await startOutboundCall({ userId: seat.aircallUserId, toNumber: legA, fromNumberId: seat.aircallNumberId })
    await db.from('calls').update({ aircall_call_id: String(result.id) }).eq('id', call!.id)
  } catch (err) {
    console.error('[KFZ-144] Bridge startOutboundCall fehlgeschlagen:', err)
    await db.from('calls').update({ status: 'failed' }).eq('id', call!.id)
    const { freeRelaySeat } = await import('./client')
    await freeRelaySeat(seat.id)
    return { error: 'Anruf konnte nicht gestartet werden' }
  }

  return { callId: call!.id, status: 'gestartet' }
}
