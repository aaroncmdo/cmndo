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

// AAR-140 / W6: Generic Inline-Edit für Phase 4 Stammdaten.
// Allowlist verhindert dass User über dieses Endpoint kritische Felder wie
// qualifizierungs_phase / status / disqualifikations_grund_key manipulieren
// können — diese gehen ausschließlich über die jeweiligen dedizierten Actions.
const STAMMDATEN_ALLOWED_FIELDS = new Set([
  // Kunde
  'vorname', 'nachname', 'telefon', 'email',
  // Fahrzeug
  'kennzeichen', 'fahrzeug_hersteller', 'fahrzeug_modell',
  'hat_vorschaeden', 'vorschaeden_beschreibung',
  'finanzierung_leasing', 'vorsteuerabzugsberechtigt',
  // Gegner + Unfall
  'gegner_bekannt', 'gegner_kennzeichen', 'gegner_versicherung',
  'gegner_schadennummer', 'unfalldatum', 'unfall_uhrzeit',
  'unfallort', 'unfallort_lat', 'unfallort_lng', 'unfallort_kategorie',
  // AAR-135 Auto-Flags (von gegner-kz-flags.ts berechnet)
  'fahrerflucht', 'auslandskennzeichen',
  // Zeugen
  'zeugen',
])

export async function saveStammdaten(
  leadId: string,
  updates: Record<string, unknown>,
): Promise<{ success: boolean; error?: string; ignored?: string[] }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const allowed: Record<string, unknown> = {}
  const ignored: string[] = []
  for (const [key, value] of Object.entries(updates)) {
    if (STAMMDATEN_ALLOWED_FIELDS.has(key)) {
      allowed[key] = value
    } else {
      ignored.push(key)
    }
  }

  if (Object.keys(allowed).length === 0) {
    return { success: false, error: 'Keine erlaubten Felder im Update', ignored }
  }

  allowed.updated_at = new Date().toISOString()
  const { error } = await supabase.from('leads').update(allowed).eq('id', leadId)
  if (error) return { success: false, error: error.message, ignored }
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, ignored: ignored.length ? ignored : undefined }
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
  // AAR-138 / W4: Fahrzeug-Status nach Unfall (Spec §3 Q2)
  fahrzeug_fahrbereit?: boolean
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
    // AAR-138 / W4: fahrzeug_fahrbereit (Spec §3 Q2 Unterfeld)
    ...(data.fahrzeug_fahrbereit !== undefined && { fahrzeug_fahrbereit: data.fahrzeug_fahrbereit }),
    updated_at: new Date().toISOString(),
  }

  // AAR-124 Business-Rule (revalidiert): polizei_vor_ort=true ⟹ polizeibericht_pflicht=true.
  // polizei_vor_ort=false ⟹ polizeibericht_pflicht=false UND aktenzeichen löschen,
  // sonst bleiben Stale-Daten in der DB wenn der Dispatcher die Checkbox zurücksetzt.
  if (data.polizei_vor_ort === true) {
    updates.polizeibericht_pflicht = true
  } else if (data.polizei_vor_ort === false) {
    updates.polizeibericht_pflicht = false
    updates.polizei_aktenzeichen = null
  } else if (data.polizeibericht_pflicht !== undefined) {
    updates.polizeibericht_pflicht = data.polizeibericht_pflicht
  }

  if (disqualifiziert) {
    updates.qualifizierungs_phase = 'disqualifiziert'
    updates.disqualifikations_grund = grund
    updates.disqualifikations_grund_key = grundKey
  } else {
    // AAR-114 + AAR-138/W4: Wenn alle 3 Fragen beantwortet sind und nicht disqualifiziert → in-qualifizierung.
    // Q3 ist ab W4 Polizei-vor-Ort (nicht mehr Haftpflicht) — Frage gilt als
    // beantwortet sobald polizei_vor_ort true ODER false gesetzt ist.
    const q1Complete =
      !!data.unfallhergang &&
      !!data.schuldfrage &&
      (data.schuldfrage !== 'unklar' || data.aufklaerung_teilschuld_bestaetigt === true)
    const q2Complete = data.schaden_sichtbar !== null && data.schaden_sichtbar !== undefined
    const q3Complete = data.polizei_vor_ort === true || data.polizei_vor_ort === false

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
    // AAR-133 Bug 4: ablehnen_token mitlesen für späteren AAR-134 (Ablehnen-Link)
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

  // AAR-133: Email an SV (non-blocking — Reservierung steht auch wenn Mail failt)
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

  // gutachter_termine hat keine storniert_am-Spalte — nur status-Update.
  // AAR-134: 'abgelehnt' mit drin, damit Dispatcher aus der roten Card-View
  // heraus den Termin schließen und einen neuen SV wählen kann.
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
// Kopiert start_zeit/end_zeit aus sv_vorgeschlagene_slots[slotIndex] in
// gutachter_termine.start_zeit/end_zeit, setzt status='bestaetigt',
// resettet sv_vorgeschlagene_slots auf null.
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

  // Timeline
  await supabase.from('timeline').insert({
    fall_id: termin.fall_id ?? null,
    lead_id: !termin.fall_id ? termin.lead_id : null,
    typ: 'termin',
    titel: 'Dispatcher hat SV-Gegenvorschlag akzeptiert',
    beschreibung: `Slot ${slotIndex + 1} angenommen: ${new Date(slot.start).toLocaleString('de-DE')}`,
    erstellt_von: user.id,
  }).then(() => {}, () => {})

  if (termin.lead_id) revalidatePath(`/dispatch/leads/${termin.lead_id}`)
  return { success: true }
}

// AAR-141 / W7: Multi-Channel FlowLink-Versand (WhatsApp / SMS / Email).
// Ersetzt die alte sendFlowLink (admin/dispatch/actions) als Phase-5-Primärweg.
// Die alte Action bleibt für Legacy-Aufrufer erhalten, aber Phase 5 ruft
// ausschließlich diese hier.
export async function sendFlowLinkMultiChannel(
  leadId: string,
  kanal: 'whatsapp' | 'sms' | 'email',
  telefonOverride?: string | null,
): Promise<{ success: boolean; error?: string; token?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: lead } = await supabase
    .from('leads')
    .select('id, vorname, nachname, telefon, email, service_typ')
    .eq('id', leadId)
    .single()
  if (!lead) return { success: false, error: 'Lead nicht gefunden' }

  const telefon = (telefonOverride?.trim() || lead.telefon) ?? null
  const serviceTyp = (lead.service_typ as string | null) ?? 'komplett'

  // FlowLink-Token anlegen
  const { data: flowLink, error: flowErr } = await supabase
    .from('flow_links')
    .insert({
      lead_id: leadId,
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      service_typ: serviceTyp,
    })
    .select('token')
    .single()
  if (flowErr || !flowLink) {
    return { success: false, error: flowErr?.message ?? 'Flow-Link-Erstellung fehlgeschlagen' }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
  const flowUrl = `${baseUrl}/flow/${flowLink.token}`

  // Aktiver Termin für Template-Variablen (AAR-116 Fix: alle 6 Vars)
  const { data: terminRaw } = await supabase
    .from('gutachter_termine')
    .select('start_zeit, sachverstaendige(profiles(vorname, nachname))')
    .eq('lead_id', leadId)
    .in('status', ['reserviert', 'bestaetigt'])
    .order('start_zeit', { ascending: true })
    .limit(1)
    .maybeSingle()
  const termin = terminRaw as { start_zeit: string; sachverstaendige: unknown } | null
  const svRel = termin?.sachverstaendige
  const sv = (Array.isArray(svRel) ? svRel[0] : svRel) as { profiles: unknown } | null
  const profileRel = sv?.profiles
  const profile = (Array.isArray(profileRel) ? profileRel[0] : profileRel) as
    | { vorname: string | null; nachname: string | null }
    | null
  const svVorname = profile?.vorname ?? ''
  const svNachname = profile?.nachname ?? ''
  const terminDate = termin?.start_zeit ? new Date(termin.start_zeit) : null
  const datum = terminDate ? terminDate.toLocaleDateString('de-DE') : ''
  const uhrzeit = terminDate
    ? terminDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : ''

  // Kanal-spezifischer Versand
  if (kanal === 'whatsapp') {
    if (!telefon) return { success: false, error: 'Keine Telefonnummer für WhatsApp' }
    try {
      const { sendCommunication } = await import('@/lib/communications/send')
      await sendCommunication('flowlink_versand', {
        telefon,
        vorname: lead.vorname ?? '',
        '1': lead.vorname ?? '',
        '2': svVorname,
        '3': svNachname,
        '4': datum,
        '5': uhrzeit,
        '6': flowUrl,
      })
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'WhatsApp-Versand fehlgeschlagen',
      }
    }
  } else if (kanal === 'sms') {
    if (!telefon) return { success: false, error: 'Keine Telefonnummer für SMS' }
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const smsFrom = process.env.TWILIO_SMS_FROM
    if (!accountSid || !authToken || !smsFrom) {
      return { success: false, error: 'Twilio-SMS-Credentials fehlen (TWILIO_SMS_FROM)' }
    }
    let normalTo = telefon.replace(/\s/g, '')
    if (normalTo.startsWith('0')) normalTo = '+49' + normalTo.slice(1)
    else if (normalTo.startsWith('00')) normalTo = '+' + normalTo.slice(2)
    if (!normalTo.startsWith('+')) normalTo = '+' + normalTo
    const body = `Hallo ${lead.vorname ?? ''}, Ihr Schadenportal ist bereit. Termin mit ${svVorname} ${svNachname} am ${datum} ${uhrzeit}. Portal öffnen: ${flowUrl}`
    const params = new URLSearchParams()
    params.set('From', smsFrom)
    params.set('To', normalTo)
    params.set('Body', body)
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      },
    )
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return { success: false, error: `Twilio-SMS Fehler ${resp.status}: ${text.slice(0, 200)}` }
    }
  } else if (kanal === 'email') {
    if (!lead.email) return { success: false, error: 'Keine Email-Adresse am Lead' }
    const { sendFlowLinkVersand } = await import('@/lib/email/google/flows')
    const r = await sendFlowLinkVersand(leadId, flowUrl)
    if (!r.success) return { success: false, error: r.error }
  }

  // Lead-Status auf flow-versendet (AAR-116 Hardening: nur nach erfolgreichem Send)
  await supabase
    .from('leads')
    .update({
      wa_gesendet: kanal === 'whatsapp' ? true : undefined,
      status: 'flow-gesendet',
      qualifizierungs_phase: 'flow-versendet',
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  // Timeline-Eintrag
  const kanalLabel = kanal === 'whatsapp' ? 'WhatsApp' : kanal === 'sms' ? 'SMS' : 'Email'
  await supabase
    .from('timeline')
    .insert({
      lead_id: leadId,
      fall_id: null,
      typ: 'system',
      titel: `FlowLink per ${kanalLabel} versendet`,
      beschreibung: `An ${kanal === 'email' ? lead.email : telefon} — SV ${svVorname} ${svNachname} am ${datum} ${uhrzeit}`,
      erstellt_von: user.id,
    })
    .then(() => {}, () => {})

  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, token: flowLink.token }
}
