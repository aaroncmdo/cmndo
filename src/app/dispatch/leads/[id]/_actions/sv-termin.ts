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
    .select('besichtigungsort_lat, besichtigungsort_lng, fahrzeug_standort_lat, fahrzeug_standort_lng, unfallort_lat, unfallort_lng, kunde_lat, kunde_lng, wunschtermin')
    .eq('id', leadId)
    .single()

  if (!lead) return { success: false, error: 'Lead nicht gefunden' }

  // Fallback-Chain für den Ort wohin der SV fährt:
  //   besichtigungsort (explizit gesetzt, Dispatch-Phase-2 oder vom Kunden)
  //   → fahrzeug_standort (AAR-663 Self-Service-Schritt 1 via Google-Places)
  //   → unfallort (Legacy, Unfallstelle — nicht ideal, aber als Fallback OK)
  //   → kunde (letzter Notnagel, Wohnadresse)
  const l = lead as {
    besichtigungsort_lat: number | null
    besichtigungsort_lng: number | null
    fahrzeug_standort_lat: number | null
    fahrzeug_standort_lng: number | null
    unfallort_lat: number | null
    unfallort_lng: number | null
    kunde_lat: number | null
    kunde_lng: number | null
  }
  const lat = l.besichtigungsort_lat ?? l.fahrzeug_standort_lat ?? l.unfallort_lat ?? l.kunde_lat
  const lng = l.besichtigungsort_lng ?? l.fahrzeug_standort_lng ?? l.unfallort_lng ?? l.kunde_lng

  if (lat == null || lng == null) {
    return { success: false, error: 'Lead hat keine Koordinaten (Besichtigungsort/Fahrzeug-Standort/Unfallort/Kunde fehlt)' }
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

  // AAR-607 B3: Terminal-Status (abgelehnt, abgesagt) dürfen neue Reservierung
  // nicht mehr blockieren — sonst kann Dispatcher nach SV-Ablehnung keinen neuen
  // SV im selben Zeitfenster buchen.
  const { data: konflikt } = await supabase
    .from('gutachter_termine')
    .select('id')
    .eq('sv_id', svId)
    .not('status', 'in', '("storniert","abgelehnt","abgesagt","no_show")')
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

  // AAR-713: Keine SV-Email bei reiner Vorreservierung mehr — der SV soll
  // erst dann per Email die finale Termin-Bestätigung bekommen, wenn der
  // Kunde im FlowLink die SA unterschrieben hat. Vorher gab es eine
  // verwirrende „Vorreservierung"-Mail bevor der Auftrag überhaupt feststand.
  // Die in-App-Mitteilung (createGutachterMitteilung oben) bleibt — der SV
  // sieht den reservierten Slot in seinem Auftragsfeed/Kalender, fährt aber
  // nicht los bis die Bestätigungs-Email kommt.

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
          .select('sachverstaendige(profiles!sachverstaendige_profile_id_fkey(vorname, nachname))')
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
//
// AAR-522: Erweitert um Wunschtermin-Priorisierung + Wochentag-Filter.
// Ranking bei gesetztem wunschterminIso:
//   1 'wunschtermin'  — exakter Match ±30min
//   2 'gleicher_tag'  — anderer Slot am selben Tag
//   3 'nahe'          — Tag davor/danach
//   4 'nach'          — sonst, nächste freie
// Ohne wunschterminIso liefern alle Slots matchType 'nach'.

export type SlotMatchType = 'wunschtermin' | 'gleicher_tag' | 'nahe' | 'nach'
export type SlotCandidate = { start: string; end: string; matchType: SlotMatchType }

export type NextFreeSlotsOpts = {
  wunschterminIso?: string | null
  wunschterminWochentage?: number[] | null
  prioritizeAroundWunschtermin?: boolean
}

export async function getNextFreeSlotsForSv(
  svId: string,
  count: number = 3,
  slotDauerMin: number = 120,
  opts?: NextFreeSlotsOpts,
): Promise<{ success: boolean; slots?: SlotCandidate[]; error?: string }> {
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

  const wunschterminIso = opts?.wunschterminIso ?? null
  const wunschtermin = wunschterminIso ? new Date(wunschterminIso) : null
  const useWunschtermin =
    wunschtermin != null &&
    !Number.isNaN(wunschtermin.getTime()) &&
    (opts?.prioritizeAroundWunschtermin ?? true)

  const wochentageFilter = opts?.wunschterminWochentage?.length
    ? new Set(opts.wunschterminWochentage)
    : null

  const alleKandidaten: SlotCandidate[] = []
  const kandidat = new Date(now)
  // Frühestens morgen 09:00 — heute anzurufen + morgen Termin ist normales
  // Dispatch-Tempo.
  kandidat.setDate(kandidat.getDate() + 1)
  kandidat.setHours(9, 0, 0, 0)

  const maxIter = 12 * 7 * 24
  let i = 0
  // Obergrenze deutlich höher als `count`, damit wir genug Rohdaten für
  // die Sortierung nach matchType haben. Ohne Wunschtermin wird der Loop
  // ohnehin nach count Treffern verlassen — siehe break unten.
  const rohdatenLimit = useWunschtermin ? Math.max(count * 6, 12) : count

  while (alleKandidaten.length < rohdatenLimit && kandidat < inZwoelfWochen && i < maxIter) {
    i++
    const wochentag = kandidat.getDay()
    const iso = wochentag === 0 ? 7 : wochentag
    const istWerktag = wochentag !== 0 && wochentag !== 6
    const passtWochentag = wochentageFilter ? wochentageFilter.has(iso) : istWerktag
    if (passtWochentag && kandidat.getHours() < 16) {
      const slotEnd = new Date(kandidat.getTime() + slotDauerMin * 60_000)
      const konflikt = (bestehend ?? []).some(
        (b) => new Date(b.start_zeit) < slotEnd && new Date(b.end_zeit) > kandidat,
      )
      if (!konflikt) {
        alleKandidaten.push({
          start: kandidat.toISOString(),
          end: slotEnd.toISOString(),
          matchType: classify(kandidat, wunschtermin, useWunschtermin),
        })
      }
    }
    kandidat.setTime(kandidat.getTime() + 60 * 60_000)
    if (kandidat.getHours() >= 17) {
      kandidat.setDate(kandidat.getDate() + 1)
      kandidat.setHours(9, 0, 0, 0)
    }
  }

  // Ranking: wunschtermin > gleicher_tag > nahe > nach. Bei gleichem Match-Typ
  // nach zeitlicher Nähe zum Wunschtermin (oder absolut aufsteigend ohne).
  const priority: Record<SlotMatchType, number> = {
    wunschtermin: 0,
    gleicher_tag: 1,
    nahe: 2,
    nach: 3,
  }
  const sorted = alleKandidaten.sort((a, b) => {
    const pa = priority[a.matchType]
    const pb = priority[b.matchType]
    if (pa !== pb) return pa - pb
    if (useWunschtermin && wunschtermin) {
      const diffA = Math.abs(new Date(a.start).getTime() - wunschtermin.getTime())
      const diffB = Math.abs(new Date(b.start).getTime() - wunschtermin.getTime())
      return diffA - diffB
    }
    return new Date(a.start).getTime() - new Date(b.start).getTime()
  })

  return { success: true, slots: sorted.slice(0, count) }
}

function classify(
  slotStart: Date,
  wunschtermin: Date | null,
  useWunschtermin: boolean,
): SlotMatchType {
  if (!useWunschtermin || !wunschtermin) return 'nach'
  const diffMs = Math.abs(slotStart.getTime() - wunschtermin.getTime())
  if (diffMs <= 30 * 60_000) return 'wunschtermin'
  const sameDay =
    slotStart.getFullYear() === wunschtermin.getFullYear() &&
    slotStart.getMonth() === wunschtermin.getMonth() &&
    slotStart.getDate() === wunschtermin.getDate()
  if (sameDay) return 'gleicher_tag'
  const oneDayMs = 24 * 60 * 60_000
  if (diffMs <= oneDayMs * 1.5) return 'nahe'
  return 'nach'
}

// AAR-522: Kombinierte Action — SV-Vorschläge UND Slots in einem Roundtrip.
// Dispatcher sieht beim Mount direkt die Top-SVs mit ihren besten Slots.
export async function getSvSuggestionsWithSlots(
  leadId: string,
  opts?: { slotsPerSv?: number; maxSvs?: number; slotDauerMin?: number },
): Promise<{
  success: boolean
  suggestions?: Array<SvSuggestion & { slots: SlotCandidate[] }>
  error?: string
}> {
  const slotsPerSv = opts?.slotsPerSv ?? 3
  const maxSvs = opts?.maxSvs ?? 3
  const slotDauer = opts?.slotDauerMin ?? 120

  const basisResult = await listSvSuggestionsForLead(leadId)
  if (!basisResult.success) {
    return { success: false, error: basisResult.error ?? 'SV-Suche fehlgeschlagen' }
  }
  const basis = basisResult.suggestions ?? []
  if (basis.length === 0) return { success: true, suggestions: [] }

  // Wunschtermin + Wochentage aus leads laden — gleicher Payload den
  // SvDispatchPanel bereits kennt, aber hier zentral gebündelt.
  const supabase = await createClient()
  const { data: lead } = await supabase
    .from('leads')
    .select('wunschtermin, wunschtermin_wochentage')
    .eq('id', leadId)
    .single()
  const wunschterminIso = (lead as { wunschtermin: string | null } | null)?.wunschtermin ?? null
  const wunschterminWochentage =
    ((lead as { wunschtermin_wochentage: number[] | null } | null)?.wunschtermin_wochentage) ?? null

  const top = basis.slice(0, maxSvs)
  const slotsPerCandidate = await Promise.all(
    top.map(async (cand) => {
      const r = await getNextFreeSlotsForSv(cand.svId, slotsPerSv, slotDauer, {
        wunschterminIso,
        wunschterminWochentage,
        prioritizeAroundWunschtermin: true,
      })
      return { cand, slots: r.success ? r.slots ?? [] : [] }
    }),
  )

  return {
    success: true,
    suggestions: slotsPerCandidate.map(({ cand, slots }) => ({ ...cand, slots })),
  }
}
