import { createAdminClient } from '@/lib/supabase/admin'
import {
  anlegePartnerKern,
  type PartnerAnlageInput,
} from '@/lib/partner/anlege-partner'
import type { PartnerRolle } from '@/lib/partner/policy'
import { geocodePartnerLead } from '@/lib/partner/geocode-partner-lead'

// Idempotente Konvertierung eines partner_leads-Prospects in einen echten Partner-Account.
// Spiegelt das bewaehrte convert-lead-to-claim-Muster: Lead laden -> Idempotenz-Guard ->
// anlegePartnerKern (rollbackt seinen halben Account selbst) -> partner_leads update (aktiv).
// KEIN 'use server' (importierbar von Server-Actions + Crons).

/** Minimales Lead-Shape das mapLeadZuAnlageInput konsumiert (partner_leads-Row-Teilmenge). */
export type PartnerLeadRow = {
  id: string
  rolle: PartnerRolle
  firma: string | null
  ansprechpartner_vorname: string | null
  ansprechpartner_nachname: string | null
  email: string
  telefon: string | null
  plz: string | null
  ort: string | null
  strasse: string | null
  lat: number | null
  lng: number | null
  rollen_details: Record<string, unknown> | null
  konvertiert_zu_user_id: string | null
  konvertiert_zu_partner_id?: string | null
}

/** Pure: partner_leads-Row -> PartnerAnlageInput (rollen_details wird durchgereicht). */
export function mapLeadZuAnlageInput(
  lead: PartnerLeadRow,
  aktiviertVon: string | null = null,
): PartnerAnlageInput {
  return {
    firma: lead.firma ?? '',
    ansprechpartnerVorname: lead.ansprechpartner_vorname ?? '',
    ansprechpartnerNachname: lead.ansprechpartner_nachname ?? '',
    email: lead.email.trim().toLowerCase(),
    telefon: lead.telefon,
    plz: lead.plz,
    ort: lead.ort,
    lat: lead.lat ?? null,
    lng: lead.lng ?? null,
    aktiviertVon,
    rollenDetails: lead.rollen_details ?? {},
  }
}

/** Pure: true wenn der Lead bereits einen Account bekommen hat (Idempotenz-Wachter). */
export function istBereitsKonvertiert(lead: PartnerLeadRow): boolean {
  return Boolean(lead.konvertiert_zu_user_id)
}

export type ConvertPartnerLeadResult =
  | { ok: true; userId: string; partnerId: string }
  | { ok: false; error: string }

export async function convertPartnerLead(
  partnerLeadId: string,
  opts?: { durchUserId?: string | null },
): Promise<ConvertPartnerLeadResult> {
  const admin = createAdminClient()
  const durchUserId = opts?.durchUserId ?? null

  // 1) Lead laden
  const { data: lead, error: loadErr } = await admin
    .from('partner_leads')
    .select(
      'id, rolle, firma, ansprechpartner_vorname, ansprechpartner_nachname, email, telefon, plz, ort, strasse, lat, lng, rollen_details, konvertiert_zu_user_id, konvertiert_zu_partner_id',
    )
    .eq('id', partnerLeadId)
    .maybeSingle()
  if (loadErr) return { ok: false, error: loadErr.message }
  if (!lead) return { ok: false, error: 'Partner-Lead nicht gefunden.' }

  const typedLead = lead as PartnerLeadRow

  // 2) Idempotenz-Guard — bereits konvertiert -> frueh zurueck (kein Doppel-Account)
  if (istBereitsKonvertiert(typedLead)) {
    return {
      ok: true,
      userId: typedLead.konvertiert_zu_user_id as string,
      partnerId: (typedLead.konvertiert_zu_partner_id ?? '') as string,
    }
  }

  // 2b) Koordinaten-Guard — Werkstatt MUSS geokodiert sein (erscheint auf Karte/Finder).
  //     SV ausgenommen (laeuft ueber Isochrone-Geologik); makler hat keine Koordinaten-Spalte.
  //     Bestandsleads ohne Intake-Geocode (vor dem Mapbox-Fix angelegt, lat/lng=null) werden
  //     hier on-demand nachgeholt statt hart geblockt — sonst waere jeder solche werkstatt-
  //     Convert eine unfixbare Sackgasse. geocodePartnerLead nutzt jetzt geocodeMitFallback (Mapbox).
  if (typedLead.rolle === 'werkstatt' && (typedLead.lat == null || typedLead.lng == null)) {
    const geo = await geocodePartnerLead({
      strasse: typedLead.strasse,
      plz: typedLead.plz,
      ort: typedLead.ort,
    })
    if (!geo.ok) {
      return {
        ok: false,
        error: 'Adresse unvollständig/nicht geokodiert — bitte im Lead ergänzen, dann konvertieren.',
      }
    }
    typedLead.lat = geo.lat
    typedLead.lng = geo.lng
    // Koordinaten am Lead persistieren (Karte + kuenftige Converts sehen sie sofort).
    await admin
      .from('partner_leads')
      .update({ lat: geo.lat, lng: geo.lng, google_place_id: geo.place_id })
      .eq('id', partnerLeadId)
  }

  // 3) Account anlegen (anlegePartnerKern rollbackt seinen halben Account bei Fehler selbst)
  const anlage = await anlegePartnerKern(
    admin,
    typedLead.rolle,
    mapLeadZuAnlageInput(typedLead, durchUserId),
  )
  if (!anlage.ok) return { ok: false, error: anlage.error }

  // 4) Lead als aktiv/konvertiert markieren.
  const { error: updErr } = await admin
    .from('partner_leads')
    .update({
      status: 'aktiv',
      konvertiert_zu_user_id: anlage.userId,
      konvertiert_zu_partner_id: anlage.partnerId,
      konvertiert_am: new Date().toISOString(),
      konvertiert_durch: durchUserId,
      aktualisiert_am: new Date().toISOString(),
    })
    .eq('id', partnerLeadId)
  if (updErr) {
    // Account steht bereits; der Lead-Status-Write scheiterte. Nicht rollbacken (Account ist gueltig),
    // aber Fehler melden, damit der Caller den Lead-Status manuell nachziehen kann.
    console.error(
      '[convertPartnerLead] Account angelegt, aber partner_leads-Update fehlgeschlagen:',
      updErr.message,
    )
    return { ok: false, error: `Account angelegt, Lead-Status-Update fehlgeschlagen: ${updErr.message}` }
  }

  return { ok: true, userId: anlage.userId, partnerId: anlage.partnerId }
}
