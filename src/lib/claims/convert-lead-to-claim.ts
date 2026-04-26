'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

type ConvertResult =
  | { ok: true; claim_id: string; claim_nummer: string }
  | { ok: false; error: string }

// Mindest-Pflichtfelder für Dispatcher-Konversion (Phone-Lead)
const PFLICHTFELDER_DISPATCHER: (string)[] = [
  'unfalldatum',
  'schadens_fall_typ',
]

// Zusätzliche Pflichtfelder für Self-Service-Konversion
const PFLICHTFELDER_SELF_SERVICE: (string)[] = [
  'unfalldatum',
  'schadens_fall_typ',
  'kunden_konstellation',
  'unfallort',
]

function validateLeadCompleteness(
  lead: Record<string, unknown>,
  modus: 'dispatcher' | 'self_service',
): string[] {
  const felder =
    modus === 'self_service' ? PFLICHTFELDER_SELF_SERVICE : PFLICHTFELDER_DISPATCHER
  return felder.filter((f) => !lead[f])
}

const VALID_SCHADENARTEN = [
  'haftpflicht',
  'vollkasko',
  'teilkasko',
  'eigenverschulden',
  'unbekannt',
] as const

function toSchadenart(raw: string | null | undefined): string {
  const v = (raw ?? '').toLowerCase().trim()
  return (VALID_SCHADENARTEN as readonly string[]).includes(v) ? v : 'unbekannt'
}

/**
 * Konvertiert einen bestehenden Lead zu einem Claim.
 *
 * Aufgerufen von:
 *   - Dispatcher-Portal: "Lead konvertieren"-Button
 *   - Self-Service-Portal: Kunde klickt "Schaden absenden"
 *
 * Idempotent: falls lead.konvertiert_zu_claim_id schon gesetzt → gibt vorhandene
 * claim_id zurück ohne Duplikat anzulegen.
 */
export async function convertLeadToClaim(leadId: string): Promise<ConvertResult> {
  const db = await createClient()
  const admin = createAdminClient()

  // Auth-Check
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht authentifiziert.' }

  // Profil + Rolle laden
  const { data: profil } = await admin
    .from('profiles')
    .select('id, rolle')
    .eq('id', user.id)
    .single()
  if (!profil) return { ok: false, error: 'Profil nicht gefunden.' }

  const erlaubteRollen = ['admin', 'dispatch', 'kundenbetreuer']
  if (!erlaubteRollen.includes(profil.rolle as string)) {
    return { ok: false, error: 'Keine Berechtigung zur Claim-Konversion.' }
  }

  // Lead laden
  const { data: lead, error: leadErr } = await admin
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()
  if (leadErr || !lead) return { ok: false, error: 'Lead nicht gefunden.' }

  // Idempotenz: bereits konvertiert?
  if (lead.konvertiert_zu_claim_id) {
    const { data: bestehendar } = await admin
      .from('claims')
      .select('id, claim_nummer')
      .eq('id', lead.konvertiert_zu_claim_id as string)
      .single()
    if (bestehendar) {
      return {
        ok: true,
        claim_id: bestehendar.id as string,
        claim_nummer: bestehendar.claim_nummer as string,
      }
    }
  }

  // Vollständigkeits-Prüfung
  const modus = (lead.source_channel === 'self_service_portal' ||
    lead.qualifizierungs_phase === 'flow-gesendet')
    ? 'self_service'
    : 'dispatcher'

  const fehlende = validateLeadCompleteness(lead as Record<string, unknown>, modus)
  if (fehlende.length > 0) {
    // Lead als unvollständig markieren
    await admin
      .from('leads')
      .update({ fehlende_felder_jsonb: fehlende, updated_at: new Date().toISOString() })
      .eq('id', leadId)
    return {
      ok: false,
      error: `Lead unvollständig. Fehlende Felder: ${fehlende.join(', ')}`,
    }
  }

  const schadentag =
    (lead.unfalldatum as string | null) ??
    (lead.created_at as string).slice(0, 10)

  // Claim anlegen
  const { data: claim, error: claimErr } = await admin
    .from('claims')
    .insert({
      lead_id: leadId,
      vehicle_id: (lead.vehicle_id as string | null) ?? null,
      schadentag,
      schadenort_adresse: (lead.unfallort as string | null) ?? null,
      schadenort_lat: (lead.unfallort_lat as number | null) ?? null,
      schadenort_lng: (lead.unfallort_lng as number | null) ?? null,
      schadenort_kategorie: (lead.unfallort_kategorie as string | null) ?? null,
      hergang_kunde_text: (lead.unfallhergang as string | null) ?? (lead.schadens_hergang as string | null) ?? null,
      schadenart: toSchadenart(lead.schadens_art as string | null),
      fall_typ: (lead.schadens_fall_typ as string | null) ?? null,
      unfall_konstellation: (lead.unfall_konstellation as string | null) ?? null,
      fahrerflucht: (lead.fahrerflucht as boolean | null) ?? null,
      auslandskennzeichen: (lead.auslandskennzeichen as boolean | null) ?? null,
      polizei_aktenzeichen: (lead.polizei_aktenzeichen as string | null) ?? null,
      polizei_bericht_vorhanden: (lead.polizei_bericht_vorhanden as boolean | null) ?? false,
      polizei_vor_ort: (lead.polizei_vor_ort as boolean | null) ?? false,
      polizeibericht_status: (lead.polizeibericht_status as string | null) ?? null,
      bkat_unfallart: (lead.bkat_unfallart as string | null) ?? null,
      geschaedigter_user_id: (lead.zugewiesen_an as string | null) ?? null,
      gegner_versicherung_id: (lead.gegner_versicherung_id as string | null) ?? null,
      gegner_versicherungsnummer: (lead.eigene_policennr as string | null) ?? null,
      gegner_aktenzeichen: (lead.gegner_schadennummer as string | null) ?? null,
      gegner_bekannt: (lead.gegner_bekannt as boolean | null) ?? true,
      anzahl_beteiligte_total: ((lead.gegner_anzahl_beteiligte as number | null) ?? 0) + 1,
      hat_personenschaden: (lead.personenschaden_flag as boolean | null) ?? false,
      hat_mietwagen: (lead.mietwagen_flag as boolean | null) ?? false,
      hat_nutzungsausfall: (lead.nutzungsausfall as boolean | null) ?? false,
      hat_sachschaden: (lead.sachschaden_flag as boolean | null) ?? false,
      sachschaden_beschreibung: (lead.sachschaden_beschreibung as string | null) ?? null,
      halter_ungleich_fahrer: (lead.halter_ungleich_fahrer_flag as boolean | null) ?? false,
      kunden_konstellation: (lead.kunden_konstellation as string | null) ?? null,
      status: 'dispatch_done',
      created_by_user_id: user.id,
      created_via: 'lead_konvertierung',
    })
    .select('id, claim_nummer')
    .single()

  if (claimErr || !claim) {
    return { ok: false, error: `Claim-Anlage fehlgeschlagen: ${claimErr?.message ?? 'Unbekannter Fehler'}` }
  }

  // claim_parties — Geschädigter aus Lead-Snapshot
  const geschaedigterParty = await admin
    .from('claim_parties')
    .insert({
      claim_id: claim.id,
      rolle: 'geschaedigter',
      reihenfolge: 1,
      user_id: (lead.zugewiesen_an as string | null) ?? null,
      vorname: (lead.halter_vorname as string | null) ?? (lead.vorname as string | null) ?? null,
      nachname: (lead.halter_nachname as string | null) ?? (lead.nachname as string | null) ?? '(unbekannt)',
      geburtsdatum: (lead.halter_geburtsdatum as string | null) ?? null,
      telefon: (lead.halter_telefon as string | null) ?? (lead.telefon as string | null) ?? null,
      email: (lead.halter_email as string | null) ?? (lead.email as string | null) ?? null,
      adresse_strasse: (lead.halter_strasse as string | null) ?? (lead.kunde_strasse as string | null) ?? null,
      adresse_plz: (lead.halter_plz as string | null) ?? (lead.kunde_plz as string | null) ?? null,
      adresse_ort: (lead.halter_stadt as string | null) ?? (lead.kunde_stadt as string | null) ?? null,
      ist_halter: (lead.ist_fahrzeughalter as boolean | null) ?? true,
      ist_fahrer: !((lead.halter_ungleich_fahrer_flag as boolean | null) ?? false),
      kennzeichen: (lead.kennzeichen as string | null) ?? null,
      vehicle_id: (lead.vehicle_id as string | null) ?? null,
      quelle: 'lead_konvertierung',
      created_at: new Date().toISOString(),
      created_by_user_id: user.id,
    })
    .select('id')
    .single()

  if (geschaedigterParty.data) {
    await admin
      .from('claims')
      .update({ geschaedigter_party_id: geschaedigterParty.data.id })
      .eq('id', claim.id)
  }

  // claim_parties — Verursacher falls bekannt
  if (lead.gegner_bekannt && (lead.gegner_name || lead.gegner_kennzeichen)) {
    const gegnerName = lead.gegner_name as string | null
    const istFirma = gegnerName
      ? /\b(GmbH|AG|KG|UG|GbR|e\.K\.|e\.V\.|OHG)\b/i.test(gegnerName)
      : false

    const verursacherParty = await admin
      .from('claim_parties')
      .insert({
        claim_id: claim.id,
        rolle: 'verursacher',
        reihenfolge: 2,
        user_id: null,
        nachname: istFirma ? null : (gegnerName ?? '(unbekannter Halter)'),
        firma: istFirma ? gegnerName : null,
        ist_gewerbe: istFirma,
        kennzeichen: (lead.gegner_kennzeichen as string | null) ?? null,
        versicherung_id: (lead.gegner_versicherung_id as string | null) ?? null,
        versicherungsnummer: null,
        versicherungs_aktenzeichen: (lead.gegner_schadennummer as string | null) ?? null,
        quelle: 'lead_konvertierung',
        created_at: new Date().toISOString(),
        created_by_user_id: user.id,
      })
      .select('id')
      .single()

    if (verursacherParty.data) {
      await admin
        .from('claims')
        .update({ verursacher_party_id: verursacherParty.data.id })
        .eq('id', claim.id)
    }
  }

  // Lead als konvertiert markieren
  await admin
    .from('leads')
    .update({
      konvertiert_zu_claim_id: claim.id,
      konvertiert_am: new Date().toISOString(),
      konvertiert_durch_user_id: user.id,
      qualifizierungs_phase: 'konvertiert',
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  // Faelle-Link nachziehen wenn vorhanden (bestehender Dual-Write-Kompatibilität)
  await admin
    .from('faelle')
    .update({ claim_id: claim.id })
    .eq('konvertiert_zu_fall_id', leadId)
    .is('claim_id', null)

  revalidatePath('/dispatch/leads')
  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/admin/faelle')
  revalidatePath('/kb/claims')

  return {
    ok: true,
    claim_id: claim.id as string,
    claim_nummer: claim.claim_nummer as string,
  }
}
