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
import { parseUhrzeit } from '@/lib/format/zeit'
import { parseKennzeichen } from '@/lib/format/kennzeichen'
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
  // WICHTIG: lead.zugewiesen_an ist meistens der Dispatcher der den Lead
  // qualifiziert hat — Dispatcher dürfen NIEMALS als KB zugewiesen werden,
  // sie haben keinen Zugriff auf Fallakten. Wir validieren die Rolle und
  // fallen auf Round-Robin zurueck wenn die Rolle nicht passt.
  let kundenbetreuerId: string | null =
    input.kundenbetreuerId ?? (lead.zugewiesen_an as string | null) ?? null
  if (kundenbetreuerId) {
    const { data: candidate } = await admin
      .from('profiles')
      .select('rolle, aktiv')
      .eq('id', kundenbetreuerId)
      .maybeSingle()
    const rolle = (candidate?.rolle as string | null) ?? null
    if (!candidate?.aktiv || !rolle || !['kundenbetreuer', 'admin'].includes(rolle)) {
      kundenbetreuerId = null
    }
  }
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
    // CMM-26: schadenzeit ist eine `time`-Spalte, lead.unfall_uhrzeit kann aber
    // freier Text sein („14 uhr"). Defensive Normalisierung — bei ungültigem
    // Format wird null gespeichert statt den Insert zu sprengen.
    schadenzeit: parseUhrzeit(lead.unfall_uhrzeit as string | null),
    schadenart,
    fall_typ: (lead.schadens_fall_typ as string | null) ?? null,
    ursache: (lead.schadensursache as string | null) ?? null,
    unfall_konstellation: (lead.unfall_konstellation as string | null) ?? null,

    // — Schadensort (Unfallort)
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
    // CMM-26: gegner_aktenzeichen = Schadennummer der gegnerischen
    // Versicherung. Lead-Spalte heißt `gegner_schadennummer` (UI-Wording).
    gegner_aktenzeichen: (lead.gegner_schadennummer as string | null) ?? null,
    anzahl_beteiligte_total:
      ((lead.gegner_anzahl_beteiligte as number | null) ?? 0) + 1,

    // — Gewerbe / Privat / Leasing
    gewerbe_flag: Boolean(lead.gewerbe_flag ?? false),
    vorsteuerabzugsberechtigt: Boolean(lead.vorsteuerabzugsberechtigt ?? false),
    firma_name: (lead.firma_name as string | null) ?? null,
    firma_ustid: (lead.firma_ustid as string | null) ?? null,
    finanzierung_leasing:
      (['keine', 'leasing', 'finanzierung'] as const).includes(
        lead.finanzierung_leasing as 'keine' | 'leasing' | 'finanzierung',
      )
        ? (lead.finanzierung_leasing as string)
        : 'keine',
    leasinggeber_name: (lead.leasing_geber as string | null) ?? null,
    finanzierungsgeber_name: (lead.finanzierungsgeber_name as string | null) ?? null,
    finanzierungsgeber_adresse: (lead.finanzierungsgeber_adresse as string | null) ?? null,
    finanzierungsgeber_vertragsnr: (lead.finanzierungsgeber_vertragsnr as string | null) ?? null,
    finanzierung_bank: (lead.finanzierung_bank as string | null) ?? null,

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
    // Explizit setzen statt auf DB-Default zu vertrauen — Supabase-JS-
    // Insert kann undefined-Felder als null serialisieren, was dann
    // den CHECK-Constraint verletzt. Erlaubte Werte:
    //   partnerkanzlei | eigene_kanzlei | keine_kanzlei |
    //   noch_unentschieden | nicht_gefragt
    // 'nicht_gefragt' ist der korrekte Initial-Wert — der Wunsch wird
    // später vom Dispatcher (am Telefon) oder vom Kunden im Portal
    // (KanzleiWunschModal) gesetzt.
    kanzlei_wunsch: 'nicht_gefragt',

    // Direktes Email-Feld auf claims — kein JOIN über claim_parties nötig
    kunde_email: (lead.email as string | null) ?? null,

    // — Neu nachgezogen (vorher fehlende Felder)
    brn: (lead.brn as string | null) ?? null,
    eigene_versicherung: (lead.eigene_versicherung as string | null) ?? null,
    eigene_policennr: (lead.eigene_policennr as string | null) ?? null,
    zeugen_kontakte: (lead.zeugen_kontakte as import('@/lib/supabase/database.types').Json | null) ?? null,
    spezifikation: (lead.spezifikation as string | null) ?? null,
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

  // ─── Schritt 3b: Unfallskizze SVG → fall-dokumente Bucket (non-critical) ─
  // Die SVG liegt als Inline-Text in claims.unfallskizze_svg. Für das
  // Kanzleipaket und Downloads brauchen wir eine öffentliche URL.
  // Nur hochladen wenn die Skizze auch freigegeben ist (bestaetigt=true).
  const skizzeSvg = (lead.unfallskizze_svg as string | null) ?? null
  const skizzeBestaetigt = (lead.unfallskizze_bestaetigt as boolean | null) === true
  if (skizzeSvg && skizzeBestaetigt) {
    try {
      const skizzePath = `claim/${claimId}/unfallskizze/unfallskizze.svg`
      const { error: uploadErr } = await admin.storage
        .from('fall-dokumente')
        .upload(skizzePath, Buffer.from(skizzeSvg, 'utf-8'), {
          contentType: 'image/svg+xml',
          upsert: true,
        })
      if (!uploadErr) {
        const { data: urlData } = admin.storage.from('fall-dokumente').getPublicUrl(skizzePath)
        await admin.from('claims').update({ unfallskizze_url: urlData.publicUrl }).eq('id', claimId)
      }
    } catch {
      /* non-critical — Skizze bleibt als SVG-Text im Claim erhalten */
    }
  }

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
      kennzeichen_kreis: (lead.kennzeichen_kreis as string | null) ?? null,
      kennzeichen_buchstaben: (lead.kennzeichen_buchstaben as string | null) ?? null,
      kennzeichen_zahl: (lead.kennzeichen_zahl as string | null) ?? null,
      kennzeichen_suffix: (lead.kennzeichen_suffix as string | null) ?? null,
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
      ...(() => {
        const parts = parseKennzeichen(lead.gegner_kennzeichen as string | null)
        return parts ? {
          kennzeichen_kreis: parts.kreis,
          kennzeichen_buchstaben: parts.buchstaben,
          kennzeichen_zahl: parts.zahl,
          kennzeichen_suffix: parts.suffix,
        } : {}
      })(),
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

  // ─── Schritt 10: fall_dokumente nachholen (non-critical) ───────────────────
  // Während des Uploads im Dispatch-Lead war noch kein Fall vorhanden, deshalb
  // hat insertFallDokument() früh returned (if (!fallId) return). Die Dateien
  // liegen im Bucket, aber die fall_dokumente-Rows fehlen. Wir lesen die
  // Mirror-Felder des Leads und erstellen die fehlenden Rows nach.
  // Fehler hier brechen die Konvertierung nicht ab — die Docs sind im Bucket.
  try {
    await migriereLeadDokumenteZuFall(admin, input.leadId, fallId, lead, now)
  } catch (err) {
    console.error('[convertLeadToClaim] fall_dokumente-Migration fehlgeschlagen:', err)
  }

  // ─── Schritt 11: Pflichtdokumente initialisieren (non-critical) ─────────────
  // ZB1 ist immer Pflicht. Polizeibericht wenn Polizei vor Ort + Bericht pflicht.
  // Bereits hochgeladene Dokumente werden nicht nochmals angefordert.
  try {
    const frist = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    const pflichtInserts: Array<Record<string, unknown>> = []

    const zb1Url = (lead.zb1_url as string | null) ?? null
    if (!zb1Url) {
      pflichtInserts.push({
        fall_id: fallId,
        dokument_typ: 'fahrzeugschein',
        status: 'ausstehend',
        pflicht: true,
        quelle: 'system',
        angefordert_von_rolle: 'system',
        angefordert_am: now,
        frist,
        sort_order: 1,
        begruendung: 'Fahrzeugschein wird für die Gutachtenerstellung benötigt.',
      })
    }

    const polizeiUrl = (lead.polizeibericht_url as string | null) ?? null
    const polizeiVorOrt = Boolean(lead.polizei_vor_ort ?? false)
    const polizeibrichtPflicht = Boolean(lead.polizeibericht_pflicht ?? false)
    if (polizeiVorOrt && polizeibrichtPflicht && !polizeiUrl) {
      pflichtInserts.push({
        fall_id: fallId,
        dokument_typ: 'polizeibericht',
        status: 'ausstehend',
        pflicht: true,
        quelle: 'system',
        angefordert_von_rolle: 'system',
        angefordert_am: now,
        frist,
        sort_order: 2,
        begruendung: 'Polizeiliche Unfallmitteilung erforderlich.',
      })
    }

    if (pflichtInserts.length > 0) {
      await admin.from('pflichtdokumente').insert(pflichtInserts)
    }
  } catch (err) {
    console.error('[convertLeadToClaim] pflichtdokumente-Init fehlgeschlagen:', err)
  }

  // ─── Schritt 12: auftraege-Erstgutachten anlegen (F-04 Fix 2026-05-08) ────
  // CMM-32 hat die auftraege-Tabelle eingeführt + Backfill für Bestands-
  // fälle. Bei NEUEN Fällen wurde aber bisher kein Auftrag angelegt — das
  // SV-Portal /gutachter/auftraege blieb leer obwohl der SV per faelle.sv_id
  // bereits zugeordnet war.
  // Logik analog zum CMM-32b-Backfill: wenn der Fall einen sv_id hat,
  // erzeuge sofort einen Erstgutachten-Auftrag mit Status 'beauftragt'.
  // Idempotent: prüft ob schon ein Erstgutachten-Eintrag für diesen Fall
  // existiert.
  try {
    const svIdAufFall = fallInsert.sv_id ?? null
    if (svIdAufFall) {
      const { data: vorhandenAuftrag } = await admin
        .from('auftraege')
        .select('id')
        .eq('fall_id', fallId)
        .eq('typ', 'erstgutachten')
        .maybeSingle()
      if (!vorhandenAuftrag) {
        await admin.from('auftraege').insert({
          fall_id: fallId,
          claim_id: claimId,
          sv_id: svIdAufFall,
          typ: 'erstgutachten',
          status: 'termin',
          reihenfolge: 1,
        } as never)
      }
    }
  } catch (err) {
    console.error('[convertLeadToClaim] auftraege-Erstgutachten-Insert fehlgeschlagen:', err)
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

// ─── Helper: Mirror-Felder → fall_dokumente ─────────────────────────────────
// Extrahiert den Storage-Pfad aus einer Supabase-Public-URL.
// Format: https://{project}.supabase.co/storage/v1/object/public/fall-dokumente/{path}
function storagePathAusUrl(url: string): string | null {
  const marker = '/object/public/fall-dokumente/'
  const idx = url.indexOf(marker)
  return idx >= 0 ? url.slice(idx + marker.length) : null
}

async function migriereLeadDokumenteZuFall(
  admin: ReturnType<typeof createAdminClient>,
  leadId: string,
  fallId: string,
  lead: Record<string, unknown>,
  now: string,
): Promise<void> {
  const inserts: Array<Record<string, unknown>> = []

  // Polizeibericht
  const polizeiUrl = (lead.polizeibericht_url as string | null) ?? null
  if (polizeiUrl) {
    const storagePath = storagePathAusUrl(polizeiUrl)
    if (storagePath) {
      inserts.push({
        fall_id: fallId,
        lead_id: leadId,
        dokument_typ: 'polizeibericht',
        storage_path: storagePath,
        uploaded_by_kunde: true,
        hochgeladen_am: (lead.polizeibericht_hochgeladen_am as string | null) ?? now,
        beschreibung: 'Polizeiliche Unfallmitteilung',
        quelle: 'lead_migration',
      })
    }
  }

  // Fahrzeugschein (ZB1)
  const zb1Url = (lead.zb1_url as string | null) ?? null
  if (zb1Url) {
    const storagePath = storagePathAusUrl(zb1Url)
    if (storagePath) {
      inserts.push({
        fall_id: fallId,
        lead_id: leadId,
        dokument_typ: 'fahrzeugschein',
        storage_path: storagePath,
        uploaded_by_kunde: true,
        hochgeladen_am: (lead.zb1_hochgeladen_am as string | null) ?? now,
        beschreibung: 'Fahrzeugschein / ZB1',
        quelle: 'lead_migration',
      })
    }
  }

  // Unfallfotos / Schadensfotos (JSONB-Array auf dem Lead)
  const fotoUrls = Array.isArray(lead.schadensfoto_urls)
    ? (lead.schadensfoto_urls as string[])
    : []
  for (const url of fotoUrls) {
    const storagePath = storagePathAusUrl(url)
    if (storagePath) {
      inserts.push({
        fall_id: fallId,
        lead_id: leadId,
        dokument_typ: 'schadensfotos',
        storage_path: storagePath,
        uploaded_by_kunde: true,
        hochgeladen_am: now,
        beschreibung: 'Schadensfoto',
        quelle: 'lead_migration',
      })
    }
  }

  // Weitere Dokument-Typen via dokument_upload_anfragen (kein Mirror-Feld auf leads)
  // Querys alle abgeschlossenen Slots für den Lead und migriert die fehlenden Rows.
  const ANFRAGE_SLOT_MAP: Record<string, string> = {
    sachschaden_foto: 'sachschaden_foto',
    sachschaden_rechnung: 'sachschaden_rechnung',
    aerztliches_attest: 'aerztliches_attest',
    diagnosebericht: 'diagnosebericht',
    zeugenaussage: 'zeugenaussage',
  }
  const { data: anfragen } = await admin
    .from('dokument_upload_anfragen')
    .select('slots')
    .eq('lead_id', leadId)
  for (const anfrage of anfragen ?? []) {
    const slots = anfrage.slots as Array<{
      slot_id: string
      doc_url: string | null
      hochgeladen: boolean
      label: string
      hochgeladen_am: string | null
    }>
    for (const slot of slots ?? []) {
      const dokTyp = ANFRAGE_SLOT_MAP[slot.slot_id]
      if (!dokTyp || !slot.hochgeladen || !slot.doc_url) continue
      const storagePath = storagePathAusUrl(slot.doc_url)
      if (!storagePath) continue
      inserts.push({
        fall_id: fallId,
        lead_id: leadId,
        dokument_typ: dokTyp,
        storage_path: storagePath,
        uploaded_by_kunde: true,
        hochgeladen_am: slot.hochgeladen_am ?? now,
        beschreibung: slot.label,
        quelle: 'lead_migration',
      })
    }
  }

  if (inserts.length === 0) return

  // Idempotenz: nur einfügen wenn die Kombination fall_id + storage_path noch
  // nicht existiert (verhindert Doppel-Rows bei wiederholtem Aufruf).
  const { data: existing } = await admin
    .from('fall_dokumente')
    .select('storage_path')
    .eq('fall_id', fallId)
    .in('quelle', ['lead_migration'])

  const existingPaths = new Set((existing ?? []).map((r) => r.storage_path as string))
  const neueInserts = inserts.filter((r) => !existingPaths.has(r.storage_path as string))

  if (neueInserts.length > 0) {
    await admin.from('fall_dokumente').insert(neueInserts)
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
// Priorität: kundenbetreuer zuerst. Admin nur als Fallback wenn kein aktiver
// KB unter der Schwelle von 100 Fällen verfügbar ist.
const KB_ADMIN_FALLBACK_SCHWELLE = 100

async function countAktiveFaelle(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
): Promise<number> {
  const { count } = await admin
    .from('faelle')
    .select('id', { count: 'exact', head: true })
    .eq('kundenbetreuer_id', profileId)
    .not('status', 'in', '("abgeschlossen","storniert","reguliert","abgelehnt")')
  return count ?? 0
}

async function pickKundenbetreuerRoundRobin(
  admin: ReturnType<typeof createAdminClient>,
): Promise<string | null> {
  // 1. Alle aktiven KBs laden
  const { data: kbList } = await admin
    .from('profiles')
    .select('id')
    .eq('rolle', 'kundenbetreuer')
    .eq('aktiv', true)
    .limit(50)

  const kbs = (kbList ?? []) as Array<{ id: string }>

  if (kbs.length > 0) {
    // Aktive Fälle pro KB zählen
    const counts: Record<string, number> = {}
    for (const kb of kbs) {
      counts[kb.id] = await countAktiveFaelle(admin, kb.id)
    }

    // KBs unter Schwelle bevorzugen; falls alle drüber → trotzdem least-busy KB nehmen
    const unterSchwelle = kbs.filter(kb => counts[kb.id] < KB_ADMIN_FALLBACK_SCHWELLE)
    const pool = unterSchwelle.length > 0 ? unterSchwelle : kbs
    return pool.reduce(
      (m, kb) => (counts[kb.id] < counts[m.id] ? kb : m),
      pool[0],
    ).id
  }

  // 2. Kein aktiver KB → Admin als Fallback (erster aktiver Admin, ältester zuerst)
  const { data: adminList } = await admin
    .from('profiles')
    .select('id')
    .eq('rolle', 'admin')
    .eq('aktiv', true)
    .order('created_at', { ascending: true })
    .limit(1)

  const admins = (adminList ?? []) as Array<{ id: string }>
  return admins[0]?.id ?? null
}
