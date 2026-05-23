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
//   6. (entfaellt — CMM-44 SP-A3: claim_nummer kommt vom DB-Trigger)
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
import { upsertKanzleiFall } from '@/lib/kanzlei-fall/upsert-kanzlei-fall'
import { parseUhrzeit } from '@/lib/format/zeit'
import type { ClaimInsert } from '@/lib/claims/types'

export type ConvertLeadToClaimInput = {
  leadId: string
  /** Wer hat die Konvertierung ausgelöst (Dispatcher/Kunde/Admin). Wird in Audit + claims.created_by_user_id geschrieben. */
  triggerByUserId?: string | null
  /** Optional: bereits zugewiesener KB. Wenn nicht angegeben → Round-Robin auf Profile-Counts. */
  kundenbetreuerId?: string | null
  /** Optional: bereits zugewiesener SV (aus Termin-Buchung im Flow). */
  svIdFromTermin?: string | null
  /** Optional: Signatur-URL aus dem SA-Flow. Wird in claims.abtretung_pdf geschrieben (SSoT). */
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

  // CMM-44 SP-A3: Schritt 6 (Aktennummer-Generator fuer faelle) entfernt. Die
  // kanonische Aktennummer ist claims.claim_nummer, vom DB-Trigger
  // set_claim_nummer beim Claim-Insert befuellt — siehe claimNummer unten.

  // CMM-44 SP-A: Entity-FKs (u.a. Gegner-Versicherungs-Fuzzy-Match) vorab
  // resolven, damit der Fallback fuer claims.gegner_versicherung_id im
  // claimsInsert greift. Frueher lag der Fallback nur in buildFallInsertFromLead
  // auf der faelle-Seite — mit dem DUP-Spalten-Sweep wandert er nach claims.
  const entityFks = await resolveFallEntityFks(
    admin,
    lead as never,
    input.svIdFromTermin ?? null,
  )

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
    // CMM-26: schadenzeit ist eine `time`-Spalte, lead.unfall_uhrzeit kann aber
    // freier Text sein („14 uhr"). Defensive Normalisierung — bei ungültigem
    // Format wird null gespeichert statt den Insert zu sprengen.
    schadenzeit: parseUhrzeit(lead.unfall_uhrzeit as string | null),
    schadenart,
    fall_typ: (lead.schadens_fall_typ as string | null) ?? null,
    // AAR-Stufe-0-Final (14.05.2026): claims.ursache gedropped — 0/11 Coverage,
    // einziger Reader war Stammdaten-Schema-Fallback (PR #1142, rueckgebaut).
    // CMM-44 SP-B PR2c: bkat_unfallart ist eine Cluster-c-Duplikat-Spalte —
    // claims ist SSoT (claims.bkat_unfallart existiert, Reader-Sweep migriert).
    bkat_unfallart: (lead.bkat_unfallart as ClaimInsert['bkat_unfallart']) ?? null,
    unfall_konstellation: (lead.unfall_konstellation as string | null) ?? null,

    // — Schadensort (aus unfallort + Geo)
    schadenort_adresse:
      (lead.unfallort as string | null) ??
      (lead.fahrzeug_standort_adresse as string | null) ??
      null,
    schadenort_plz: (lead.fahrzeug_standort_plz as string | null) ?? null,
    schadenort_ort: null,
    // CMM-44 SP-A2: unfallort_lat/lng (spezifische Unfallort-Koordinaten) hat
    // Vorrang vor kunde_lat/lng — vorher lief die Unfallort-Koordinate nur
    // ueber die faelle-COPY-Liste, die SP-A2 jetzt entfernt.
    schadenort_lat:
      (lead.unfallort_lat as number | null) ?? (lead.kunde_lat as number | null) ?? null,
    schadenort_lng:
      (lead.unfallort_lng as number | null) ?? (lead.kunde_lng as number | null) ?? null,
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
    // CMM-44 SP-A: primaer lead.gegner_versicherung_id, sonst Fuzzy-Match-Fallback
    // (resolveFallEntityFks) — vorher in buildFallInsertFromLead auf faelle-Seite.
    gegner_versicherung_id:
      (lead.gegner_versicherung_id as string | null) ??
      entityFks.gegnerVersicherungId ??
      null,
    gegner_versicherungsnummer: null, // Lead hat heute keine separate Spalte
    // CMM-26: gegner_aktenzeichen = Schadennummer der gegnerischen
    // Versicherung. Lead-Spalte heißt `gegner_schadennummer` (UI-Wording).
    gegner_aktenzeichen: (lead.gegner_schadennummer as string | null) ?? null,
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

    // — CMM-44 SP-A: DUP-Spalten aus dem Lead. claims ist die SSoT — der
    // faelle-Insert (buildFallInsertFromLead, Schritt 8) schreibt diese Spalten
    // ab dem Reader-Sweep NICHT mehr. Vor PR2 (faelle-Drop) ist claims der
    // einzige Schreibpfad fuer diese Werte.
    spezifikation: (lead.spezifikation as string | null) ?? null,
    polizeibericht_status: (lead.polizeibericht_status as string | null) ?? null,
    gewerbe_flag: Boolean(lead.gewerbe_flag ?? false),
    vorsteuerabzugsberechtigt: Boolean(lead.vorsteuerabzugsberechtigt ?? false),
    finanzierung_leasing: (lead.finanzierung_leasing as string | null) ?? 'keine',
    finanzierungsgeber_name: (lead.finanzierungsgeber_name as string | null) ?? null,
    finanzierungsgeber_adresse: (lead.finanzierungsgeber_adresse as string | null) ?? null,
    finanzierungsgeber_vertragsnr:
      (lead.finanzierungsgeber_vertragsnr as string | null) ?? null,
    zeugen_kontakte: (lead.zeugen_kontakte ?? null) as ClaimInsert['zeugen_kontakte'],
    kunde_email: (lead.email as string | null) ?? null,

    // — CMM-44 SP-B PR2c: Cluster-c-Duplikat-Spalten aus dem Lead. claims ist
    // die SSoT — buildFallInsertFromLead schreibt sie ab dem Reader-Sweep NICHT
    // mehr in faelle. fahrzeugschaden_beschreibung ist eine eigenstaendige
    // claims-Spalte (zusaetzlich zum hergang_kunde_text-Fallback oben).
    fahrzeugschaden_beschreibung:
      (lead.fahrzeugschaden_beschreibung as string | null) ?? null,
    zb1_status: (lead.zb1_status as string | null) ?? null,
    werkstatt_seit_datum: (lead.werkstatt_seit_datum as string | null) ?? null,
    fahrzeug_fahrbereit: (lead.fahrzeug_fahrbereit as boolean | null) ?? null,
    zeugen_vorhanden: Boolean(lead.zeugen_vorhanden ?? false),

    // — Welle-7 Defaults
    phase: '1_neu',
    status: 'dispatch_done',
    kundenbetreuer_id: kundenbetreuerId,
    // CMM-60 Schritt 3: SV-Zuweisung claim-nativ. faelle bekommt sv_id
    // weiterhin ueber fallComputedFields (gleicher Wert) — Ordering-Schutz,
    // da der claims->faelle-Trigger beim Insert die faelle-Row noch nicht sieht.
    sv_id: input.svIdFromTermin ?? null,
    // CMM-44 SP-B PR2a: sv_zugewiesen_am + service_typ leben auf claims (SSoT).
    // Die Werte werden zusätzlich beim faelle-Insert via fallComputedFields
    // gesetzt (Übergangsphase bis faelle-Drop in Phase 6).
    sv_zugewiesen_am: input.svIdFromTermin ? new Date().toISOString() : null,
    service_typ: (lead.service_typ as string | null) ?? 'komplett',
    // CMM-44 SP-B PR2b: SA/Abtretung-Daten aus dem Flow in claims (SSoT) schreiben.
    // Beim Dispatch-Pfad (kein signatureUrl) bleibt der Wert null/false — der
    // Dispatch-Reset in convert-lead-to-fall.ts überschreibt das anschließend.
    ...(input.signatureUrl
      ? {
          abtretung_pdf: input.signatureUrl,
          abtretung_signiert_am: new Date().toISOString(),
          sa_unterschrieben: true,
          sa_unterschrieben_am: new Date().toISOString(),
        }
      : {
          sa_unterschrieben: false,
          sa_unterschrieben_am: null,
          abtretung_signiert_am: null,
          abtretung_pdf: null,
        }),
    // Explizit setzen statt auf DB-Default zu vertrauen — Supabase-JS-
    // Insert kann undefined-Felder als null serialisieren, was dann
    // den CHECK-Constraint verletzt. Erlaubte Werte:
    //   partnerkanzlei | eigene_kanzlei | keine_kanzlei |
    //   noch_unentschieden | nicht_gefragt
    // 'nicht_gefragt' ist der korrekte Initial-Wert — der Wunsch wird
    // später vom Dispatcher (am Telefon) oder vom Kunden im Portal
    // (KanzleiWunschModal) gesetzt.
    kanzlei_wunsch: 'nicht_gefragt',
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
      // CMM-32: Anrede vom Lead vererben für saubere Anrede in Templates.
      anrede: (lead as { anrede?: string | null }).anrede ?? null,
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

  // CMM-26: Verursacher-Party — Bedingung gelockert. Bisher war
  // `gegner_name` Pflicht, aber der Dispatcher erfasst den Gegner üblicherweise
  // per Kennzeichen + Versicherung (Name kommt erst im Kanzlei-Mandat). Das
  // hat dazu geführt, dass die Verursacher-Party nie angelegt und der
  // FlowLink/Kunde keinen Gegner zu sehen bekam. Jetzt: anlegen sobald
  // `gegner_bekannt !== false` UND irgendein Identifier (KZ / Versicherung /
  // Name / Fahrzeugtyp / Schadennummer) gesetzt ist.
  const istGegnerBekannt = lead.gegner_bekannt !== false
  const hatGegnerInfo =
    !!(lead.gegner_kennzeichen as string | null) ||
    !!(lead.gegner_name as string | null) ||
    !!(lead.gegner_versicherung as string | null) ||
    !!(lead.gegner_versicherung_id as string | null) ||
    !!(lead.gegner_fahrzeugtyp as string | null) ||
    !!(lead.gegner_schadennummer as string | null)
  if (istGegnerBekannt && hatGegnerInfo) {
    partyInserts.push({
      claim_id: claimId,
      rolle: 'verursacher',
      reihenfolge: 2,
      // gegner_name ist freitext — wir packen den ganzen String in nachname.
      // Kann null sein, wenn der Gegner nur per KZ/Versicherung erfasst wurde.
      nachname: (lead.gegner_name as string | null) ?? null,
      kennzeichen: (lead.gegner_kennzeichen as string | null) ?? null,
      fahrzeugtyp_klartext: (lead.gegner_fahrzeugtyp as string | null) ?? null,
      versicherung_id: (lead.gegner_versicherung_id as string | null) ?? null,
      versicherung_klartext: (lead.gegner_versicherung as string | null) ?? null,
      // CMM-26: Schadennummer wird in claims.gegner_aktenzeichen abgelegt
      // (siehe claimsInsert oben), claim_parties hat keine eigene Spalte.
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
  // zur reinen Assignment-Tabelle. Wir setzen nur ZUSÄTZLICH faelle.claim_id.
  // CMM-44 SP-A: entityFks ist bereits oben (vor dem claimsInsert) resolved.
  const fallInsert = buildFallInsertFromLead(lead as never, {
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

  // CMM-44 SP-I6: kanzlei_id (Fall->Kanzlei-Zuordnung, LexDrive-Pfad A) lebt auf
  // kanzlei_faelle (1:1) statt faelle. Nur bei aufgeloester Kanzlei eine Row anlegen
  // (cov=0 sonst). Non-fatal — Fehler brechen die Konvertierung nicht.
  if (entityFks.kanzleiId) {
    const kfRes = await upsertKanzleiFall(admin, claimId, { kanzlei_id: entityFks.kanzleiId })
    if (!kfRes.ok) console.error('[convertLeadToClaim] kanzlei_faelle kanzlei_id-Write:', kfRes.error)
  }

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
    kundenbetreuerId,
    idempotent: false,
  }
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
