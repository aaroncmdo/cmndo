'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateTrackingToken } from './generate-tracking-token'
import { calculateEtaMinutes } from '@/lib/eta/calculate-eta'
import { sendCommunication } from '@/lib/communications/send'

// KFZ-179: Server Action — SV markiert "Losfahren" fuer einen Termin.
// Generiert Tracking-Token, berechnet ETA, sendet WhatsApp an Kunden.

export async function triggerSvLosgefahren(
  terminId: string,
): Promise<{ success?: boolean; error?: string; token?: string; etaMinutes?: number }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'unauthorized' }

  const db = createAdminClient()

  // Termin laden
  const { data: termin } = await db
    .from('gutachter_termine')
    .select('id, fall_id, claim_id, lead_id, assignee_id, assignee_typ, start_zeit, losgefahren_am, kunden_tracking_token')
    .eq('id', terminId)
    .single()
  if (!termin) return { error: 'Termin nicht gefunden' }
  if (termin.losgefahren_am) return { error: 'Bereits als losgefahren markiert' }

  // SV-Check
  const { data: sv } = await db
    .from('sachverstaendige')
    .select('id, profile_id')
    .eq('id', termin.assignee_id)
    .single()
  if (!sv || sv.profile_id !== user.id) return { error: 'Nicht Ihr Termin' }

  // SV-Name
  const { data: svProfile } = await db.from('profiles').select('vorname, nachname').eq('id', sv.profile_id).single()
  const svName = svProfile ? [svProfile.vorname, svProfile.nachname].filter(Boolean).join(' ') : 'Gutachter'

  // Fall + Kunden-Daten — CMM-49: schadenort + lead_id faelle-frei direkt aus claims (via termin.claim_id).
  const { data: fallClaim } = termin.claim_id
    ? await db
        .from('claims')
        .select('lead_id, schadenort_adresse, schadenort_plz, schadenort_ort')
        .eq('id', termin.claim_id)
        .maybeSingle()
    : { data: null }
  const leadId = (termin.lead_id as string | null) ?? (fallClaim?.lead_id as string | null) ?? null

  let kundeVorname = 'Kunde'
  let kundeTelefon: string | null = null
  if (leadId) {
    const { data: lead } = await db.from('leads').select('vorname, telefon').eq('id', leadId).single()
    if (lead) { kundeVorname = lead.vorname ?? 'Kunde'; kundeTelefon = lead.telefon }
  }

  // Token generieren
  const token = termin.kunden_tracking_token ?? generateTrackingToken()

  // ETA berechnen
  const { data: lastPos } = await db
    .from('sv_live_position')
    .select('lat, lng')
    .eq('sv_id', termin.assignee_id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const adresse = [fallClaim?.schadenort_adresse, fallClaim?.schadenort_plz, fallClaim?.schadenort_ort].filter(Boolean).join(', ')
  const etaMinutes = lastPos
    ? await calculateEtaMinutes({ lat: Number(lastPos.lat), lng: Number(lastPos.lng) }, adresse || 'Deutschland')
    : 30

  // DB Update — ABBRUCH VOR dem Versand, denn dieser eine Write traegt beides: den
  // Tracking-Token (die WhatsApp unten verlinkt /kunde/termin/<token> — ohne DB-Eintrag
  // fuehrt der Link ins Leere) UND die Dedup-Marker (ohne sie kann der SV erneut auf
  // "Losfahren" druecken und der Kunde bekommt die Nachricht ein zweites Mal).
  const { error: updateFehler } = await db.from('gutachter_termine').update({
    losgefahren_am: new Date().toISOString(),
    kunden_tracking_token: token,
    notification_losgefahren_gesendet_am: new Date().toISOString(),
  }).eq('id', terminId)
  if (updateFehler) {
    console.error(`[KFZ-179] Losgefahren-Update fehlgeschlagen (${terminId}):`, updateFehler.message)
    return { error: 'Konnte den Termin nicht aktualisieren — bitte erneut versuchen.' }
  }

  // WhatsApp an Kunden
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
  const trackingUrl = `${appUrl}/kunde/termin/${token}`

  if (kundeTelefon) {
    await sendCommunication('sv_losgefahren', {
      telefon: kundeTelefon,
      vorname: kundeVorname,
      '1': kundeVorname,
      '2': String(etaMinutes),
    }).catch((err: unknown) => console.error('[KFZ-179] WhatsApp losgefahren failed:', err))
  }

  // Timeline
  if (termin.fall_id) {
    try {
      await db.from('timeline').insert({
        fall_id: termin.fall_id,
        typ: 'termin',
        titel: `${svName} ist losgefahren`,
        beschreibung: `ETA ca. ${etaMinutes} Min. Kunde wurde via WhatsApp informiert. Tracking: ${trackingUrl}`,
      })
    } catch { /* fire-and-forget */ }
  }

  return { success: true, token, etaMinutes }
}
