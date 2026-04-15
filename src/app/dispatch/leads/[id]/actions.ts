'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function setLeadPhase(leadId: string, phase: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('leads')
    .update({
      qualifizierungs_phase: phase,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) throw new Error(error.message)
  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/leads')
  revalidatePath('/dispatch/dashboard')
}

// AAR-118: setLeadRueckruf entfernt (nur noch über RueckrufSection via saveRueckruf)

export async function disqualifiziereLead(leadId: string, grund: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('leads')
    .update({
      qualifizierungs_phase: 'disqualifiziert',
      status: 'disqualifiziert',
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) throw new Error(error.message)

  // Timeline/Notiz
  await supabase.from('timeline').insert({
    lead_id: leadId,
    typ: 'system',
    titel: 'Lead disqualifiziert',
    beschreibung: grund || 'Vom Dispatcher disqualifiziert',
    erstellt_von: user.id,
  }).then(() => {})

  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/leads')
}

export async function setServiceTyp(leadId: string, serviceTyp: 'komplett' | 'nur_gutachter') {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('leads')
    .update({ service_typ: serviceTyp, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  if (error) throw new Error(error.message)
  revalidatePath(`/dispatch/leads/${leadId}`)
}

// AAR-81+83+114: Schadentyp speichern + AAR-83 Parkplatz-Kamera-Check
export async function saveSchadentyp(
  leadId: string,
  schadentyp: 'spurwechsel' | 'auffahrunfall' | 'vorfahrtsverletzung' | 'parkplatz' | 'sonstiges',
  freitext?: string | null,
  parkplatzKamera?: boolean | null,
): Promise<{ success: boolean; disqualifiziert?: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  let disqualifiziert = false
  const updates: Record<string, unknown> = {
    schadentyp,
    schadentyp_freitext: schadentyp === 'sonstiges' ? freitext ?? null : null,
    updated_at: new Date().toISOString(),
  }
  if (schadentyp === 'parkplatz' && parkplatzKamera !== undefined) {
    updates.parkplatz_kamera = parkplatzKamera
    if (parkplatzKamera === false) {
      const { data: lead } = await supabase.from('leads').select('gegner_kennzeichen').eq('id', leadId).maybeSingle()
      if (!lead?.gegner_kennzeichen?.trim()) {
        updates.qualifizierungs_phase = 'disqualifiziert'
        updates.disqualifikations_grund = 'Parkplatz ohne Kennzeichen + keine Überwachungskamera'
        updates.disqualifikations_grund_key = 'parkplatz_ohne_kamera'
        disqualifiziert = true
      }
    }
  }

  const { error } = await supabase.from('leads').update(updates).eq('id', leadId)
  if (error) return { success: false, error: error.message }
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, disqualifiziert }
}

// AAR-114: Gespraechsleitfaden-Timer (Notion-Spec §1)
export async function startGespraech(leadId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('leads')
    .update({
      gespraech_gestartet_am: new Date().toISOString(),
      gespraech_beendet_am: null,
      gespraech_dauer_sekunden: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) return { success: false, error: error.message }
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true }
}

export async function endeGespraech(leadId: string): Promise<{ success: boolean; dauerSekunden?: number; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: lead } = await supabase
    .from('leads')
    .select('gespraech_gestartet_am')
    .eq('id', leadId)
    .single()

  if (!lead?.gespraech_gestartet_am) {
    return { success: false, error: 'Gespräch wurde nicht gestartet' }
  }

  const beendetAm = new Date()
  const dauerSekunden = Math.max(
    0,
    Math.floor((beendetAm.getTime() - new Date(lead.gespraech_gestartet_am).getTime()) / 1000),
  )

  const { error } = await supabase
    .from('leads')
    .update({
      gespraech_beendet_am: beendetAm.toISOString(),
      gespraech_dauer_sekunden: dauerSekunden,
      updated_at: beendetAm.toISOString(),
    })
    .eq('id', leadId)

  if (error) return { success: false, error: error.message }
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, dauerSekunden }
}

// AAR-98: Rueckruf speichern + als erledigt markieren (migriert von admin/dispatch/lead)
export async function saveRueckruf(leadId: string, datumIso: string | null, notiz: string | null) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('leads')
    .update({
      rueckruf_datum: datumIso,
      rueckruf_notiz: notiz,
      rueckruf_erledigt: false,
      qualifizierungs_phase: datumIso ? 'rueckruf' : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) throw new Error(error.message)
  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/rueckrufe')
}

export async function markRueckrufErledigt(leadId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('leads')
    .update({
      rueckruf_erledigt: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) throw new Error(error.message)
  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/rueckrufe')
}

// AAR-84: Cardentity-Anreicherung
export async function enrichLeadCardentity(leadId: string): Promise<{ success: boolean; updatedFields?: string[]; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { enrichLeadByFin } = await import('@/lib/cardentity/enrich-fahrzeug')
  const result = await enrichLeadByFin(leadId)
  if (!result.success) return { success: false, error: result.error }
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, updatedFields: result.updatedFields }
}

// AAR-80: Schritt 0 Hard Gate — Q1/Q2/Q3
// AAR-124: Unfallort (Google Places) + Polizei-vor-Ort ergänzt
export type UnfallortKategorie =
  | 'parkplatz'
  | 'strasse'
  | 'autobahn'
  | 'kreuzung'
  | 'tankstelle'
  | 'innenstadt'
  | 'sonstiges'

export type HardGateData = {
  unfallhergang?: string
  schuldfrage?: 'gegner' | 'unklar' | 'eigenverantwortung'
  aufklaerung_teilschuld_bestaetigt?: boolean
  schaden_sichtbar?: boolean
  personenschaden_flag?: boolean
  mietwagen_flag?: boolean
  nutzungsausfall?: boolean
  hat_haftpflicht?: boolean
  // AAR-124: Unfallort
  unfallort?: string
  unfallort_kategorie?: UnfallortKategorie
  unfallort_lat?: number | null
  unfallort_lng?: number | null
  // AAR-124: Polizei-vor-Ort
  polizei_vor_ort?: boolean
  polizei_aktenzeichen?: string | null
  polizeibericht_pflicht?: boolean
}

export async function saveHardGate(
  leadId: string,
  data: HardGateData,
): Promise<{ success: boolean; disqualifiziert?: boolean; grund?: string; grundKey?: string; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // AAR-114: Disqualifikations-Check mit grund_key (Notion-Spec §2)
  // kein_schaden: schaden_sichtbar=false UND keine der 3 Nachfrage-Flags
  // (personenschaden, mietwagen, nutzungsausfall)
  let disqualifiziert = false
  let grund: string | undefined
  let grundKey: 'eigenverantwortung' | 'kein_schaden' | 'kein_haftpflicht' | undefined

  if (data.schuldfrage === 'eigenverantwortung') {
    disqualifiziert = true
    grund = 'Eigenverantwortung / Kasko-Fall'
    grundKey = 'eigenverantwortung'
  } else if (
    data.schaden_sichtbar === false &&
    !data.personenschaden_flag &&
    !data.mietwagen_flag &&
    !data.nutzungsausfall
  ) {
    disqualifiziert = true
    grund = 'Kein sichtbarer Schaden und keine Personenschaden/Mietwagen/Nutzungsausfall-Flags'
    grundKey = 'kein_schaden'
  } else if (data.hat_haftpflicht === false) {
    disqualifiziert = true
    grund = 'Kasko / eigene Versicherung — kein Haftpflichtschaden'
    grundKey = 'kein_haftpflicht'
  }

  const updates: Record<string, unknown> = {
    ...(data.unfallhergang !== undefined && { unfallhergang: data.unfallhergang }),
    ...(data.schuldfrage !== undefined && { schuldfrage: data.schuldfrage }),
    ...(data.aufklaerung_teilschuld_bestaetigt !== undefined && { aufklaerung_teilschuld_bestaetigt: data.aufklaerung_teilschuld_bestaetigt }),
    ...(data.schaden_sichtbar !== undefined && { schaden_sichtbar: data.schaden_sichtbar }),
    ...(data.personenschaden_flag !== undefined && { personenschaden_flag: data.personenschaden_flag }),
    ...(data.mietwagen_flag !== undefined && { mietwagen_flag: data.mietwagen_flag }),
    ...(data.nutzungsausfall !== undefined && { nutzungsausfall: data.nutzungsausfall }),
    ...(data.hat_haftpflicht !== undefined && { hat_haftpflicht: data.hat_haftpflicht }),
    // AAR-124: Unfallort + Polizei
    ...(data.unfallort !== undefined && { unfallort: data.unfallort }),
    ...(data.unfallort_kategorie !== undefined && { unfallort_kategorie: data.unfallort_kategorie }),
    ...(data.unfallort_lat !== undefined && { unfallort_lat: data.unfallort_lat }),
    ...(data.unfallort_lng !== undefined && { unfallort_lng: data.unfallort_lng }),
    ...(data.polizei_vor_ort !== undefined && { polizei_vor_ort: data.polizei_vor_ort }),
    ...(data.polizei_aktenzeichen !== undefined && { polizei_aktenzeichen: data.polizei_aktenzeichen }),
    updated_at: new Date().toISOString(),
  }

  // AAR-124 Business-Rule: polizei_vor_ort=true → polizeibericht_pflicht=true
  if (data.polizei_vor_ort === true) {
    updates.polizeibericht_pflicht = true
  } else if (data.polizeibericht_pflicht !== undefined) {
    updates.polizeibericht_pflicht = data.polizeibericht_pflicht
  }

  if (disqualifiziert) {
    updates.qualifizierungs_phase = 'disqualifiziert'
    updates.disqualifikations_grund = grund
    updates.disqualifikations_grund_key = grundKey
  } else {
    // AAR-114: Wenn alle 3 Fragen beantwortet sind und nicht disqualifiziert → in-qualifizierung
    const q1Complete =
      !!data.unfallhergang &&
      !!data.schuldfrage &&
      (data.schuldfrage !== 'unklar' || data.aufklaerung_teilschuld_bestaetigt === true)
    const q2Complete = data.schaden_sichtbar !== null && data.schaden_sichtbar !== undefined
    const q3Complete = data.hat_haftpflicht !== null && data.hat_haftpflicht !== undefined

    if (q1Complete && q2Complete && q3Complete) {
      updates.qualifizierungs_phase = 'in-qualifizierung'
    }
  }

  const { error } = await supabase.from('leads').update(updates).eq('id', leadId)
  if (error) return { success: false, error: error.message }

  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, disqualifiziert, grund, grundKey }
}

// AAR-115: Dispatch SV-Zuweisung + Termin-Reservierung im Lead-Detail
// Dispatcher waehlt pre-FlowLink einen SV + Zeitfenster. Der Termin wird mit
// lead_id (NICHT fall_id) in gutachter_termine angelegt. Nach SA-Unterschrift
// im FlowWizard wird er automatisch zu einem Fall-Termin upgegradet (siehe
// src/app/flow/[token]/actions.ts Zeile ~417).

export type SvSuggestion = {
  svId: string
  profileId: string | null
  name: string
  paket: string
  distanzKm: number
  offeneFaelle: number
  kontingentFrei: number
  ablehnungen30d: number
  score: number
  reasons: string[]
}

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
    .select('unfallort_lat, unfallort_lng, kunde_lat, kunde_lng')
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

  const { findBestSV } = await import('@/lib/dispatch/findBestSV')
  const candidates = await findBestSV({ fallLat: Number(lat), fallLng: Number(lng) }, 8)

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

  // Conflict-Check: kein anderer Termin fuer denselben SV im Slot
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

  // Bestehende Reservierung zum Lead stornieren (nur 1 aktive Reservierung pro Lead)
  // gutachter_termine hat KEINE storniert_am-Spalte (nur faelle/abrechnungen haben das),
  // daher nur status-Update.
  await supabase
    .from('gutachter_termine')
    .update({ status: 'storniert' })
    .eq('lead_id', leadId)
    .in('status', ['reserviert', 'gegenvorschlag'])

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
    .select('id')
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

  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, terminId: inserted.id }
}

export async function cancelSvTerminForLead(
  leadId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // gutachter_termine hat keine storniert_am-Spalte — nur status-Update
  const { error } = await supabase
    .from('gutachter_termine')
    .update({ status: 'storniert' })
    .eq('lead_id', leadId)
    .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt'])

  if (error) return { success: false, error: error.message }

  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true }
}
