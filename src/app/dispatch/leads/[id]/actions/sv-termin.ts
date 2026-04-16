'use server'

// AAR-143: SV-Termin-Reservierung extrahiert aus actions.ts.
// AAR-115: Pre-FlowLink SV-Auswahl + Termin (gutachter_termine.lead_id, kein
// fall_id). Wird nach SA-Unterschrift in flow/[token]/actions.ts via fall_id
// upgegradet.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SvSuggestion } from './types'

export async function listSvSuggestionsForLead(leadId: string): Promise<{
  success: boolean
  suggestions?: SvSuggestion[]
  error?: string
}> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: lead } = await supabase
    .from('leads')
    .select('unfallort_lat, unfallort_lng, kunde_lat, kunde_lng, wunschtermin')
    .eq('id', leadId)
    .single()

  if (!lead) return { success: false, error: 'Lead nicht gefunden' }

  const lat = (lead as { unfallort_lat: number | null; kunde_lat: number | null }).unfallort_lat
    ?? (lead as { kunde_lat: number | null }).kunde_lat
  const lng = (lead as { unfallort_lng: number | null; kunde_lng: number | null }).unfallort_lng
    ?? (lead as { kunde_lng: number | null }).kunde_lng

  if (lat == null || lng == null) {
    return { success: false, error: 'Lead hat keine Koordinaten (Unfallort/Kunden-Adresse fehlt)' }
  }

  // AAR-264: Wunschtermin durchreichen — findBestSV macht Kalender-Check + Score-Bonus
  const wunschterminIso = (lead as { wunschtermin: string | null }).wunschtermin
  const { findBestSV } = await import('@/lib/dispatch/findBestSV')
  const candidates = await findBestSV(
    { fallLat: Number(lat), fallLng: Number(lng), wunschterminIso },
    8,
  )

  return { success: true, suggestions: candidates as SvSuggestion[] }
}

export async function reserveSvTerminForLead(
  leadId: string,
  svId: string,
  startIso: string,
  durationMin: number = 120,
): Promise<{ success: boolean; terminId?: string; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const startDate = new Date(startIso)
  if (Number.isNaN(startDate.getTime())) return { success: false, error: 'Ungültiges Startdatum' }
  const endDate = new Date(startDate.getTime() + durationMin * 60_000)

  const { data: konflikt } = await supabase
    .from('gutachter_termine')
    .select('id')
    .eq('sv_id', svId)
    .not('status', 'eq', 'storniert')
    .lt('start_zeit', endDate.toISOString())
    .gt('end_zeit', startDate.toISOString())
    .limit(1)

  if (konflikt && konflikt.length > 0) {
    return { success: false, error: 'SV hat bereits einen Termin im gewählten Zeitfenster' }
  }

  // AAR-134: 'abgelehnt' auch stornieren — verhindert Doppel-Termine nach SV-Ablehnung.
  await supabase
    .from('gutachter_termine')
    .update({ status: 'storniert' })
    .eq('lead_id', leadId)
    .in('status', ['reserviert', 'gegenvorschlag', 'abgelehnt'])

  const { data: inserted, error } = await supabase
    .from('gutachter_termine')
    .insert({
      lead_id: leadId,
      sv_id: svId,
      start_zeit: startDate.toISOString(),
      end_zeit: endDate.toISOString(),
      status: 'reserviert',
      ablehnen_token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('id, ablehnen_token')
    .single()

  if (error || !inserted) return { success: false, error: error?.message ?? 'Insert fehlgeschlagen' }

  // SV-Benachrichtigung (non-blocking)
  try {
    const { data: leadData } = await supabase
      .from('leads')
      .select('vorname, nachname, schadentyp, kunde_plz')
      .eq('id', leadId)
      .single()
    const l = leadData as { vorname: string | null; nachname: string | null; schadentyp: string | null; kunde_plz: string | null } | null
    const { createGutachterMitteilung } = await import('@/lib/mitteilungen')
    await createGutachterMitteilung(svId, 'neuer_auftrag', null, {
      kunde_name: l ? `${l.vorname ?? ''} ${l.nachname ?? ''}`.trim() : '—',
      schadentyp: l?.schadentyp ?? undefined,
      adresse: l?.kunde_plz ?? undefined,
      datum: startDate.toLocaleDateString('de-DE'),
      uhrzeit: startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    })
  } catch (err) {
    console.warn('[reserveSvTerminForLead] Mitteilung fehlgeschlagen:', err)
  }

  // AAR-133: Email an SV (non-blocking)
  try {
    const { sendSvTerminBestaetigung } = await import('@/lib/email/google/flows')
    await sendSvTerminBestaetigung(svId, inserted.id)
  } catch (err) {
    console.warn('[reserveSvTerminForLead] Email fehlgeschlagen:', err)
  }

  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, terminId: inserted.id }
}

export async function cancelSvTerminForLead(
  leadId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // AAR-134: 'abgelehnt' mit drin — Dispatcher kann roten Card-Termin schließen.
  const { error } = await supabase
    .from('gutachter_termine')
    .update({ status: 'storniert' })
    .eq('lead_id', leadId)
    .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt', 'abgelehnt'])

  if (error) return { success: false, error: error.message }

  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true }
}

// AAR-134 Phase 8: Dispatcher akzeptiert einen vom SV vorgeschlagenen Slot.
export async function acceptGegenvorschlag(
  terminId: string,
  slotIndex: number,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: termin } = await supabase
    .from('gutachter_termine')
    .select('id, status, sv_vorgeschlagene_slots, lead_id, fall_id')
    .eq('id', terminId)
    .single()

  if (!termin) return { success: false, error: 'Termin nicht gefunden' }
  if (termin.status !== 'gegenvorschlag') {
    return { success: false, error: `Termin ist nicht im Status 'gegenvorschlag' (aktuell: ${termin.status})` }
  }

  const slots = termin.sv_vorgeschlagene_slots as { start: string; end: string }[] | null
  if (!Array.isArray(slots) || slotIndex < 0 || slotIndex >= slots.length) {
    return { success: false, error: 'Ungültiger Slot-Index' }
  }
  const slot = slots[slotIndex]
  if (!slot?.start || !slot?.end) {
    return { success: false, error: 'Slot ist leer' }
  }

  const { error } = await supabase
    .from('gutachter_termine')
    .update({
      status: 'bestaetigt',
      start_zeit: slot.start,
      end_zeit: slot.end,
      sv_vorgeschlagene_slots: null,
    })
    .eq('id', terminId)

  if (error) return { success: false, error: error.message }

  await supabase.from('timeline').insert({
    fall_id: termin.fall_id ?? null,
    lead_id: !termin.fall_id ? termin.lead_id : null,
    typ: 'termin',
    titel: 'Dispatcher hat SV-Gegenvorschlag akzeptiert',
    beschreibung: `Slot ${slotIndex + 1} angenommen: ${new Date(slot.start).toLocaleString('de-DE')}`,
    erstellt_von: user.id,
  }).then(() => {}, () => {})

  // AAR-202: T4 termin_bestaetigt an Kunden senden damit der die Bestätigung
  // per WA bekommt. Parallele Logik zu AAR-193 (T4 nach SA-Unterschrift).
  // Non-blocking — bei Fehler bleibt der Termin trotzdem bestätigt.
  try {
    const leadIdForContact = termin.lead_id
    if (leadIdForContact) {
      const { data: leadData } = await supabase
        .from('leads')
        .select('telefon, vorname')
        .eq('id', leadIdForContact)
        .single()
      if (leadData?.telefon) {
        const slotStart = new Date(slot.start)
        const datumUhrzeit = `${slotStart.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })} um ${slotStart.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`

        // SV-Name aus Termin nachladen (wenn Typ-Relations unterstützt)
        let svName = 'Ihrem Gutachter'
        const { data: svRow } = await supabase
          .from('gutachter_termine')
          .select('sachverstaendige(profiles(vorname, nachname))')
          .eq('id', terminId)
          .single()
        const svRel = (svRow as { sachverstaendige: unknown } | null)?.sachverstaendige
        const sv = (Array.isArray(svRel) ? svRel[0] : svRel) as { profiles: unknown } | null
        const profileRel = sv?.profiles
        const profile = (Array.isArray(profileRel) ? profileRel[0] : profileRel) as
          | { vorname: string | null; nachname: string | null }
          | null
        const zusammen = `${profile?.vorname ?? ''} ${profile?.nachname ?? ''}`.trim()
        if (zusammen) svName = zusammen

        const { sendCommunication } = await import('@/lib/communications/send')
        await sendCommunication('termin_bestaetigt', {
          telefon: leadData.telefon,
          '1': leadData.vorname ?? '',
          '2': svName,
          '3': datumUhrzeit,
        })
      }
    }
  } catch (t4Err) {
    console.warn('[AAR-202] T4 termin_bestaetigt nach Gegenvorschlag fehlgeschlagen:', t4Err)
  }

  if (termin.lead_id) revalidatePath(`/dispatch/leads/${termin.lead_id}`)
  return { success: true }
}

// AAR-195: Nächste freie Slots für einen SV — für den Slot-Picker in
// SvDispatchPanel. Findet bis zu `count` Slots á `slotDauerMin` Minuten
// die NICHT mit bestehenden reservierten/bestätigten Terminen kollidieren.
// Werktage Mo–Fr 09:00–16:00 Start-Zeit (letzter Slot startet spätestens
// 16:00 damit 2h-Termin bis 18:00 endet). Weekend bleibt ohne Slots.
export async function getNextFreeSlotsForSv(
  svId: string,
  count: number = 3,
  slotDauerMin: number = 120,
): Promise<{ success: boolean; slots?: { start: string; end: string }[]; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const now = new Date()
  const inZwoelfWochen = new Date(now.getTime() + 12 * 7 * 24 * 60 * 60 * 1000)

  const { data: bestehend } = await supabase
    .from('gutachter_termine')
    .select('start_zeit, end_zeit')
    .eq('sv_id', svId)
    .not('status', 'in', '("storniert","abgelehnt","abgesagt")')
    .gte('start_zeit', now.toISOString())
    .lte('start_zeit', inZwoelfWochen.toISOString())
    .order('start_zeit', { ascending: true })

  const freieSlots: { start: string; end: string }[] = []
  const kandidat = new Date(now)
  // Frühestens morgen 09:00 — heute anzurufen + morgen Termin ist normales
  // Dispatch-Tempo. Falls heute noch 14:00 ist, würde sonst „heute 16:00"
  // vorgeschlagen — der SV hat aber keine Vorlaufzeit.
  kandidat.setDate(kandidat.getDate() + 1)
  kandidat.setHours(9, 0, 0, 0)

  const maxIter = 12 * 7 * 24 // Sicherung gegen Endlos-Schleife
  let i = 0
  while (freieSlots.length < count && kandidat < inZwoelfWochen && i < maxIter) {
    i++
    const wochentag = kandidat.getDay()
    if (wochentag !== 0 && wochentag !== 6 && kandidat.getHours() < 16) {
      const slotEnd = new Date(kandidat.getTime() + slotDauerMin * 60_000)
      const konflikt = (bestehend ?? []).some((b) =>
        new Date(b.start_zeit) < slotEnd && new Date(b.end_zeit) > kandidat,
      )
      if (!konflikt) {
        freieSlots.push({ start: kandidat.toISOString(), end: slotEnd.toISOString() })
      }
    }
    // Nächster Kandidat: +1h. Nach 16:00 → nächster Tag 09:00.
    kandidat.setTime(kandidat.getTime() + 60 * 60_000)
    if (kandidat.getHours() >= 17) {
      kandidat.setDate(kandidat.getDate() + 1)
      kandidat.setHours(9, 0, 0, 0)
    }
  }

  return { success: true, slots: freieSlots }
}
