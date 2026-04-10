'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateTrackingToken } from './generate-tracking-token'
import { calculateEtaMinutes } from '@/lib/eta/calculate-eta'
import { sendWhatsAppTemplate } from '@/lib/whatsapp/send-template'

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
    .select('id, fall_id, sv_id, start_zeit, losgefahren_am, kunden_tracking_token')
    .eq('id', terminId)
    .single()
  if (!termin) return { error: 'Termin nicht gefunden' }
  if (termin.losgefahren_am) return { error: 'Bereits als losgefahren markiert' }

  // SV-Check
  const { data: sv } = await db
    .from('sachverstaendige')
    .select('id, profile_id')
    .eq('id', termin.sv_id)
    .single()
  if (!sv || sv.profile_id !== user.id) return { error: 'Nicht dein Termin' }

  // SV-Name
  const { data: svProfile } = await db.from('profiles').select('vorname, nachname').eq('id', sv.profile_id).single()
  const svName = svProfile ? [svProfile.vorname, svProfile.nachname].filter(Boolean).join(' ') : 'Gutachter'

  // Fall + Kunden-Daten
  const { data: fall } = await db
    .from('faelle')
    .select('id, lead_id, schadens_adresse, schadens_plz, schadens_ort')
    .eq('id', termin.fall_id)
    .single()

  let kundeVorname = 'Kunde'
  let kundeTelefon: string | null = null
  if (fall?.lead_id) {
    const { data: lead } = await db.from('leads').select('vorname, telefon').eq('id', fall.lead_id).single()
    if (lead) { kundeVorname = lead.vorname ?? 'Kunde'; kundeTelefon = lead.telefon }
  }

  // Token generieren
  const token = termin.kunden_tracking_token ?? generateTrackingToken()

  // ETA berechnen
  const { data: lastPos } = await db
    .from('sv_live_position')
    .select('lat, lng')
    .eq('gutachter_id', termin.sv_id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const adresse = [fall?.schadens_adresse, fall?.schadens_plz, fall?.schadens_ort].filter(Boolean).join(', ')
  const etaMinutes = lastPos
    ? await calculateEtaMinutes({ lat: Number(lastPos.lat), lng: Number(lastPos.lng) }, adresse || 'Deutschland')
    : 30

  // DB Update
  await db.from('gutachter_termine').update({
    losgefahren_am: new Date().toISOString(),
    kunden_tracking_token: token,
    notification_losgefahren_gesendet_am: new Date().toISOString(),
  }).eq('id', terminId)

  // WhatsApp an Kunden
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cmndo.vercel.app'
  const trackingUrl = `${appUrl}/kunde/termin/${token}`

  if (kundeTelefon) {
    await sendWhatsAppTemplate(kundeTelefon, 'sv_losgefahren', {
      '1': kundeVorname,
      '2': String(etaMinutes),
    }).catch(err => console.error('[KFZ-179] WhatsApp losgefahren failed:', err))
  }

  // Timeline
  if (fall) {
    await db.from('timeline').insert({
      fall_id: fall.id,
      typ: 'termin',
      titel: `${svName} ist losgefahren`,
      beschreibung: `ETA ca. ${etaMinutes} Min. Kunde wurde via WhatsApp informiert. Tracking: ${trackingUrl}`,
    }).catch(() => {})
  }

  return { success: true, token, etaMinutes }
}
