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
//   8. (CMM-49 D2) claim-first: KEINE faelle-Row mehr — fall_id == claim_id, die
//      Bridge legt trg_sync_claims_to_bridge an (hier idempotent abgesichert).
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
import { deriveAbrechnungsweg, istWerkstattReparaturWeg } from '@/lib/werkstatt/abrechnungsweg'
import { ensureVehicleFromFin, createVehicleStub } from '@/lib/vehicles/ensure-vehicle'
import { ensurePersonForData } from '@/lib/personen/ensure-person'
import { ensureFirma } from '@/lib/firmen/ensure-firma'
import { ensureVehicleFromKennzeichen } from '@/lib/vehicles/ensure-vehicle-from-kennzeichen'
import { deriveVermittler } from '@/lib/leads/vermittler'
import { uebernehmeLeadTermine } from '@/lib/leads/uebernehme-lead-termine'
import { resolveVermittlerOwnerProfil } from '@/lib/netzwerk/owner-resolution'
import { CLOSED_OPERATIVE_STATUS_PG } from '@/lib/claims/terminal-status'
import { recordVehicleDamage } from '@/lib/vehicles/vehicle-damage'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveFallEntityFks } from '@/lib/lead-fall-mapping'
import { upsertKanzleiFall } from '@/lib/kanzlei-fall/upsert-kanzlei-fall'
import { parseUhrzeit } from '@/lib/format/zeit'
import { clampKennzeichenForDb } from '@/lib/format/kennzeichen'
import type { ClaimInsert } from '@/lib/claims/types'
import { emitEvent } from '@/lib/notifications/emit'

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
  /** SV-Vermittlungs-Flow (P4): das Gutachten liegt bereits vor -> Claim entsteht direkt in
   *  'gutachten-eingegangen' (Direkt-INSERT, umgeht die State-Machine -> kein verfruehtes
   *  Billing/SLA/QC; die aufgeschobenen Effekte feuert der Onboarding-Complete-Hook, P4 T5). */
  gutachtenBereitsErstellt?: boolean
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

  // ─── CMM-50.0: vehicles-Write-Path ──────────────────────────────────────
  // Bisher propagierte die Konversion nur `lead.vehicle_id` — das aber nie von
  // einem Writer gesetzt wurde, also blieb claims.vehicle_id immer NULL und die
  // vehicles-SSoT leer. Jetzt: vorhandene vehicle_id weiter durchreichen; sonst
  // bei vorhandener FIN die vehicles-Row hier anlegen. Non-critical — ein Fehler
  // laesst resolvedVehicleId NULL (= bisheriges Verhalten), bricht die Konversion nie.
  let resolvedVehicleId = (lead.vehicle_id as string | null) ?? null
  if (!resolvedVehicleId && lead.fin) {
    const veh = await ensureVehicleFromFin({
      fin: lead.fin as string,
      snapshot: {
        kennzeichen: clampKennzeichenForDb(lead.kennzeichen as string | null),
        hersteller: (lead.fahrzeug_hersteller as string | null) ?? null,
        modell: (lead.fahrzeug_modell as string | null) ?? null,
        hsn: (lead.hsn as string | null) ?? null,
        tsn: (lead.tsn as string | null) ?? null,
        kilometerstand: (lead.kilometerstand as number | null) ?? null,
        // CMM-50.1: Snapshot-Restfelder aus dem Lead. KEIN bauart — leads hat keine
        // Fahrzeug-Bauart-Spalte (nur faelle.fahrzeug_typ); bauart kommt erst ueber
        // den faelle-Stammdaten-Edit (saveFinVin). Ebenso hat leads keine
        // fin_quelle/fin_extrahiert_am-Spalten -> Literale (Origin ist bekannt).
        kennzeichenBuchstaben: (lead.kennzeichen_buchstaben as string | null) ?? null,
        farbe: (lead.fahrzeug_farbe as string | null) ?? null,
        farbcode: (lead.lackfarbe_code as string | null) ?? null,
        baujahr: (lead.fahrzeug_baujahr as number | null) ?? null,
        erstzulassung: (lead.erstzulassung as string | null) ?? null,
        ausstattung: lead.fahrzeug_ausstattung ?? null,
        finQuelle: 'lead_konvertierung',
        finExtrahiertAm: new Date().toISOString(),
      },
      db: admin,
    })
    if (veh.ok) resolvedVehicleId = veh.vehicleId
    else console.warn('[CMM-50.0] vehicles-Upsert bei Konversion fehlgeschlagen:', veh.error)
  }
  // CMM-fix: Kennzeichen-Stub-Fallback greift jetzt auch, wenn der FIN-Pfad KEIN Fahrzeug ergab
  // (Fake/Tippfehler-FIN oder Lookup down) — sonst gingen die Fahrzeugdaten verloren (nicht db-driven).
  // Der !resolvedVehicleId-Guard verhindert Doppelanlage bei erfolgreicher FIN.
  if (!resolvedVehicleId && (
    lead.kennzeichen || lead.fahrzeug_hersteller || lead.fahrzeug_modell ||
    lead.fahrzeug_farbe || lead.lackfarbe_code || lead.hsn || lead.tsn ||
    lead.fahrzeug_baujahr || lead.erstzulassung || lead.kilometerstand ||
    lead.kennzeichen_buchstaben || lead.fahrzeug_ausstattung
  )) {
    // CMM-68/CMM-50: kein (erfolgreicher) FIN, aber IRGENDEIN Fahrzeugdatum -> FIN-loser Stub, damit ALLE
    // Fahrzeugdaten unbedingt auf vehicles landen (Vorbedingung dafuer, dass der faelle-INSERT
    // die vehicle-Cols verlustfrei NICHT mehr schreibt). claims.vehicle_id wird gesetzt; die FIN
    // kommt spaeter (ZB1) und dedupliziert via ensureVehicleFromFin (ein Fahrzeug, mehrere Claims).
    const veh = await createVehicleStub({
      snapshot: {
        kennzeichen: clampKennzeichenForDb(lead.kennzeichen as string | null),
        hersteller: (lead.fahrzeug_hersteller as string | null) ?? null,
        modell: (lead.fahrzeug_modell as string | null) ?? null,
        hsn: (lead.hsn as string | null) ?? null,
        tsn: (lead.tsn as string | null) ?? null,
        kilometerstand: (lead.kilometerstand as number | null) ?? null,
        kennzeichenBuchstaben: (lead.kennzeichen_buchstaben as string | null) ?? null,
        farbe: (lead.fahrzeug_farbe as string | null) ?? null,
        farbcode: (lead.lackfarbe_code as string | null) ?? null,
        baujahr: (lead.fahrzeug_baujahr as number | null) ?? null,
        erstzulassung: (lead.erstzulassung as string | null) ?? null,
        ausstattung: lead.fahrzeug_ausstattung ?? null,
      },
      db: admin,
    })
    if (veh.ok) resolvedVehicleId = veh.vehicleId
    else console.warn('[CMM-68] vehicles-Stub bei Konversion (kein FIN):', veh.error)
  }

  // ─── Schritt 7a: KB Round-Robin (falls nicht angegeben) ─────────────────
  // AAR-939 embed-B (Monika-Embed): KEIN Kundenbetreuer. Embed-B ist ein
  // nur-Gutachten-Vorgang ohne Regulierungs-Service — niemand betreut den Fall
  // (Aaron 30.05.). Zudem ist lead.zugewiesen_an bei embed-B der SV und darf
  // NICHT als KB durchschlagen. Gegate auf source_channel (nicht service_typ),
  // damit NATIVE nur_gutachter-Faelle ihren KB wie gehabt behalten.
  const istEmbedB = (lead.source_channel as string | null) === 'monika_embed'
  // Selbstzahler UND Kasko (abrechnungsweg): reiner Self-Service-Reparatur-Vorgang OHNE
  // SV/Gutachten/Regulierung -> kein Kundenbetreuer noetig (analog embed-B; Selbstzahler
  // Aaron 06.07., Kasko 15.07.). Sonst bindet der Round-Robin KB-Kapazitaet fuer einen
  // Fall ohne KB-Arbeit. Null-KB ist downstream-safe: das Kunde-Portal gatet die
  // KB-Anzeige auf fall.kundenbetreuer_id, embed-B liefert bereits KB-lose Claims.
  // abrechnungsweg ist type-lagged -> Record-Cast (AGENTS.md §6).
  const abrechnungsweg = (lead as Record<string, unknown>).abrechnungsweg as string | null
  const istDirektReparatur = abrechnungsweg === 'selbstzahler' || abrechnungsweg === 'kasko'
  let kundenbetreuerId: string | null = input.kundenbetreuerId ?? null
  if (!istEmbedB && !istDirektReparatur && !kundenbetreuerId) {
    // AAR-956: lead.zugewiesen_an NUR als KB uebernehmen, wenn die Rolle KB-faehig
    // ist. Beim kanonischen Self-Service-Lead (/start) ist zugewiesen_an der
    // DISPATCHER (pickRoundRobinDispatcher) — der claims-Trigger
    // (validate_kundenbetreuer_rolle) erlaubt aber nur rolle in {kundenbetreuer,
    // admin}. Ungegated schlug der Claim-Insert fehl -> keine Fall-Anlage. Bei
    // ineligibler Rolle (dispatch / sv) faellt es auf den KB-Round-Robin zurueck.
    const zugewiesenAn = (lead.zugewiesen_an as string | null) ?? null
    if (zugewiesenAn) {
      const { data: zaProfile } = await admin
        .from('profiles')
        .select('rolle')
        .eq('id', zugewiesenAn)
        .maybeSingle()
      const zaRolle = (zaProfile?.rolle as string | null) ?? null
      if (zaRolle === 'kundenbetreuer' || zaRolle === 'admin') {
        kundenbetreuerId = zugewiesenAn
      }
    }
    if (!kundenbetreuerId) {
      kundenbetreuerId = await pickKundenbetreuerRoundRobin(admin)
    }
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
    // F6 (Aaron 14.07.): Schadensort-plz/ort aus dem STRUKTURIERTEN Unfallort (leads.unfallort_plz/ort,
    // Google-Places — Form-Wiring folgt) statt aus der Fahrzeug-Standort-PLZ (falsches Orts-Konzept).
    // Bis das Formular unfallort_plz/ort befuellt = null (besser als die falsche Fahrzeug-PLZ).
    schadenort_plz: (lead.unfallort_plz as string | null) ?? null,
    schadenort_ort: (lead.unfallort_ort as string | null) ?? null,
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

    // — Fahrzeug (CMM-50.0: resolvedVehicleId = lead.vehicle_id oder frisch upserted)
    vehicle_id: resolvedVehicleId,

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
    // CMM-49 Tier-2: gegner_versicherungsnummer/gegner_aktenzeichen wandern in die
    // verursacher-Party (versicherungsnummer/versicherungs_aktenzeichen, SSoT) — s.u.
    // partyInserts. Nicht mehr auf claims (Cutover-Drop; Reader lesen v_claim_full.gegner_*
    // = COALESCE party->claims, #3004). gegner_schadennummer ist Teil von hatGegnerInfo
    // -> die verursacher-Party existiert immer, wenn eine Schadennummer da ist.
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
    // CMM-49: kunde_email NICHT mehr auf claims schreiben — die Kunden-Email lebt in der
    // geschaedigter-Party->personen (via ensurePersonForData unten, snapshot.email = lead.email).
    // v_claim_full/v_faelle sourcen kunde_email von dort (#2982). claims.kunde_email wird gedroppt.
    // CMM-50 Group D / CMM-48: claims.sprache jetzt bei Konversion gesetzt (war ungeschrieben
    // -> DB-Default 'de'; send-fall.ts las claim.sprache nur als Fallback HINTER lead.sprache).
    // = lead.sprache ?? 'de' (identisch zu dem, was faelle.sprache vorher hielt). claims = SSoT;
    // faelle.sprache entfaellt aus buildFallInsertFromLead. Value-neutral (lead-Prioritaet bleibt).
    sprache: (lead.sprache as string | null) ?? 'de',

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
    // CMM-44 MP-6c: claims.phase gedroppt (tote 10-Code-Spalte, abgeleitet aus
    // v_claim_phase). Kein phase-Write mehr beim Claim-Insert — main/sub_phase
    // ergeben sich aus status + Sub-Entity-Zustand.
    // B3/T4 (Status-Achsen-Konsolidierung): work_state-Write entfernt — die Dispatch/Processing-
    // Achse ist eliminiert, operative_status (unten gesetzt) ist die eine Status-Achse.
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
    // Komplettservice = LexDrive IMMER (Aaron): komplett -> 'partnerkanzlei'
    // automatisch; im Flow/Lead wird NICHT mehr nach einer anderen Kanzlei
    // gefragt. Auf Claim-Ebene kann der Kunde im Portal (KanzleiWunschModal)
    // aktiv auf eine eigene Kanzlei wechseln. nur_gutachter -> 'nicht_gefragt'
    // (keine Claimondo-Kanzlei; der Kunde reguliert selbst).
    kanzlei_wunsch:
      ((lead.service_typ as string | null) ?? 'komplett') === 'komplett'
        ? 'partnerkanzlei'
        : 'nicht_gefragt',
  }

  // CMM-74 b2: operative_status (Engine-Cursor, claims=SSoT) initial = faelle.status-Initialwert
  // (== fallComputedFields: svIdFromTermin ? 'sv-termin' : 'ersterfassung'). Schliesst die
  // Konvert-Luecke — neue Claims bekommen den Cursor schon bei Anlage statt NULL bis zum ersten
  // Engine-Transition (sonst Reader-Fallback ?? faelle.status noetig + NULL-Straggler). Value-neutral
  // (== was faelle.status traegt). operative_status fehlt noch in den generierten Claims-Typen
  // (b'' types-regen aufgeschoben) -> Record-Cast wie bei anderen noch-nicht-getypten Spalten.
  // P4 (Netzwerk): Sofort-Claim des SV-Vermittlungs-Flows -> 'gutachten-eingegangen' (Gutachten
  // liegt vor, ueberspringt sv-termin/besichtigung/begutachtung). Direkt-INSERT = sanktionierter
  // Initial-Cursor (Operative-Status-Write-Gate gatet nur .update). Umgeht bewusst die State-
  // Machine, damit processCaseBilling/completeSla/emitEvent NICHT vor dem Kunden-Onboarding
  // feuern (K5) — nachgeholt via resumeFunnelAfterOnboarding.
  ;(claimsInsert as Record<string, unknown>).operative_status =
    input.gutachtenBereitsErstellt
      ? 'gutachten-eingegangen'
      : input.svIdFromTermin
        ? 'sv-termin'
        : 'ersterfassung'
  // AAR-956 Werkstatt: vermittelnde Werkstatt (QR) -> claims.werkstatt_id (DB-Trigger legt
  // die Provision an). Record-Cast wie operative_status (generierte Types laggen die DB-Spalte).
  ;(claimsInsert as Record<string, unknown>).werkstatt_id =
    (lead.werkstatt_id as string | null) ?? null
  // AAR Werkstatt-KVA: Werkstatt-Kostenvoranschlag (Schaetzung) auf den Claim snapshotten.
  // Eigene Spur, NIE schadens_hoehe_netto/gutachten.* (SV-Wert). Record-Cast (Type-Lag, AGENTS §6).
  ;(claimsInsert as Record<string, unknown>).kostenvoranschlag_netto =
    (lead.kostenvoranschlag_netto as number | null) ?? null
  ;(claimsInsert as Record<string, unknown>).kostenvoranschlag_brutto =
    (lead.kostenvoranschlag_brutto as number | null) ?? null

  // Makler-Vermittlung: promotion_code_id -> promotion_codes.makler_id -> claims.makler_id.
  // DB-Trigger trg_makler_provision_on_bridge legt dann die makler_provisionen-Provision an
  // (dual-rate je service_typ). Record-Cast wie werkstatt_id (generierte Types laggen die Spalte).
  let maklerId: string | null = null
  let maklerPromoCode: string | null = null
  if (lead.promotion_code_id) {
    const { data: pc } = await admin
      .from('promotion_codes')
      .select('makler_id, code')
      .eq('id', lead.promotion_code_id as string)
      .maybeSingle()
    maklerId = (pc?.makler_id as string | null) ?? null
    maklerPromoCode = (pc?.code as string | null) ?? null
  }
  ;(claimsInsert as Record<string, unknown>).makler_id = maklerId

  // #8 Vermittler-SSoT Phase 2: genau EIN Vermittler (INBOUND) pro Claim => genau EINE Provision.
  // Praezedenz makler > werkstatt-inbound > firmen_flotte (identisch zum Phase-1-Backfill).
  // Die drei Provisions-Trigger gaten transition-safe auf vermittler_typ: ist es NULL, fallen sie
  // auf das Roh-Signal (makler_id/werkstatt_id) zurueck — sonst feuert nur der genannte Typ.
  // NIE outbound (reparatur_werkstatt_id / sv_id) — dafuer gibt es keine Provision.
  // Der Flotten-Lookup laeuft NUR, wenn weder makler noch werkstatt greifen und ein Fahrzeug am
  // Claim haengt (kein ueberfluessiger Roundtrip); er spiegelt exakt den Join in
  // create_firmen_flotte_provision (ff.firma_id -> aktives firmen_flotten_konten).
  // Record-Cast wg. Type-Lag (Mig 20260713195613 prod-live, generierte Types laggen).
  const inboundWerkstattId = (lead.werkstatt_id as string | null) ?? null
  let flotteKontoId: string | null = null
  if (!maklerId && !inboundWerkstattId && resolvedVehicleId) {
    const { data: flottenRows } = await admin
      .from('flotten_fahrzeuge')
      .select('firma_id')
      .eq('vehicle_id', resolvedVehicleId)
    const firmaIds = ((flottenRows ?? []) as Array<{ firma_id: string | null }>)
      .map((r) => r.firma_id)
      .filter((id): id is string => Boolean(id))
    if (firmaIds.length > 0) {
      const { data: konto } = await admin
        .from('firmen_flotten_konten')
        .select('id')
        .in('firma_id', firmaIds)
        .eq('status', 'aktiv')
        .limit(1)
        .maybeSingle()
      flotteKontoId = (konto?.id as string | null) ?? null
    }
  }
  const { vermittlerTyp, vermittlerId } = deriveVermittler({
    maklerId,
    werkstattId: inboundWerkstattId,
    flotteKontoId,
  })
  ;(claimsInsert as Record<string, unknown>).vermittler_typ = vermittlerTyp
  ;(claimsInsert as Record<string, unknown>).vermittler_id = vermittlerId
  // Netzwerk-Bindung (Spec 1 §8, K6): per-Claim Owner-Attribution aus dem INBOUND-Vermittler.
  // Makler = v1 kein Graph-Knoten -> null (keine Bindung, wird aktiv sobald Makler Knoten werden).
  // NIE aus sv_id/svIdFromTermin (OUTBOUND) seeden. Write-once: der Wert wird nur bei Anlage
  // gesetzt, spaeter nie ueberschrieben. Record-Cast wie die uebrigen type-lagged Convert-Mappings.
  ;(claimsInsert as Record<string, unknown>).netzwerk_owner_id =
    await resolveVermittlerOwnerProfil(admin, vermittlerTyp, vermittlerId)

  // Reparatur-Werkstatt: Dispatcher-Zuweisung am Lead -> Claim uebernehmen (Record-Cast wg. Type-Lag).
  // Der Lead wird via select('*') geladen (s.o.), die reparatur_werkstatt_*-Spalten kommen also mit.
  ;(claimsInsert as Record<string, unknown>).reparatur_werkstatt_id =
    (lead.reparatur_werkstatt_id as string | null) ?? null
  ;(claimsInsert as Record<string, unknown>).reparatur_werkstatt_zugewiesen_am =
    (lead.reparatur_werkstatt_zugewiesen_am as string | null) ?? null
  ;(claimsInsert as Record<string, unknown>).reparatur_werkstatt_zugewiesen_von =
    (lead.reparatur_werkstatt_zugewiesen_von as string | null) ?? null
  ;(claimsInsert as Record<string, unknown>).reparatur_werkstatt_quelle =
    (lead.reparatur_werkstatt_quelle as string | null) ?? null

  // Reparaturwunsch (Intent) + operativer Vermittlungs-Status + Extern-Werkstatt: Lead -> Claim.
  ;(claimsInsert as Record<string, unknown>).reparaturwunsch =
    (lead.reparaturwunsch as string | null) ?? null
  ;(claimsInsert as Record<string, unknown>).reparatur_vermittlung_status =
    (lead.reparatur_vermittlung_status as string | null) ?? 'offen'
  ;(claimsInsert as Record<string, unknown>).reparatur_werkstatt_extern =
    (lead.reparatur_werkstatt_extern as string | null) ?? null
  // convert-lead-claim-audit (Aaron 11.07.): freie_werkstattwahl Lead -> Claim durchreichen
  // (leads hatte es, claims nicht). Der Trigger set_reparatur_werkstatt_from_qr respektiert es
  // (kein Auto-qr_referral-Reparateur bei freier Wahl). Record-Cast wg. Type-Lag (Mig 20260713161645).
  ;(claimsInsert as Record<string, unknown>).freie_werkstattwahl =
    (lead.freie_werkstattwahl as boolean | null) ?? null
  // SP1 Task 3: Schadenskategorie (Werkstatt-Matching) Lead -> Claim (Record-Cast wg. Type-Lag).
  ;(claimsInsert as Record<string, unknown>).schadenskategorie =
    (lead.schadenskategorie as string | null) ?? null
  // SP-B1: Abrechnungsweg (haftpflicht/kasko/selbstzahler) Lead -> Claim (SSoT). Record-Cast wg. Type-Lag.
  // WS1b (Reduced-Repair-Aktivierung): traegt der Lead keinen Weg (die meisten Nicht-/flow-
  // Entstehungspfade leiten nicht ab), am Konversionspunkt aus schuldfrage + eigene_versicherung
  // ableiten — sonst bleibt der Claim wegs-los und die Reparatur-Strecke dormant.
  // Ableiter-Vereinheitlichung (Problem B): deriveAbrechnungsweg spiegelt die DB-Funktion
  // derive_abrechnungsweg (die 3 Views nutzen sie READ-seitig) EXAKT -> die gespeicherte Spalte und
  // die View-Ableitung divergieren nie. schadenart mit im Input (schadenart-Fallback).
  const resolvedAbrechnungsweg =
    (lead.abrechnungsweg as string | null) ??
    deriveAbrechnungsweg({
      schuldfrage: (lead.schuldfrage as string | null) ?? null,
      eigeneVersicherung: (lead.eigene_versicherung as string | null) ?? null,
      schadenart,
    })
  ;(claimsInsert as Record<string, unknown>).abrechnungsweg = resolvedAbrechnungsweg
  // AAR-956 T2: Roh-Inputs (schuldfrage, eigene_versicherung vom Lead) ZUSAETZLICH zum abgeleiteten
  // abrechnungsweg am Claim persistieren — sonst bleibt nur der abgeleitete Wert, die Original-
  // Eingaben (fuer Analyse/Audit/Re-Derive) gehen verloren. Additive nullable Spalten (Mig
  // 20260722202021), Record-Cast wie die uebrigen type-lagged Convert-Mappings hier.
  ;(claimsInsert as Record<string, unknown>).schuldfrage = (lead.schuldfrage as string | null) ?? null
  ;(claimsInsert as Record<string, unknown>).eigene_versicherung =
    (lead.eigene_versicherung as string | null) ?? null
  // Convert-Mapping (Aaron 14.07.) — Record-Cast wg. Type-Lag (Spalten additiv via #4238):
  //   F2: interne_notizen = Dispatcher-Notiz (leads.notiz) — wird vom AI-Briefing gelesen
  //       (briefing-prompt.ts); bisher verwaist (nie nach claims gemappt).
  //   F1-core: schadens_kind = physische Schadens-KIND (Karosserie/Glas/...) aus leads.schadens_art.
  //       schadenart (= Abrechnungs-Typ) bleibt vorerst separat — schadenart-Derive aus abrechnungsweg
  //       ist Follow-up (Redundanz-Klaerung, s. Marker COORDINATION-convert-mapping-live-confirmed-fixes).
  //   F6: schadenort_place_id = Google-Places place_id des Unfallorts (Form-Wiring folgt).
  ;(claimsInsert as Record<string, unknown>).interne_notizen = (lead.notiz as string | null) ?? null
  ;(claimsInsert as Record<string, unknown>).schadens_kind = (lead.schadens_art as string | null) ?? null
  ;(claimsInsert as Record<string, unknown>).schadenort_place_id = (lead.unfallort_place_id as string | null) ?? null
  // WS5b (Reduced-Repair): Reparatur-only-Claims (selbstzahler / kasko-freie Wahl) bekommen das
  // reduzierte Pflichtdok-Szenario (nur Fahrzeugschein statt vollmacht/gutachten/versicherer;
  // Fotos+KVA laufen ueber eigene Kunde-Cards). Haftpflicht bleibt szenario=null (Dispatch/SV
  // setzt es spaeter szenario-spezifisch).
  if (istWerkstattReparaturWeg(resolvedAbrechnungsweg)) {
    ;(claimsInsert as Record<string, unknown>).szenario = resolvedAbrechnungsweg
    // Audit-Bug F (Kasko-Audit 15.07.): der Reparatur-Weg hat KEIN SV-Onboarding —
    // weder Gutachter-Termin noch Vollmacht-Strecke; der Fall ist im FlowLink erfasst.
    // Ohne dieses Flag bleibt der Claim auf dem DB-Default false und der Kunde wird vom
    // Portal-Gate (kunde/layout.tsx, kunde/page.tsx) in einen Wizard geschickt, der fuer
    // ihn ohnehin auf welcome->fall->fertig zusammenschrumpft (Bug D), plus eine
    // "Onboarding abschliessen"-Warnkarte (lib/kunde/jetzt-zu-tun.ts).
    // NICHT lifecycle-relevant: lifecycle.ts fuehrt onboarding_complete nur als totes
    // Input-Typ-Feld (get-claim-lifecycle-for-claim.ts uebergibt hart null); die Subphase
    // onboarding_offen haengt an operative_status bzw. vollmacht_signiert_am.
    claimsInsert.onboarding_complete = true
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

  // ─── CMM-50.2: business-Felder leasinggeber_name + finanzierung_bank ─────
  // Lead-seitig heissen sie leasing_geber / finanzierung_bank (s. LEAD_TO_FALL_RENAMED_FIELDS);
  // claims ist die SSoT (distinkt von finanzierungsgeber_* oben). Separater UPDATE via
  // Admin-Client (untyped), weil die generierten DB-Types diesen frischen Spalten noch
  // hinterherhinken (AGENTS.md §6 — Type-Regen aufgeschoben). Non-critical + nur bei Werten.
  if (lead.leasing_geber != null || lead.finanzierung_bank != null) {
    const { error: bizErr } = await admin
      .from('claims')
      .update({
        leasinggeber_name: (lead.leasing_geber as string | null) ?? null,
        finanzierung_bank: (lead.finanzierung_bank as string | null) ?? null,
      })
      .eq('id', claimId)
    if (bizErr) console.warn('[CMM-50.2] business-Felder-Update fehlgeschlagen (non-fatal):', bizErr.message)
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
      vehicle_id: resolvedVehicleId,
      kennzeichen: clampKennzeichenForDb(lead.kennzeichen as string | null),
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
  // CMM-50 Group C: `gegner_bekannt`-Guard entfernt — nie false in den Daten (0/358 Leads), und
  // entity-getrieben (statt vom Flag) macht den faelle.gegner_*-Write-Retire robust value-neutral.
  // verursacher-Party + Gegner-Fahrzeug werden rein datengetrieben (hatGegnerInfo) angelegt.
  const hatGegnerInfo =
    !!(lead.gegner_kennzeichen as string | null) ||
    !!(lead.gegner_name as string | null) ||
    !!(lead.gegner_versicherung as string | null) ||
    !!(lead.gegner_versicherung_id as string | null) ||
    !!(lead.gegner_fahrzeugtyp as string | null) ||
    !!(lead.gegner_schadennummer as string | null)

  // CMM-Entity Plan 3 (T3): Gegner-Fahrzeug als vehicles-Entitaet (provisorisch per
  // Kennzeichen, FIN-los -> mergebar sobald eine FIN auftaucht). Non-critical.
  let gegnerVehicleId: string | null = null
  if (lead.gegner_kennzeichen as string | null) {
    const gv = await ensureVehicleFromKennzeichen({
      db: admin as unknown as SupabaseClient,
      kennzeichen: lead.gegner_kennzeichen as string,
      klartext: (lead.gegner_fahrzeugtyp as string | null) ?? null,
    })
    if (gv.ok) gegnerVehicleId = gv.vehicleId
    else console.warn('[CMM-Entity P3] ensureVehicleFromKennzeichen fehlgeschlagen:', gv.error)
  }

  if (hatGegnerInfo) {
    partyInserts.push({
      claim_id: claimId,
      rolle: 'verursacher',
      reihenfolge: 2,
      // gegner_name ist freitext — wir packen den ganzen String in nachname.
      // Kann null sein, wenn der Gegner nur per KZ/Versicherung erfasst wurde.
      nachname: (lead.gegner_name as string | null) ?? null,
      kennzeichen: clampKennzeichenForDb(lead.gegner_kennzeichen as string | null),
      fahrzeugtyp_klartext: (lead.gegner_fahrzeugtyp as string | null) ?? null,
      // CMM-Entity Follow-up (B): Fuzzy-Fallback analog claims.gegner_versicherung_id —
      // sonst hat claims den VS-Entity-Link, die verursacher-Party aber nicht.
      versicherung_id:
        (lead.gegner_versicherung_id as string | null) ?? entityFks.gegnerVersicherungId ?? null,
      versicherung_klartext: (lead.gegner_versicherung as string | null) ?? null,
      // CMM-Entity Plan 3 (T3): Gegner-Fahrzeug-Entitaet (FIN-los, per Kennzeichen)
      vehicle_id: gegnerVehicleId,
      // CMM-49 Tier-2: Schadennummer (UI: gegner_schadennummer) lebt jetzt als
      // versicherungs_aktenzeichen in der verursacher-Party (SSoT), nicht mehr auf
      // claims.gegner_aktenzeichen.
      versicherungs_aktenzeichen: (lead.gegner_schadennummer as string | null) ?? null,
      // Policennummer (Mig 20260714144318, Aaron 14.07.). Hier stand vorher "versicherungs-
      // nummer: Lead hat keine Quelle -> null" — die Spalte gab es nicht, das Feld fehlte im
      // Insert, die DB setzte NULL. Folge: claim_parties.versicherungsnummer war IMMER leer,
      // und damit auch die vier Views, die es ableiten (v_claim_base/-full/-sv/
      // v_faelle_mit_aktuellem_termin) sowie der Vers.-Nr.-Platz in der Unfallmeldung an die
      // Gegner-Haftpflicht (UnfallmeldungVs: Betreff UND Body). Die Lesekette war komplett,
      // nur der Schreiber fehlte. Quelle ist jetzt der NFC-Gegner-Wizard (optionales Feld).
      // Bewusst HIER und nicht im Caller: der Convert ist der eine deterministische
      // Lead->Party-Mapper und laut submitSchadenGegner fail-soft spaeter nachholbar — ein
      // Patch im Caller wuerde auf genau diesem Recovery-Pfad still verloren gehen.
      // Andere Lead-Quellen lassen die Spalte leer -> unveraendert null, kein Verhaltensbruch.
      versicherungsnummer: (lead.gegner_versicherungsnummer as string | null) ?? null,
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

  // ─── CMM Entity-Model Phase 3: personen-Link schreibzeitig setzen ────────
  // Spiegel des 2a-Backfills: jede Partei bekommt VOR dem Insert ihre globale
  // personen-id (Account -> Dedup via user_id; ohne Account -> neue Person, kein
  // Auto-Merge). Non-critical: ein fehlgeschlagener Link laesst person_id NULL
  // (= bisheriges Verhalten) und bricht die Konversion NICHT. Beim Account-Nachzug
  // (finalizeKundeSetup / acceptAirdropInvitation) wird person_id idempotent korrigiert.
  // CMM-Entity Follow-up (C): Halter-Party wenn Kunde != Halter (ist_fahrzeughalter=false).
  // lead.halter_* haelt den abweichenden Halter (Leasing/Finanzierung/Firmenwagen). Ohne diese
  // Party ginge der Halter beim faelle.halter_*-Drop verloren — v_claim_full.halter_* sourct aus
  // der ist_halter=true-Party (Geschaedigter-Party hat bei Kunde!=Halter ist_halter=false).
  // VOR dem Loop gepusht -> bekommt person_id (Empty-Guard greift, falls doch namenlos). Non-critical.
  // Backfill Bestand entfaellt: aktuell 0 Kunde!=Halter-Claims (greenfield).
  if ((lead.ist_fahrzeughalter as boolean | null) === false) {
    partyInserts.push({
      claim_id: claimId,
      rolle: 'halter',
      reihenfolge: partyInserts.length + 1,
      vorname: (lead.halter_vorname as string | null) ?? null,
      nachname: (lead.halter_nachname as string | null) ?? null,
      adresse_strasse: (lead.halter_strasse as string | null) ?? null,
      adresse_plz: (lead.halter_plz as string | null) ?? null,
      adresse_ort: (lead.halter_stadt as string | null) ?? null,
      adresse_land: 'DE',
      telefon: (lead.halter_telefon as string | null) ?? null,
      email: (lead.halter_email as string | null) ?? null,
      geburtsdatum: (lead.halter_geburtsdatum as string | null) ?? null,
      ist_halter: true,
      ist_fahrer: false,
      ist_gewerbe: false,
      ist_aktiv: true,
      ist_anonymisiert: false,
      ist_eingeladen_via_airdrop: false,
      hat_personenschaden: false,
      vehicle_id: resolvedVehicleId,
      kennzeichen: clampKennzeichenForDb(lead.kennzeichen as string | null),
      quelle: 'lead_konvertierung',
      created_by_user_id: input.triggerByUserId ?? null,
    })
  }

  for (const p of partyInserts) {
    const personRes = await ensurePersonForData({
      db: admin,
      userId: (p.user_id as string | null) ?? null,
      snapshot: {
        anrede: p.anrede as string | null,
        vorname: p.vorname as string | null,
        nachname: p.nachname as string | null,
        firma: (p.firma as string | null) ?? null,
        ist_gewerbe: (p.ist_gewerbe as boolean | null) ?? false,
        // CMM-50 Group C (halter): geburtsdatum in den Person-Snapshot (war Luecke) — vcf.halter_*
        // sourct aus personen; Voraussetzung fuer den faelle.halter_geburtsdatum-Removal.
        geburtsdatum: (p.geburtsdatum as string | null) ?? null,
        email: p.email as string | null,
        telefon: p.telefon as string | null,
        mobil: p.mobil as string | null,
        adresse_strasse: p.adresse_strasse as string | null,
        adresse_plz: p.adresse_plz as string | null,
        adresse_ort: p.adresse_ort as string | null,
        adresse_land: (p.adresse_land as string | null) ?? null,
        fuehrerscheinklassen: (p.fuehrerscheinklassen as string | string[] | null) ?? null,
      },
    })
    // CMM-49 Entity Plan-5 (4d, Strategie A): nach dem flat-DROP ist person_id das einzige Netz
    // fuer Personen-Identitaet. Bei identitaetstragenden Parteien (geschaedigter/halter) bricht ein
    // fehlgeschlagener Link die Konversion sauber ab (cleanupAndFail, retrybar) statt Name/Kontakt
    // permanent zu verlieren. Sekundaere Parteien (verursacher/Gegner — im Mandat re-captured)
    // bleiben tolerant (non-fatal). Skipped (identitaetslos, ok:true) faellt harmlos durch.
    if (!personRes.ok) {
      if (p.rolle === 'geschaedigter' || p.rolle === 'halter') {
        return cleanupAndFail(`personen-Link fuer Partei '${String(p.rolle)}' fehlgeschlagen: ${personRes.error}`)
      }
      console.warn(`[CMM-entity P3] personen-Link (${String(p.rolle)}) non-fatal:`, personRes.error)
    } else if (personRes.personId) {
      p.person_id = personRes.personId
    }
  }

  // CMM-Entity Plan 3 (T2): Geschaedigter-Firma (Gewerbe) -> firmen-Entitaet + firma_id
  // statt Klartext. partyInserts[0] = Geschaedigter (Reihenfolge wie im Bestand).
  // GATE B: leads hat (noch) kein firma_ustid -> Dedup per normalized_name; ust_id additiv
  // wenn vorhanden (lead = Record<string,unknown> -> Zugriff safe, fehlt -> null).
  // Non-critical: Fehler laesst firma_id NULL, bricht die Konversion nicht.
  if (Boolean(lead.gewerbe_flag) && (lead.firma_name as string | null)) {
    const firmaRes = await ensureFirma({
      db: admin as unknown as SupabaseClient,
      snapshot: {
        name: lead.firma_name as string,
        ust_id: (lead.firma_ustid as string | null) ?? null,
        quelle: 'lead_konvertierung',
      },
    })
    if (firmaRes.ok) partyInserts[0].firma_id = firmaRes.firmaId
    else console.warn('[CMM-Entity P3] ensureFirma (geschaedigter) fehlgeschlagen:', firmaRes.error)
  }

  // CMM-49 Entity Plan-5 (4c): Person-flat-Keys vor dem Insert entfernen — personen ist die SSoT
  // (ensurePersonForData oben hat den vollstaendigen Snapshot uebernommen + person_id gesetzt).
  // claim_parties speichert Personen-Daten nicht mehr flach (diese Spalten werden gedroppt). KEPT:
  // person_id/firma_id/user_id/rolle/vehicle_id/kennzeichen/Struktur-/airdrop-Flags.
  const PERSON_FLAT_KEYS = [
    'anrede', 'titel', 'vorname', 'nachname', 'firma', 'ist_gewerbe', 'geburtsdatum', 'email',
    'telefon', 'mobil', 'adresse_strasse', 'adresse_plz', 'adresse_ort', 'adresse_land',
    'fuehrerscheinnummer', 'fuehrerscheinklassen', 'ust_id',
  ]
  for (const party of partyInserts) {
    for (const k of PERSON_FLAT_KEYS) delete party[k]
  }

  const { error: partiesErr } = await admin
    .from('claim_parties')
    .insert(partyInserts)
  if (partiesErr) {
    return cleanupAndFail(
      `claim_parties-Insert fehlgeschlagen: ${partiesErr.message}`,
    )
  }

  // ─── Kunde-Termin-Funnel T1: offene Lead-Termine auf den Fall umhaengen ─────
  // (Spec docs/superpowers/specs/2026-08-05-kunde-termin-funnel-design.md §4.1)
  // Non-fatal: ein Fehler bricht die Konversion NICHT ab; ohne Umhaengen bleibt der
  // Termin fuer die Kunden-Akte unsichtbar (Achsen-Blindheit) — deshalb lautes Log.
  {
    try {
      const uebernahme = await uebernehmeLeadTermine(admin, input.leadId, claimId)
      if (!uebernahme.ok) {
        console.error('[T1] Lead-Termin-Uebernahme fehlgeschlagen (non-fatal):', uebernahme.error)
      }
    } catch (err) {
      console.error('[T1] Lead-Termin-Uebernahme geworfen (non-fatal):', err)
    }
  }

  // ─── SP2 Task 4: reparatur_termine-Row anlegen (non-fatal) ──────────────
  // Bedingung: Lead hat eine Reparatur-Werkstatt (reparatur_werkstatt_id). Der Wunschtermin
  // (reparatur_wunschtermin) ist im Flow OPTIONAL — fehlt er, entsteht die Row TROTZDEM
  // (wunschtermin nullable seit Mig 20260715005517), damit die Werkstatt den Auftrag sieht
  // und selbst einen Termin vorschlagen kann. Frueher war die Row an BEIDE Werte gekoppelt
  // -> ohne Wunschtermin keine Row -> WerkstattAuftragDetail blendete die ganze Sektion aus
  // = toter Auftrag (b1).
  // status='angefragt' — die Werkstatt bestaetigt (bei Wunschtermin) bzw. schlaegt selbst
  // einen Termin vor (ohne Wunschtermin) / ruft an / lehnt ab im naechsten Schritt.
  // Non-fatal: ein Fehler bricht die Konversion NICHT ab (Claim ist bereits valide angelegt).
  {
    const rwtWerkstattId = (lead.reparatur_werkstatt_id as string | null) ?? null
    const rwtWunschtermin = (lead.reparatur_wunschtermin as string | null) ?? null
    if (rwtWerkstattId) {
      const { error: rtErr } = await admin
        .from('reparatur_termine')
        .insert({
          claim_id: claimId,
          werkstatt_id: rwtWerkstattId,
          wunschtermin: rwtWunschtermin,
          status: 'angefragt',
          erstellt_von: input.triggerByUserId ?? null,
        })
      if (rtErr) {
        console.error('[SP2 T4] reparatur_termine-Insert fehlgeschlagen (non-fatal):', rtErr.message)
      }
    }
  }

  // ─── Schritt 5: claim_vehicle_involvements ──────────────────────────────
  // Wir legen ein Involvement für das geschädigte Fahrzeug an, sofern eine
  // vehicle_id aufgelöst werden konnte (CMM-50.0: propagiert oder frisch
  // upserted). Gegnerisches Fahrzeug erst wenn wir später auch dessen
  // vehicles-Row anlegen — heute hat das Lead nur Klartext.
  if (resolvedVehicleId) {
    const { error: cviErr } = await admin
      .from('claim_vehicle_involvements')
      .insert([
        {
          claim_id: claimId,
          vehicle_id: resolvedVehicleId,
          rolle: 'geschaedigter',
          reihenfolge: 1,
        },
      ])
    // CMM-50.0: non-critical — eine fehlgeschlagene Fahrzeug-Verknuepfung darf die
    // Konversion NICHT abbrechen (claims.vehicle_id + claim_parties.vehicle_id sind
    // bereits gesetzt; cvi ist die zusaetzliche 1:N-Involvement-Zeile). Frueher war
    // dieser Insert toter Code (lead.vehicle_id immer NULL) — 50.0 aktiviert ihn,
    // darum hier log+continue statt cleanupAndFail (kein Konversions-Abbruch).
    if (cviErr) {
      console.error('[CMM-50.0] claim_vehicle_involvements-Insert fehlgeschlagen (non-fatal):', cviErr.message)
    }
  }

  // CMM-Entity Plan 3 (T3): Gegner-Fahrzeug-Involvement. rolle='verursacher'
  // (live-CHECK: {geschaedigter,verursacher,beteiligter,unbekannt,mietwagen} - KEIN 'gegner'),
  // konsistent mit der verursacher-Party. Non-critical.
  if (gegnerVehicleId) {
    const { error: cviGErr } = await admin
      .from('claim_vehicle_involvements')
      .insert([
        { claim_id: claimId, vehicle_id: gegnerVehicleId, rolle: 'verursacher', reihenfolge: 2 },
      ])
    if (cviGErr) {
      console.error('[CMM-Entity P3] gegner-involvement-Insert (non-fatal):', cviGErr.message)
    }
  }

  // CMM-Entity Plan 3 (T4): aktueller Fahrzeugschaden als vehicle-bound Damage-Entitaet.
  // Wird beim Claim-Close zu 'vorschaden' (markClaimDamagesAsVorschaden). Non-critical.
  if (resolvedVehicleId) {
    const dmg = await recordVehicleDamage({
      db: admin as unknown as SupabaseClient,
      damage: {
        vehicleId: resolvedVehicleId,
        claimId,
        state: 'aktuell',
        beschreibung: (lead.fahrzeugschaden_beschreibung as string | null) ?? null,
        quelle: 'lead_konvertierung',
      },
    })
    if (!dmg.ok) console.warn('[CMM-Entity P3] recordVehicleDamage fehlgeschlagen:', dmg.error)
  }

  // ─── Schritt 8: claim-first — KEINE faelle-Row mehr (CMM-49 D2-Cutover) ──
  // Der frühere faelle-INSERT war ein toter Volldatensatz-Duplikat: alle Schadendaten leben
  // längst auf claims/claim_parties/vehicles (Entity-Migration), die Reader sind faelle-frei
  // (CMM-49 Reader-Sweep), die Engine ist claim-native (AAR-939 #2902). kunde_id ist gedeckt
  // über claims.geschaedigter_user_id (Schritt 3) + claim_parties(geschaedigter).user_id
  // (Schritt 4). fall_id == claim_id (die bisherige Identity); die fall_id-Kinder
  // (timeline/tasks/dokumente; KEIN FK auf faelle) keyen weiter auf diesen Wert.
  // Die Bridge legt der trg_sync_claims_to_bridge (AFTER INSERT claims, ON CONFLICT DO NOTHING)
  // beim Claim-Insert (Schritt 3) BEREITS an — wir sichern sie hier idempotent ab (robust,
  // falls der Sync-Trigger in Phase F entfällt).
  const fallId = claimId
  const { error: bridgeErr } = await admin
    .from('faelle_claim_bridge')
    .upsert({ fall_id: fallId, claim_id: claimId }, { onConflict: 'fall_id', ignoreDuplicates: true })
  if (bridgeErr) {
    return cleanupAndFail(`Bridge-Insert fehlgeschlagen: ${bridgeErr.message}`)
  }

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

  // Makler-Value-Loop: den Vermittler benachrichtigen, dass sein Kontakt Kunde geworden ist
  // (+ vorgemerkte Provision). Best-effort — darf die Konvertierung nie brechen. Das Event ist
  // maklerId-getargetet (fan-out nutzt payload.maklerId direkt, kein Consent noetig). Die Provision
  // hat der trg_makler_provision_on_bridge (via claim-insert) bereits in partner_provisionen
  // (partner_typ='makler') angelegt -> betragEur lesbar.
  if (maklerId) {
    try {
      const kundeName = [lead.vorname as string | null, lead.nachname as string | null]
        .filter(Boolean)
        .join(' ')
        .trim()
      const { data: prov } = await admin
        .from('partner_provisionen')
        .select('betrag_netto_eur')
        .eq('partner_typ', 'makler')
        .eq('fall_id', fallId)
        .eq('partner_id', maklerId)
        .order('trigger_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const betragEur =
        prov?.betrag_netto_eur != null ? Number(prov.betrag_netto_eur) : undefined
      await emitEvent('makler.lead_eingegangen', {
        leadId: input.leadId,
        maklerId,
        promoCode: maklerPromoCode ?? '',
        kundeName: kundeName || undefined,
        betragEur,
      })
    } catch (err) {
      console.error('[convertLeadToClaim] makler.lead_eingegangen emit fehlgeschlagen (non-critical):', err)
    }
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
    // CMM-74 b2 reader-fallback-drop: aktive Faelle pro KB via claims.operative_status zaehlen
    // (claims=SSoT; kundenbetreuer_id + operative_status leben auf claims, 1:1 zu faelle, gleiches
    // Status-Vokabular) — entkoppelt vom faelle.status-Read (Drop-Runway).
    // B4-slice-1b: war ein handgerolltes Literal mit zwei TOTEN Filterwerten ('reguliert' gibt es
    // im operative_status-Vokabular gar nicht; 'abgelehnt' ist NICHT terminal — der Fall laeuft
    // weiter und muss zur KB-Auslastung zaehlen, sonst sieht ein KB mit vielen abgelehnt-aber-
    // laufenden Faellen "frei" aus und wird ueberladen). Zugleich fehlten die feinen B2-Terminals
    // (reguliert_vollstaendig etc.) -> geschlossene Faelle zaehlten als aktiv. Jetzt die SSoT.
    const { count } = await admin
      .from('claims')
      .select('id', { count: 'exact', head: true })
      .eq('kundenbetreuer_id', b.id as string)
      .not('operative_status', 'in', CLOSED_OPERATIVE_STATUS_PG)
    counts[b.id as string] = count ?? 0
  }

  return betreuer.reduce(
    (m, b) =>
      (counts[b.id as string] ?? 0) < (counts[m.id as string] ?? 0) ? b : m,
    betreuer[0],
  ).id as string
}
