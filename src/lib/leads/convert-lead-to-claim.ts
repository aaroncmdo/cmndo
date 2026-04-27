// CMM-3 (Phase 0.5): Lead → Claim Konvertierungs-Pipeline.
//
// HEUTE (kaputt): `signSAandCreateFall` baut zuerst einen `faelle`-Row
// aus dem Lead (über buildFallInsertFromLead) und ruft dann nachträglich
// `createClaimForFall`. Daraus folgt: der Claim entsteht *nach* dem Fall —
// die Drift-Quelle der gesamten Welle-7-UI-Probleme.
//
// NEU (diese Funktion): Lead → Claim direkt. Schritte:
//   1. Idempotenz-Check via leads.konvertiert_zu_claim_id
//   2. Lead vollständig laden (admin client, RLS bypass)
//   3. claims insert — alle 60+ Schadensspalten + lead_id-Tag
//   4. claim_parties insert — Geschädigter (immer), Verursacher (wenn bekannt)
//   5. claim_vehicle_involvements insert — geschädigtes + ggf. gegnerisches Fahrzeug
//   6. fall_nummer generieren (CLM-YYYYMMDD-NNN)
//   7. KB Round-Robin falls nicht zugewiesen
//   8. faelle-Row anlegen — VOLLSTÄNDIG mit Schadensdaten (Frontend liest das
//      bis Phase 6 noch). Bridge: faelle.claim_id = claim.id.
//   9. leads-Update: status='umgewandelt', konvertiert_zu_claim_id,
//      konvertiert_zu_fall_id, konvertiert_am, konvertiert_durch_user_id
//   10. Bei Fehler in 4-9: Cleanup (delete claim → sub-entities CASCADE).
//
// Caller: signSAandCreateFall (Flow), signup-and-convert, dispatch-fall-actions.
//
// Wichtig:
//   - Diese Funktion lebt zusammen mit buildFallInsertFromLead aus
//     lead-fall-mapping.ts während der Übergangsphase. In Phase 6 wird
//     buildFallInsertFromLead gelöscht und faelle bekommt nur noch
//     Assignment-Spalten (siehe docs/claim-as-ssot-umbau.md).
//   - Die Funktion arbeitet mit Admin-Client (service_role), weil sie
//     RLS-Boundary-übergreifend Lead, Claim, Fall und Profiles anfasst.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildFallInsertFromLead,
  resolveFallEntityFks,
} from '@/lib/lead-fall-mapping'
import type { ClaimInsert } from '@/lib/claims/types'

export type ConvertLeadToClaimInput = {
  leadId: string
  /** Wer hat die Konvertierung ausgelöst (Dispatcher/Kunde/Admin). Wird in Audit + claims.created_by_user_id geschrieben. */
  triggerByUserId?: string | null
  /** Optional: bereits zugewiesener KB. Wenn nicht angegeben → Round-Robin auf Profile-Counts. */
  kundenbetreuerId?: string | null
  /** Optional: bereits zugewiesener SV (aus Termin-Buchung im Flow). */
  svIdFromTermin?: string | null
  /** Optional: Signatur-URL aus dem SA-Flow. Wird in faelle.abtretung_pdf gespiegelt. */
  signatureUrl?: string
  /** Optional: Kunde-User-ID (z.B. nach Signup). Überschreibt lead.kunde_id. */
  kundeUserIdOverride?: string | null
}

export type ConvertLeadToClaimResult =
  | {
      ok: true
      claimId: string
      fallId: string
      claimNummer: string | null
      fallNummer: string
      kundenbetreuerId: string | null
      idempotent: boolean
    }
  | { ok: false; error: string }

const VALID_SCHADENARTEN = [
  'haftpflicht',
  'vollkasko',
  'teilkasko',
  'eigenverschulden',
  'unbekannt',
] as const

export async function convertLeadToClaim(
  input: ConvertLeadToClaimInput,
): Promise<ConvertLeadToClaimResult> {
  const admin = createAdminClient()

  // ─── Schritt 1: Idempotenz-Check ────────────────────────────────────────
  const { data: existing, error: leadFetchErr } = await admin
    .from('leads')
    .select('*')
    .eq('id', input.leadId)
    .maybeSingle()

  if (leadFetchErr || !existing) {
    return { ok: false, error: `Lead ${input.leadId} nicht gefunden` }
  }

  if (existing.konvertiert_zu_claim_id && existing.konvertiert_zu_fall_id) {
    // Schon konvertiert — gleiche Antwort wie beim ersten Mal
    return {
      ok: true,
      claimId: existing.konvertiert_zu_claim_id as string,
      fallId: existing.konvertiert_zu_fall_id as string,
      claimNummer: null,
      fallNummer: '', // Caller kennt sie meist eh nicht
      kundenbetreuerId: null,
      idempotent: true,
    }
  }

  const lead = existing as Record<string, unknown>
  const kundeUserId =
    (input.kundeUserIdOverride as string | null | undefined) ??
    (lead.kunde_id as string | null) ??
    null

  // ─── Schritt 7a: KB Round-Robin (falls nicht angegeben) ─────────────────
  let kundenbetreuerId: string | null =
    input.kundenbetreuerId ?? (lead.zugewiesen_an as string | null) ?? null
  if (!kundenbetreuerId) {
    kundenbetreuerId = await pickKundenbetreuerRoundRobin(admin)
  }

  // ─── Schritt 6: fall_nummer generieren ──────────────────────────────────
  const fallNummer = await generateFallNummer(admin)

  // ─── Schritt 3: claims-Insert ───────────────────────────────────────────
  const schadentag =
    (lead.unfalldatum as string | null) ??
    (lead.created_at ? String(lead.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10))

  const schadenartRaw = String(lead.schadens_art ?? '')
    .toLowerCase()
    .trim()
  const schadenart = (VALID_SCHADENARTEN as readonly string[]).includes(schadenartRaw)
    ? schadenartRaw
    : 'unbekannt'

  const claimsInsert: ClaimInsert = {
    // — Lead-Tag (Audit)
    lead_id: input.leadId,
    created_via: 'lead_konvertierung',
    created_by_user_id: input.triggerByUserId ?? null,

    // — Schadensereignis
    schadentag,
    schadenzeit: (lead.unfall_uhrzeit as string | null) ?? null,
    schadenart,
    fall_typ: (lead.schadens_fall_typ as string | null) ?? null,
    ursache: (lead.schadensursache as string | null) ?? null,
    unfall_konstellation: (lead.unfall_konstellation as string | null) ?? null,

    // — Schadensort (aus unfallort + Geo)
    schadenort_adresse:
      (lead.unfallort as string | null) ??
      (lead.fahrzeug_standort_adresse as string | null) ??
      null,
    schadenort_plz: (lead.fahrzeug_standort_plz as string | null) ?? null,
    schadenort_ort: null,
    schadenort_lat: (lead.kunde_lat as number | null) ?? null,
    schadenort_lng: (lead.kunde_lng as number | null) ?? null,
    schadenort_kategorie: (lead.unfallort_kategorie as string | null) ?? null,
    schadenort_land: 'DE',

    // — Hergang
    hergang_kunde_text:
      (lead.unfallhergang as string | null) ??
      (lead.schadens_hergang as string | null) ??
      (lead.fahrzeugschaden_beschreibung as string | null) ??
      null,

    // — Polizei
    polizei_aktenzeichen: (lead.polizei_aktenzeichen as string | null) ?? null,
    polizei_bericht_vorhanden: Boolean(lead.polizeibericht_pflicht ?? false),
    polizei_vor_ort: Boolean(lead.polizei_vor_ort ?? false),
    bkat_unfallart: (lead.bkat_unfallart as string | null) ?? null,

    // — Flags
    fahrerflucht: (lead.fahrerflucht as boolean | null) ?? null,
    auslandskennzeichen: (lead.auslandskennzeichen as boolean | null) ?? null,
    halter_ungleich_fahrer: !((lead.ist_fahrzeughalter as boolean | null) ?? true),

    // — Schaden-Flags
    hat_personenschaden: Boolean(lead.personenschaden_flag ?? false),
    hat_mietwagen: Boolean(lead.mietwagen_flag ?? false),
    hat_nutzungsausfall: Boolean(lead.nutzungsausfall ?? false),
    hat_sachschaden: Boolean(lead.sachschaden_flag ?? false),
    sachschaden_beschreibung:
      (lead.sachschaden_beschreibung as string | null) ?? null,
    hat_abschleppung: false,

    // — Fahrzeug
    vehicle_id: (lead.vehicle_id as string | null) ?? null,

    // — Geschädigter
    geschaedigter_user_id: kundeUserId,

    // — Gegner
    gegner_bekannt: (lead.gegner_bekannt as boolean | null) ?? true,
    gegner_versicherung_id: (lead.gegner_versicherung_id as string | null) ?? null,
    gegner_versicherungsnummer: null, // Lead hat heute keine separate Spalte
    gegner_aktenzeichen: null,
    anzahl_beteiligte_total:
      ((lead.gegner_anzahl_beteiligte as number | null) ?? 0) + 1,

    // — Klassifikation
    kunden_konstellation: (lead.kunden_konstellation as string | null) ?? null,

    // — Skizze
    unfallskizze_url: (lead.unfallskizze_url as string | null) ?? null,
    unfallskizze_svg: (lead.unfallskizze_svg as string | null) ?? null,
    unfallskizze_bestaetigt:
      (lead.unfallskizze_bestaetigt as boolean | null) ?? null,
    unfallskizze_ablehnung_grund:
      (lead.unfallskizze_ablehnung_grund as string | null) ?? null,
    unfallskizze_generiert_am:
      (lead.unfallskizze_generiert_am as string | null) ?? null,

    // — Welle-7 Defaults
    phase: '1_neu',
    status: 'dispatch_done',
    kundenbetreuer_id: kundenbetreuerId,
    kanzlei_wunsch: 'unentschieden',
  }

  const { data: claim, error: claimErr } = await admin
    .from('claims')
    .insert(claimsInsert)
    .select('id, claim_nummer')
    .single()

  if (claimErr || !claim) {
    return {
      ok: false,
      error: `Claim-Insert fehlgeschlagen: ${claimErr?.message ?? 'unbekannt'}`,
    }
  }

  const claimId = claim.id as string
  const claimNummer = (claim.claim_nummer as string | null) ?? null

  // ─── Cleanup-Wrapper ────────────────────────────────────────────────────
  // Bei Fehler in den Folge-Steps löschen wir den Claim wieder. Sub-Entities
  // werden via FK CASCADE entfernt.
  const cleanupAndFail = async (msg: string): Promise<ConvertLeadToClaimResult> => {
    await admin.from('claims').delete().eq('id', claimId)
    return { ok: false, error: msg }
  }

  // ─── Schritt 4: claim_parties ───────────────────────────────────────────
  const partyInserts: Array<Record<string, unknown>> = [
    {
      claim_id: claimId,
      rolle: 'geschaedigter',
      reihenfolge: 1,
      user_id: kundeUserId,
      vorname: (lead.vorname as string | null) ?? null,
      nachname: (lead.nachname as string | null) ?? null,
      email: (lead.email as string | null) ?? null,
      telefon: (lead.telefon as string | null) ?? null,
      mobil: (lead.telefon as string | null) ?? null,
      adresse_strasse: (lead.kunde_strasse as string | null) ?? null,
      adresse_plz: (lead.kunde_plz as string | null) ?? null,
      adresse_ort: (lead.kunde_stadt as string | null) ?? null,
      adresse_land: 'DE',
      ist_halter: (lead.ist_fahrzeughalter as boolean | null) ?? true,
      ist_fahrer: !((lead.halter_ungleich_fahrer_flag as boolean | null) ?? false),
      ist_gewerbe: Boolean(lead.gewerbe_flag ?? false),
      ist_aktiv: true,
      ist_anonymisiert: false,
      ist_eingeladen_via_airdrop: false,
      hat_personenschaden: Boolean(lead.personenschaden_flag ?? false),
      vehicle_id: (lead.vehicle_id as string | null) ?? null,
      kennzeichen: (lead.kennzeichen as string | null) ?? null,
      quelle: 'lead_konvertierung',
      created_by_user_id: input.triggerByUserId ?? null,
    },
  ]

  // Zweite Party: Verursacher (wenn bekannt)
  if (lead.gegner_bekannt && lead.gegner_name) {
    partyInserts.push({
      claim_id: claimId,
      rolle: 'verursacher',
      reihenfolge: 2,
      // gegner_name ist freitext — wir packen den ganzen String in nachname
      nachname: (lead.gegner_name as string | null) ?? null,
      kennzeichen: (lead.gegner_kennzeichen as string | null) ?? null,
      fahrzeugtyp_klartext: (lead.gegner_fahrzeugtyp as string | null) ?? null,
      versicherung_id: (lead.gegner_versicherung_id as string | null) ?? null,
      versicherung_klartext: (lead.gegner_versicherung as string | null) ?? null,
      adresse_land: 'DE',
      ist_halter: false,
      ist_fahrer: false,
      ist_gewerbe: false,
      ist_aktiv: true,
      ist_anonymisiert: false,
      ist_eingeladen_via_airdrop: false,
      hat_personenschaden: false,
      quelle: 'lead_konvertierung',
      created_by_user_id: input.triggerByUserId ?? null,
    })
  }

  const { error: partiesErr } = await admin
    .from('claim_parties')
    .insert(partyInserts)
  if (partiesErr) {
    return cleanupAndFail(
      `claim_parties-Insert fehlgeschlagen: ${partiesErr.message}`,
    )
  }

  // ─── Schritt 5: claim_vehicle_involvements ──────────────────────────────
  // Wir legen ein Involvement für das geschädigte Fahrzeug an, sofern das
  // Lead eine vehicle_id hat. Gegnerisches Fahrzeug erst wenn wir später
  // auch dessen vehicles-Row anlegen — heute hat das Lead nur Klartext.
  if (lead.vehicle_id) {
    const { error: cviErr } = await admin
      .from('claim_vehicle_involvements')
      .insert([
        {
          claim_id: claimId,
          vehicle_id: lead.vehicle_id as string,
          rolle: 'geschaedigt',
          reihenfolge: 1,
        },
      ])
    if (cviErr) {
      return cleanupAndFail(
        `claim_vehicle_involvements-Insert fehlgeschlagen: ${cviErr.message}`,
      )
    }
  }

  // ─── Schritt 8: faelle-Row (Übergangs-Phase: vollständig) ───────────────
  // Bis Phase 6 wird faelle weiter mit allen Schadendaten gefüllt, weil das
  // Frontend das noch liest. Phase 6 dropt diese Spalten und macht faelle
  // zur reinen Assignment-Tabelle. Dafür bleibt buildFallInsertFromLead
  // bewusst unverändert — wir setzen nur ZUSÄTZLICH faelle.claim_id.
  const entityFks = await resolveFallEntityFks(
    admin,
    lead as never,
    input.svIdFromTermin ?? null,
  )
  const fallInsert = buildFallInsertFromLead(lead as never, {
    fallNummer,
    kundenbetreuerId,
    svIdFromTermin: input.svIdFromTermin ?? null,
    signatureUrl: input.signatureUrl ?? '',
    ...entityFks,
  })
  // Bridge: faelle.claim_id zeigt auf den eben angelegten Claim
  fallInsert.claim_id = claimId
  // Kunde-User-ID auf den Fall heften (Frontend nutzt das noch)
  if (kundeUserId) {
    fallInsert.kunde_id = kundeUserId
  }

  const { data: fall, error: fallErr } = await admin
    .from('faelle')
    .insert(fallInsert as never)
    .select('id')
    .single()
  if (fallErr || !fall) {
    return cleanupAndFail(
      `Fall-Insert fehlgeschlagen: ${fallErr?.message ?? 'unbekannt'}`,
    )
  }

  const fallId = fall.id as string

  // ─── Schritt 9: leads-Update — Konvertiert-Status setzen ────────────────
  const now = new Date().toISOString()
  const { error: leadUpdErr } = await admin
    .from('leads')
    .update({
      status: 'umgewandelt',
      qualifizierungs_phase: 'abgeschlossen',
      konvertiert_am: now,
      konvertiert_durch_user_id: input.triggerByUserId ?? null,
      konvertiert_zu_claim_id: claimId,
      konvertiert_zu_fall_id: fallId,
      updated_at: now,
    })
    .eq('id', input.leadId)
  if (leadUpdErr) {
    // Hier kein Cleanup — Claim und Fall sind valide, nur das Lead-Update
    // hat versagt. Caller bekommt success=true mit warning im Log.
    console.error('[convertLeadToClaim] leads-Update fehlgeschlagen:', leadUpdErr)
  }

  return {
    ok: true,
    claimId,
    fallId,
    claimNummer,
    fallNummer,
    kundenbetreuerId,
    idempotent: false,
  }
}

// ─── Helper: fall_nummer Generator ──────────────────────────────────────────
async function generateFallNummer(
  admin: ReturnType<typeof createAdminClient>,
): Promise<string> {
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
  const { count } = await admin
    .from('faelle')
    .select('id', { count: 'exact', head: true })
    .like('fall_nummer', `CLM-${dateStr}-%`)
  const nr = String((count ?? 0) + 1).padStart(3, '0')
  return `CLM-${dateStr}-${nr}`
}

// ─── Helper: KB Round-Robin (min aktive Fälle gewinnt) ──────────────────────
async function pickKundenbetreuerRoundRobin(
  admin: ReturnType<typeof createAdminClient>,
): Promise<string | null> {
  const { data: betreuer } = await admin
    .from('profiles')
    .select('id')
    .in('rolle', ['kundenbetreuer', 'admin'])
    .limit(20)

  if (!betreuer || betreuer.length === 0) return null

  const counts: Record<string, number> = {}
  for (const b of betreuer) {
    const { count } = await admin
      .from('faelle')
      .select('id', { count: 'exact', head: true })
      .eq('kundenbetreuer_id', b.id as string)
      .not('status', 'in', '("abgeschlossen","storniert","reguliert","abgelehnt")')
    counts[b.id as string] = count ?? 0
  }

  return betreuer.reduce(
    (m, b) =>
      (counts[b.id as string] ?? 0) < (counts[m.id as string] ?? 0) ? b : m,
    betreuer[0],
  ).id as string
}
