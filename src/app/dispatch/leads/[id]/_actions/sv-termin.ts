'use server'

// AAR-143: SV-Termin-Reservierung extrahiert aus actions.ts.
// AAR-115: Pre-FlowLink SV-Auswahl + Termin (gutachter_termine.lead_id, kein
// fall_id). Wird nach SA-Unterschrift in flow/[token]/actions.ts via fall_id
// upgegradet.

import { requireRole } from '@/lib/auth/guards'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SvSuggestion } from './types'
import { TERMIN_DAUER_MIN } from '@/lib/dispatch/termin-konstanten'
import { checkSvReachability, precomputeSvSlotEtas, isSlotReachable } from '@/lib/dispatch/reachability'
import { berlinWallClockToUtc, toBerlinWallClock } from '@/lib/google-calendar/timezone'
import { pruefeBelegungStrict } from '@/lib/termine/engine'
import { ladeSvAssigneeName } from '@/lib/termine/termin-assignee-name'

/**
 * Sticky-SV-Lookup: hat dieser Lead bereits einen gewohnten SV? Match per
 * lead.kunde_id ODER per E-Mail/Telefon auf claim_parties. SV muss aktiv sein.
 * Wiederhergestellt aus Commit 3a93881b — wurde durch Polish-Sweep verloren.
 */
async function findStickySvForLead(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lead: Record<string, unknown>,
): Promise<string | null> {
  // 1) Direkt ueber lead.kunde_id (Match-Modal)
  const kundeId = (lead.kunde_id as string | null) ?? null
  if (kundeId) {
    // CMM-65: created_at von faelle (stirbt mit Phase-6-DROP) auf claims (SSoT).
    // Pattern 1 (!inner) + clientseitiger Sort, da supabase-js nicht nach einer
    // eingebetteten to-one-Spalte ordnen kann; pro Kunde nur wenige Faelle.
    // CMM-49 (faelle-Drop-Runway): bridge spiegelt faelle-RLS exakt; sv_id + geschaedigter_user_id
    // (=kunde_id, div=0) + created_at claims-SSoT. faelle ⊊ claims -> Anchor bridge erhaelt Zeilenmenge.
    const { data: kundeFaelle } = await supabase
      .from('faelle_claim_bridge')
      .select('claims:claims!fk_bridge_claim!inner(sv_id, created_at)')
      .eq('claims.geschaedigter_user_id', kundeId)
      .not('claims.sv_id', 'is', null)
    const svId =
      ((kundeFaelle ?? [])
        .map((f) => {
          const c = Array.isArray(f.claims) ? f.claims[0] : f.claims
          return {
            sv_id: (c?.sv_id as string | null) ?? null,
            created_at: (c?.created_at as string | null) ?? '',
          }
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.sv_id) ?? null
    if (svId) {
      const { data: sv } = await supabase
        .from('sachverstaendige')
        .select('id, ist_aktiv')
        .eq('id', svId)
        .maybeSingle()
      if (sv && sv.ist_aktiv !== false) return sv.id as string
    }
  }

  // 2) Ueber Kontakt-Match auf claim_parties
  const kontakte: string[] = []
  for (const k of ['email', 'halter_email']) {
    const v = lead[k] as string | null | undefined
    if (v) kontakte.push(`email.ilike.${v}`)
  }
  for (const k of ['telefon', 'halter_telefon']) {
    const v = lead[k] as string | null | undefined
    if (v) kontakte.push(`telefon.eq.${v}`)
  }
  if (kontakte.length === 0) return null

  const { data: parties } = await supabase
    .from('claim_parties')
    .select('claim_id')
    .or(kontakte.join(','))
    .limit(10)
  const claimIds = ((parties ?? []) as Array<{ claim_id: string }>).map((p) => p.claim_id)
  if (claimIds.length === 0) return null

  // CMM-65: created_at von faelle (stirbt mit Phase-6-DROP) auf claims (SSoT).
  // Pattern 1 (!inner) statt base-switch auf claims, um die faelle-Zeilenmenge
  // exakt zu erhalten (faelle ⊊ claims); Sort clientseitig nach claims.created_at.
  // CMM-49 (faelle-Drop-Runway): bridge-Anchor erhaelt faelle-Zeilenmenge (faelle ⊊ claims);
  // sv_id + created_at claims-SSoT (sv_id div=0). claimIds bereits via claim_parties-RLS gescoped.
  const { data: faelle } = await supabase
    .from('faelle_claim_bridge')
    .select('claims:claims!fk_bridge_claim!inner(sv_id, created_at)')
    .in('claim_id', claimIds)
    .not('claims.sv_id', 'is', null)
  const faelleSorted = ((faelle ?? []) as Array<{ claims: { sv_id: string | null; created_at: string | null } | { sv_id: string | null; created_at: string | null }[] | null }>)
    .map((f) => {
      const c = Array.isArray(f.claims) ? f.claims[0] : f.claims
      return {
        sv_id: (c?.sv_id ?? '') as string,
        created_at: (c?.created_at) ?? '',
      }
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  for (const f of faelleSorted) {
    const { data: sv } = await supabase
      .from('sachverstaendige')
      .select('id, ist_aktiv')
      .eq('id', f.sv_id)
      .maybeSingle()
    if (sv && sv.ist_aktiv !== false) return sv.id as string
  }
  return null
}

/**
 * Un-geguardeter Kern der SV-Vorschlags-Query. Nimmt einen bereits
 * authentifizierten supabase-Client als Param — der Guard passiert im
 * exportierten Wrapper (listSvSuggestionsForLead) bzw. beim einzigen internen
 * Caller (getSvSuggestionsWithSlots, der selbst geguarded ist). So macht der
 * Drawer-Load nicht 2+N requireAuth-Round-Trips (je getUser + profiles-SELECT).
 */
async function listSvSuggestionsCore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leadId: string,
): Promise<{ success: boolean; suggestions?: SvSuggestion[]; error?: string }> {
  const { data: lead } = await supabase
    .from('leads')
    .select('besichtigungsort_lat, besichtigungsort_lng, fahrzeug_standort_lat, fahrzeug_standort_lng, unfallort_lat, unfallort_lng, kunde_lat, kunde_lng, wunschtermin, kunde_id, email, telefon, halter_email, halter_telefon')
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

  // Sticky-SV: hatte der Kunde bereits einen Fall? Dann der gleiche SV.
  // Quellen: lead.kunde_id (durch Match-Modal) ODER E-Mail/Telefon-Match
  // auf claim_parties.
  const stickySvId = await findStickySvForLead(supabase, lead as Record<string, unknown>)

  const { findBestSV } = await import('@/lib/dispatch/findBestSV')
  const candidates = await findBestSV(
    { fallLat: Number(lat), fallLng: Number(lng), wunschterminIso, stickySvId },
    8,
  )

  return { success: true, suggestions: candidates as SvSuggestion[] }
}

export async function listSvSuggestionsForLead(leadId: string): Promise<{
  success: boolean
  suggestions?: SvSuggestion[]
  error?: string
}> {
  // kundenbetreuer ist eingeschlossen: /mitarbeiter/isochrone (IsochroneClient)
  // ruft diese Action auf — KB-Portal hat requirePortalAccess(['kundenbetreuer','admin']).
  const guard = await requireRole(['dispatch', 'admin', 'kundenbetreuer'])
  if (!guard.success) return { success: false, error: guard.error }
  return listSvSuggestionsCore(guard.supabase, leadId)
}

export async function reserveSvTerminForLead(
  leadId: string,
  svId: string,
  startIso: string,
  durationMin: number = TERMIN_DAUER_MIN,
): Promise<{ success: boolean; terminId?: string; error?: string }> {
  const guard = await requireRole(['dispatch', 'admin'])
  if (!guard.success) return { success: false, error: guard.error }
  const supabase = guard.supabase

  const startDate = new Date(startIso)
  if (Number.isNaN(startDate.getTime())) return { success: false, error: 'Ungültiges Startdatum' }
  const endDate = new Date(startDate.getTime() + durationMin * 60_000)

  // AAR-607 B3 bleibt intakt: Terminal-Status (storniert/abgelehnt/abgesagt/no_show) sind in
  // v_belegung ohnehin ausgeschlossen → Rebook nach SV-Ablehnung weiterhin moeglich.
  // Fail-CLOSED Verfuegbarkeits-Check gegen v_belegung (Buchung ∪ externer CalDAV-Kalender ∪
  // Urlaub/Sperre) statt des frueheren gutachter_termine-only-Reads: der war (a) fail-OPEN
  // (DB-Fehler → stumm 'frei' → Doppelbuchungs-Vektor) und (b) blind fuer CalDAV-Events + Urlaube.
  // pruefeBelegungStrict liest via Admin-Client (v_belegung ist service-role-only) → KEIN db-Argument.
  const belegung = await pruefeBelegungStrict(
    { typ: 'sachverstaendiger', id: svId },
    startDate.toISOString(),
    endDate.toISOString(),
  )
  if (!belegung.ok) {
    return { success: false, error: 'Verfügbarkeit konnte nicht geprüft werden — bitte erneut versuchen' }
  }
  if (!belegung.frei) {
    return { success: false, error: 'SV ist im gewählten Zeitfenster nicht verfügbar (Termin, Kalender-Eintrag oder Urlaub)' }
  }

  // AAR-CMM: Reachability-Hard-Check — SV muss zum Slot anfahren UND nach
  // dem Slot zum nächsten Termin kommen können. Nutzt Mapbox-ETA gegen
  // Vorgänger-/Nachfolge-Termin.
  const { data: leadLoc } = await supabase
    .from('leads')
    .select('besichtigungsort_lat, besichtigungsort_lng, fahrzeug_standort_lat, fahrzeug_standort_lng')
    .eq('id', leadId)
    .single()
  const candidateLat =
    (leadLoc as { besichtigungsort_lat: number | null; fahrzeug_standort_lat: number | null } | null)
      ?.besichtigungsort_lat ?? (leadLoc as { fahrzeug_standort_lat: number | null } | null)?.fahrzeug_standort_lat ?? null
  const candidateLng =
    (leadLoc as { besichtigungsort_lng: number | null; fahrzeug_standort_lng: number | null } | null)
      ?.besichtigungsort_lng ?? (leadLoc as { fahrzeug_standort_lng: number | null } | null)?.fahrzeug_standort_lng ?? null

  if (candidateLat != null && candidateLng != null) {
    const reach = await checkSvReachability(supabase, {
      svId,
      candidateLat: Number(candidateLat),
      candidateLng: Number(candidateLng),
      candidateStartIso: startDate.toISOString(),
      candidateEndIso: endDate.toISOString(),
    })
    if (!reach.reachable) {
      return { success: false, error: reach.grund ?? 'SV kann den Termin nicht erreichen' }
    }
  }

  // AAR-134: 'abgelehnt' auch stornieren — verhindert Doppel-Termine nach SV-Ablehnung.
  // AAR-956: bezug-native Self-Service-Termine (lead_id NULL) mit-stornieren, sonst bliebe
  // beim Rebook ein reservierter Self-Service-Termin haengen (EXCLUSION-Slot-Blocker).
  // Vorbedingung fuer den Insert direkt darunter: bleiben die alten Termine aktiv,
  // entsteht entweder ein Doppel-Termin oder der neue Insert scheitert an der
  // Ueberlappungs-Constraint (23P01) — der Grund waere dann nicht erkennbar.
  const { error: stornoFehler } = await supabase
    .from('gutachter_termine')
    .update({ status: 'storniert' })
    .or(`lead_id.eq.${leadId},and(bezug_typ.eq.lead,bezug_id.eq.${leadId})`)
    .in('status', ['reserviert', 'gegenvorschlag', 'abgelehnt'])
  if (stornoFehler) {
    console.error(`[sv-termin] Alt-Termine nicht storniert (Lead ${leadId}) — Doppel-Termin moeglich:`, stornoFehler.message)
  }

  const { data: inserted, error } = await supabase
    .from('gutachter_termine')
    .insert({
      lead_id: leadId,
      assignee_id: svId,
      assignee_typ: 'sachverstaendiger',
      start_zeit: startDate.toISOString(),
      end_zeit: endDate.toISOString(),
      status: 'reserviert',
      ablehnen_token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('id, ablehnen_token')
    .single()

  if (error || !inserted) {
    // 23P01 = Exclusion-Constraint: SV in der TOCTOU-Luecke anderweitig verplant → freundliche Meldung.
    if (error?.code === '23P01') {
      return { success: false, error: 'SV wurde zwischenzeitlich anderweitig verplant — bitte anderen Slot wählen' }
    }
    return { success: false, error: error?.message ?? 'Insert fehlgeschlagen' }
  }

  // CMM-36: Baseline-Fahrtzeit (SV-Standort → Kunde) einmalig cachen.
  // Fire-and-forget — Mapbox-Fehler dürfen die Reservation nicht brechen.
  void import('@/lib/termine/baseline-fahrtzeit').then(({ speichereBaselineFahrtzeit }) =>
    speichereBaselineFahrtzeit(supabase, inserted.id as string, svId, leadId, null),
  )

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
      datum: startDate.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }),
      uhrzeit: startDate.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }),
    })
  } catch (err) {
    console.warn('[reserveSvTerminForLead] Mitteilung fehlgeschlagen:', err)
  }

  // AAR-713 + 15.05.2026: Kein "Vorreservierungs-Email" mehr und kein
  // Auto-Bestaetigungs-Loop — die Verfuegbarkeit ist via FreeBusy +
  // gutachter_termine-Check bereits sicher. Stattdessen bekommt der SV bei
  // jeder Reservierung eine WhatsApp-Push (Baileys) mit Deep-Link zum
  // Termin. Faellt non-blocking aus: kein WhatsApp / Service down / kein
  // Telefon bricht die Reservation nicht.
  try {
    const { data: svRow } = await supabase
      .from('sachverstaendige')
      .select('profile_id, profiles!sachverstaendige_profile_id_fkey(telefon, email)')
      .eq('id', svId)
      .single()
    const svProfile = Array.isArray(svRow?.profiles) ? svRow?.profiles[0] : svRow?.profiles
    const phone = (svProfile as { telefon: string | null } | null)?.telefon ?? null
    const email = (svProfile as { email: string | null } | null)?.email ?? null
    const profileId = (svRow?.profile_id as string | null) ?? null

    if (phone && profileId) {
      const { data: leadData } = await supabase
        .from('leads')
        .select('vorname, nachname, schadentyp, kunde_plz')
        .eq('id', leadId)
        .single()
      const ld = leadData as {
        vorname: string | null
        nachname: string | null
        schadentyp: string | null
        kunde_plz: string | null
      } | null
      const kundeName = ld ? `${ld.vorname ?? ''} ${ld.nachname ?? ''}`.trim() || 'Kunde' : 'Kunde'
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
      const link = `${baseUrl}/gutachter/termine/${inserted.id}`
      const datumKurz = startDate.toLocaleDateString('de-DE', {
        timeZone: 'Europe/Berlin',
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
      })
      const uhrzeit = startDate.toLocaleTimeString('de-DE', {
        timeZone: 'Europe/Berlin',
        hour: '2-digit',
        minute: '2-digit',
      })
      const text =
        `📋 Neuer Auftrag — Claimondo\n\n` +
        `Kunde: ${kundeName}\n` +
        `Schadentyp: ${ld?.schadentyp ?? 'unbekannt'}\n` +
        `PLZ: ${ld?.kunde_plz ?? '—'}\n` +
        `Termin: ${datumKurz} · ${uhrzeit} Uhr\n\n` +
        `Details + Navigation:\n${link}`
      const { sendNachricht } = await import('@/lib/whatsapp/send')
      await sendNachricht({
        entity: 'profile',
        entityId: profileId,
        phone,
        email,
        text,
        templateKey: 'sv_neuer_auftrag',
        empfaengerRolle: 'sachverstaendiger',
        fallback: ['email'],
      })
    }
  } catch (err) {
    console.warn('[reserveSvTerminForLead] SV-WhatsApp-Notify fehlgeschlagen:', err)
  }

  // AAR-939 8b: SV-Tracking-Webhook termin_vereinbart. Dynamic import (server-only
  // Modul). No-op wenn der Lead nicht aus einer embed-B-Anfrage stammt. Non-fatal.
  try {
    const { fireTrackingWebhook } = await import('@/lib/embed/tracking-webhook')
    await fireTrackingWebhook({ event: 'termin_vereinbart', leadId })
  } catch (err) {
    console.warn('[AAR-939 8b] tracking termin_vereinbart fehlgeschlagen:', err)
  }

  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, terminId: inserted.id }
}

export async function cancelSvTerminForLead(
  leadId: string,
): Promise<{ success: boolean; error?: string }> {
  const guard = await requireRole(['dispatch', 'admin'])
  if (!guard.success) return { success: false, error: guard.error }
  const supabase = guard.supabase

  // AAR-134: 'abgelehnt' mit drin — Dispatcher kann roten Card-Termin schließen.
  // AAR-956 (Spec-Erweiterung): identische bezug-Blindheit wie der Rebook-Cancel oben —
  // ein bezug-nativer Self-Service-Termin muss beim Dispatcher-Cancel ebenfalls weg.
  const { data: storniert, error } = await supabase
    .from('gutachter_termine')
    .update({ status: 'storniert' })
    .or(`lead_id.eq.${leadId},and(bezug_typ.eq.lead,bezug_id.eq.${leadId})`)
    .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt', 'abgelehnt'])
    .select('fall_id')

  if (error) return { success: false, error: error.message }

  revalidatePath(`/dispatch/leads/${leadId}`)
  // Termin-Propagation: ist der Lead bereits konvertiert (storniertes Termin trägt eine
  // fall_id), die Claim-Portale mit-revalidieren — sonst sehen Kunde/SV/KB/Admin den Storno
  // stale. Spiegelt revalidateFallPaths der kanonischen Verlegungs-Engine
  // (src/lib/actions/termin-verlegung-actions.ts); bewusst inline statt cross-File-Export
  // (jenes ist ein 'use server'-File). Bei reinem Lead-Termin (fall_id NULL) ein No-op.
  for (const fallId of new Set(
    (storniert ?? []).map((t) => t.fall_id).filter(Boolean) as string[],
  )) {
    revalidatePath(`/kunde/faelle/${fallId}`)
    revalidatePath(`/gutachter/fall/${fallId}`)
    revalidatePath(`/faelle/${fallId}`)
    revalidatePath(`/mitarbeiter/faelle/${fallId}`)
    revalidatePath('/admin/faelle')
  }
  return { success: true }
}

// AAR-134 Phase 8: Dispatcher akzeptiert einen vom SV vorgeschlagenen Slot.
export async function acceptGegenvorschlag(
  terminId: string,
  slotIndex: number,
): Promise<{ success: boolean; error?: string }> {
  const guard = await requireRole(['dispatch', 'admin'])
  if (!guard.success) return { success: false, error: guard.error }
  const supabase = guard.supabase
  const user = guard.user

  // CMM-44 SP-D PR2a: besichtigungsort_lat/lng aus gutachter_termine selbst (SSoT).
  const { data: termin } = await supabase
    .from('gutachter_termine')
    // CMM-49 (sv_id-Drop): assignee_id statt sv_id (value-identisch für SV-Termine).
    .select('id, assignee_id, status, sv_vorgeschlagene_slots, lead_id, fall_id, besichtigungsort_lat, besichtigungsort_lng')
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

  // AAR-CMM Reachability-Hard-Check: SV-Gegenvorschlag muss erreichbar sein.
  // Wenn der SV inzwischen einen Vor-/Nachfolge-Termin bekommen hat, blocken
  // wir die Annahme.
  if (termin.assignee_id) {
    let candLat: number | null = null
    let candLng: number | null = null
    if (termin.fall_id) {
      // CMM-44 SP-D PR2a: besichtigungsort_lat/lng direkt aus dem Termin (SSoT).
      candLat = (termin as { besichtigungsort_lat: number | null }).besichtigungsort_lat ?? null
      candLng = (termin as { besichtigungsort_lng: number | null }).besichtigungsort_lng ?? null
    } else if (termin.lead_id) {
      const { data: l } = await supabase
        .from('leads')
        .select('besichtigungsort_lat, besichtigungsort_lng')
        .eq('id', termin.lead_id)
        .single()
      candLat = (l as { besichtigungsort_lat: number | null } | null)?.besichtigungsort_lat ?? null
      candLng = (l as { besichtigungsort_lng: number | null } | null)?.besichtigungsort_lng ?? null
    }
    if (candLat != null && candLng != null) {
      const reach = await checkSvReachability(supabase, {
        svId: termin.assignee_id,
        candidateLat: Number(candLat),
        candidateLng: Number(candLng),
        candidateStartIso: slot.start,
        candidateEndIso: slot.end,
        ignoreTerminIds: [terminId],
      })
      if (!reach.reachable) {
        return { success: false, error: reach.grund ?? 'SV-Gegenvorschlag ist nicht mehr erreichbar' }
      }
    }
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

  // 2026-05-06: SV-Termin in den Google- + CalDAV-Kalender des SVs
  // schreiben. Non-critical, parallel — Sync-Fehler darf den Termin-Update
  // nicht brechen. Beide no-op'en wenn der jeweilige Provider nicht
  // verbunden ist.
  if (termin.fall_id) {
    const fallId = termin.fall_id as string
    await Promise.all([
      (async () => {
        try {
          const { syncSvTerminToGoogle } = await import('@/lib/google-calendar/sv-termin-sync')
          await syncSvTerminToGoogle(terminId, fallId)
        } catch (err) {
          console.error('[sv-termin-sync] Google Dispatch-Gegenvorschlag:', err)
        }
      })(),
      (async () => {
        try {
          const { syncSvTerminToCalDav } = await import('@/lib/kalender/caldav/sv-termin-sync')
          await syncSvTerminToCalDav(terminId, fallId)
        } catch (err) {
          console.error('[sv-termin-sync] CalDAV Dispatch-Gegenvorschlag:', err)
        }
      })(),
      (async () => {
        try {
          const { syncSvTerminToOutlook } = await import('@/lib/microsoft/sv-termin-sync')
          await syncSvTerminToOutlook(terminId, fallId)
        } catch (err) {
          console.error('[sv-termin-sync] Outlook Dispatch-Gegenvorschlag:', err)
        }
      })(),
    ])
  }

  await supabase.from('timeline').insert({
    fall_id: termin.fall_id ?? null,
    lead_id: !termin.fall_id ? termin.lead_id : null,
    typ: 'termin',
    titel: 'Dispatcher hat SV-Gegenvorschlag akzeptiert',
    beschreibung: `Slot ${slotIndex + 1} angenommen: ${new Date(slot.start).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`,
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
        const datumUhrzeit = `${slotStart.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })} um ${slotStart.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })}`

        // SV-Name aus Termin nachladen — Zwei-Schritt ueber die assignee-Achse.
        // AAR-956 17.07.: das fruehere sachverstaendige(...)-Embed hat auf
        // gutachter_termine KEINEN FK (PGRST200) → die Query starb still und der
        // Fallback 'Ihrem Gutachter' griff immer.
        let svName = 'Ihrem Gutachter'
        const { data: svRowRaw } = await supabase
          .from('gutachter_termine')
          .select('assignee_typ, assignee_id')
          .eq('id', terminId)
          .single()
        const svRow = svRowRaw as { assignee_typ: string | null; assignee_id: string | null } | null
        const profile = await ladeSvAssigneeName(supabase, svRow?.assignee_typ ?? null, svRow?.assignee_id ?? null)
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
  /** AAR-CMM PR B: Wenn übergeben, werden ETA-unerreichbare Slots ausgefiltert. */
  leadId?: string | null
}

/**
 * Un-geguardeter Kern der Slot-Berechnung. Nimmt einen bereits
 * authentifizierten supabase-Client als Param — der Guard passiert im
 * exportierten Wrapper (getNextFreeSlotsForSv) bzw. beim internen Caller
 * (getSvSuggestionsWithSlots, selbst geguarded). Vermeidet N requireAuth-
 * Round-Trips beim Drawer-Load (ein Slot-Fetch je Kandidaten-SV).
 */
async function nextFreeSlotsCore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  svId: string,
  count: number = 3,
  slotDauerMin: number = TERMIN_DAUER_MIN,
  opts?: NextFreeSlotsOpts,
): Promise<{ success: boolean; slots?: SlotCandidate[]; error?: string }> {
  const now = new Date()
  const inZwoelfWochen = new Date(now.getTime() + 12 * 7 * 24 * 60 * 60 * 1000)

  const { data: bestehend } = await supabase
    .from('gutachter_termine')
    // CMM-49 (sv_id-Drop, exhaustive-scan miss): assignee_id+typ statt sv_id (value-identisch).
    .select('start_zeit, end_zeit')
    .eq('assignee_id', svId)
    .eq('assignee_typ', 'sachverstaendiger')
    .not('status', 'in', '("storniert","abgelehnt","abgesagt")')
    .gte('start_zeit', now.toISOString())
    .lte('start_zeit', inZwoelfWochen.toISOString())
    .order('start_zeit', { ascending: true })

  // AAR-CMM PR B: ETA-Reachability-Vorberechnung. Wenn leadId übergeben,
  // laden wir Lead-Besichtigungsort und berechnen ETAs zu allen Termin-
  // Locations dieses SV in einer einzigen Mapbox-Matrix-Call.
  let slotEtaCtx: Awaited<ReturnType<typeof precomputeSvSlotEtas>> | null = null
  if (opts?.leadId) {
    const { data: lead } = await supabase
      .from('leads')
      .select('besichtigungsort_lat, besichtigungsort_lng, fahrzeug_standort_lat, fahrzeug_standort_lng')
      .eq('id', opts.leadId)
      .single()
    const lat =
      (lead as { besichtigungsort_lat: number | null } | null)?.besichtigungsort_lat ??
      (lead as { fahrzeug_standort_lat: number | null } | null)?.fahrzeug_standort_lat ?? null
    const lng =
      (lead as { besichtigungsort_lng: number | null } | null)?.besichtigungsort_lng ??
      (lead as { fahrzeug_standort_lng: number | null } | null)?.fahrzeug_standort_lng ?? null
    if (lat != null && lng != null) {
      slotEtaCtx = await precomputeSvSlotEtas(
        supabase,
        svId,
        { lat: Number(lat), lng: Number(lng) },
        now.toISOString(),
        inZwoelfWochen.toISOString(),
      )
    }
  }

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

  // AAR-958: Slot-Grid in Berlin-Geschaeftszeit (Mo–Fr 09:00–16:00). Auf UTC-
  // Node liefern getHours/getDay/setHours UTC -> +1/+2h-Versatz. Wochentag/
  // Stunde aus der Berlin-Wall-Clock, Tageswechsel via berlinWallClockToUtc
  // (DST-korrekt). `kandidat` bleibt echter UTC-Instant (Konflikt/Output korrekt).
  const berlinParts = (d: Date) => {
    const wall = toBerlinWallClock(d.toISOString())
    return {
      datum: wall.slice(0, 10),
      stunde: Number(wall.slice(11, 13)),
      wochentag: new Date(`${wall.slice(0, 10)}T00:00:00Z`).getUTCDay(),
    }
  }
  const aufBerlinTag9 = (basis: Date, tagePlus: number) => {
    const tag = new Date(`${berlinParts(basis).datum}T00:00:00Z`)
    tag.setUTCDate(tag.getUTCDate() + tagePlus)
    return new Date(berlinWallClockToUtc(`${tag.toISOString().slice(0, 10)}T09:00:00`))
  }
  const weiter = () => {
    kandidat.setTime(kandidat.getTime() + 60 * 60_000)
    if (berlinParts(kandidat).stunde >= 17) kandidat.setTime(aufBerlinTag9(kandidat, 1).getTime())
  }
  // Frühestens morgen 09:00 Berlin — heute anrufen + morgen Termin = normales Tempo.
  kandidat.setTime(aufBerlinTag9(now, 1).getTime())

  const maxIter = 12 * 7 * 24
  let i = 0
  // Obergrenze deutlich höher als `count`, damit wir genug Rohdaten für
  // die Sortierung nach matchType haben. Ohne Wunschtermin wird der Loop
  // ohnehin nach count Treffern verlassen — siehe break unten.
  const rohdatenLimit = useWunschtermin ? Math.max(count * 6, 12) : count

  while (alleKandidaten.length < rohdatenLimit && kandidat < inZwoelfWochen && i < maxIter) {
    i++
    const { stunde, wochentag } = berlinParts(kandidat)
    const iso = wochentag === 0 ? 7 : wochentag
    const istWerktag = wochentag !== 0 && wochentag !== 6
    const passtWochentag = wochentageFilter ? wochentageFilter.has(iso) : istWerktag
    if (passtWochentag && stunde < 16) {
      const slotEnd = new Date(kandidat.getTime() + slotDauerMin * 60_000)
      const konflikt = (bestehend ?? []).some(
        (b) => new Date(b.start_zeit) < slotEnd && new Date(b.end_zeit) > kandidat,
      )
      if (!konflikt) {
        // AAR-CMM PR B: ETA-Reachability — Slot nur vorschlagen wenn SV
        // ihn vom Vortermin erreichen UND zum Folgetermin weiterfahren kann.
        if (slotEtaCtx) {
          const reach = isSlotReachable(kandidat, slotEnd, slotEtaCtx)
          if (!reach.reachable) {
            weiter()
            continue
          }
        }
        alleKandidaten.push({
          start: kandidat.toISOString(),
          end: slotEnd.toISOString(),
          matchType: classify(kandidat, wunschtermin, useWunschtermin),
        })
      }
    }
    weiter()
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

export async function getNextFreeSlotsForSv(
  svId: string,
  count: number = 3,
  slotDauerMin: number = TERMIN_DAUER_MIN,
  opts?: NextFreeSlotsOpts,
): Promise<{ success: boolean; slots?: SlotCandidate[]; error?: string }> {
  const guard = await requireRole(['dispatch', 'admin'])
  if (!guard.success) return { success: false, error: guard.error }
  return nextFreeSlotsCore(guard.supabase, svId, count, slotDauerMin, opts)
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
  // EIN Guard für den ganzen Roundtrip. Die inneren Aufrufe gehen an die
  // un-geguardeten Cores (nicht die geguardeten Exporte) — sonst 2+N
  // requireAuth-Round-Trips pro Drawer-Load. Sicher: [dispatch,admin] ⊆ der
  // list-Rollen-Menge; der KB-Only-Pfad läuft weiter über den exportierten
  // listSvSuggestionsForLead mit eigenem Guard (/mitarbeiter/isochrone).
  const guard = await requireRole(['dispatch', 'admin'])
  if (!guard.success) return { success: false, error: guard.error }
  const supabase = guard.supabase

  const slotsPerSv = opts?.slotsPerSv ?? 3
  const maxSvs = opts?.maxSvs ?? 3
  const slotDauer = opts?.slotDauerMin ?? TERMIN_DAUER_MIN

  const basisResult = await listSvSuggestionsCore(supabase, leadId)
  if (!basisResult.success) {
    return { success: false, error: basisResult.error ?? 'SV-Suche fehlgeschlagen' }
  }
  const basis = basisResult.suggestions ?? []
  if (basis.length === 0) return { success: true, suggestions: [] }

  // Wunschtermin + Wochentage aus leads laden — gleicher Payload den
  // SvDispatchPanel bereits kennt, aber hier zentral gebündelt.
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
      const r = await nextFreeSlotsCore(supabase, cand.svId, slotsPerSv, slotDauer, {
        wunschterminIso,
        wunschterminWochentage,
        prioritizeAroundWunschtermin: true,
        leadId,
      })
      return { cand, slots: r.success ? r.slots ?? [] : [] }
    }),
  )

  return {
    success: true,
    suggestions: slotsPerCandidate.map(({ cand, slots }) => ({ ...cand, slots })),
  }
}
