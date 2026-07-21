// AAR-483 (M1) + AAR-484 (M2): Query-Helper für Makler-Portal. Jede Funktion
// nutzt die auth-aware SSR-Client-Instanz, sodass die RLS-Policies aus
// aar483_m1_makler_additive_rls greifen und Makler nur ihre eigenen Rows
// sehen. Admins/KB/Dispatch sehen via anderer Policies weiterhin alles.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
// Lead x Claim x Consent — pure + unit-getestet (siehe lead-consent.ts fuer das Warum).
import {
  joinLeadsMitConsent,
  type ConsentLabel,
  type LeadBasis,
  type ClaimRef,
  type ConsentRef,
  type LeadMitConsent,
} from './lead-consent'
// CMM-44 MP-4e: 4-Phasen-Modell (v_claim_phase) statt claims.phase-11-Code/Status-Label.
import { getClaimPhaseMap } from '@/lib/claims/claim-phase-map'
import type { ClaimMainPhase, ClaimSubPhase } from '@/lib/claims/lifecycle'
// FG4-A: Provisions-Freigabe = Fall-Completion + 7 Tage. Die pending-Frist wird daraus abgeleitet
// (nicht mehr aus hold_until = Erstellung+7d, seit FG4-A falsch).
import { releaseDeadlineTs } from '@/lib/provisionen/completion-release-gate'
import { loadCompletionMap } from '@/lib/provisionen/completion-fetch'
// Ansprechpartner-Mapping (KB/SV/Kanzlei) + robuste Kunden-Identitaet (Lead-Fallback).
import {
  type MaklerFallKontakte,
  type KundeIdentity,
  buildKanzleiKontakt,
  svDisplayName,
  mergeKundeIdentity,
} from './kontakte'
// Gutachten-Werte direkt aus dem Claim-View (seit #4159 fuer Makler ungegatet — s. Mapper-Doku).
import { type GutachtenWerte, mapGutachtenWerteAusClaimView } from './gutachten-werte'

export type MaklerRow = {
  id: string
  user_id: string | null
  firma: string
  ansprechpartner_vorname: string
  status: string
  erstellt_am: string
  onboarding_abgeschlossen: boolean
  vermittlung_prompt_gesehen: boolean
}

/** Holt die Makler-Row für den eingeloggten User (oder null). */
export async function getCurrentMakler(): Promise<MaklerRow | null> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return null
  const { data } = await supabase
    .from('makler')
    .select('id, user_id, firma, ansprechpartner_vorname, status, erstellt_am, onboarding_abgeschlossen, vermittlung_prompt_gesehen')
    .eq('user_id', user.id)
    .maybeSingle()
  return data
}

// ─────────────────────────────────────────────────────────────────────────────
// AAR-485 (M3) — Leads mit Consent-Status
// ─────────────────────────────────────────────────────────────────────────────

// SSoT der Typen ist ./lead-consent (dort liegt auch der Join) — hier nur re-exportiert,
// damit die Consumer (MaklerLeadsTable) ihre Imports behalten.
export type { ConsentLabel }
export type MaklerLeadRow = LeadMitConsent

/**
 * AAR-485: Leads des Maklers + verknüpfter Fall + makler_fall_consent-Scope.
 *
 * Prod-Fix 14.07.: der frühere Embed `leads -> faelle_claim_bridge -> claims` lieferte
 * HTTP 300 (PGRST201) — `claim_id` ist als Embed-Ziel mehrdeutig, seit
 * partner_provisionen per FK ebenfalls auf faelle_claim_bridge(claim_id) zeigt
 * (Migration 20260708071538). Der Fehler wurde verschluckt (`const { data }`) ->
 * die Lead-Liste war für JEDEN Makler dauerhaft leer. Ausserdem hätte der Embed
 * ohnehin nie aufgelöst: die Bridge hat gar keinen Lead-Bezug.
 * Daher: drei getrennte Reads + Join in JS (siehe ./lead-consent).
 */
export async function getMaklerLeadsWithConsent(maklerId: string): Promise<MaklerLeadRow[]> {
  const supabase = await createClient()

  const { data: promoRows } = await supabase
    .from('promotion_codes')
    .select('id')
    .eq('makler_id', maklerId)
  const promoIds = (promoRows ?? []).map((p) => p.id)
  if (promoIds.length === 0) return []

  const { data: leadRows, error: leadsErr } = await supabase
    .from('leads')
    .select(
      'id, vorname, nachname, fahrzeug_hersteller, fahrzeug_modell, unfalldatum, status, created_at, disqualifiziert',
    )
    .in('promotion_code_id', promoIds)
    .order('created_at', { ascending: false })
  if (leadsErr) {
    console.error('[getMaklerLeadsWithConsent] leads:', leadsErr.message)
    return []
  }
  const leads = (leadRows ?? []) as LeadBasis[]
  if (leads.length === 0) return []

  // lead -> claim: `claims` ist für den Makler RLS-gesperrt (live verifiziert: 0 Zeilen), daher
  // Admin-Client — aber strikt gescoped auf die Leads der EIGENEN Promo-Codes (kein Fremdzugriff)
  // und nur ids/service_typ. Der Consent bleibt auf dem USER-Client: RLS bleibt das Gate.
  const admin = createAdminClient()
  const [claimsRes, consentsRes] = await Promise.all([
    admin
      .from('claims')
      .select('id, lead_id, service_typ')
      .in('lead_id', leads.map((l) => l.id)),
    supabase
      .from('makler_fall_consent')
      .select('claim_id, fall_id, consent_scope, widerrufen_am')
      .eq('makler_id', maklerId),
  ])
  if (claimsRes.error) console.error('[getMaklerLeadsWithConsent] claims:', claimsRes.error.message)
  if (consentsRes.error) console.error('[getMaklerLeadsWithConsent] consents:', consentsRes.error.message)

  return joinLeadsMitConsent(
    leads,
    (claimsRes.data ?? []) as ClaimRef[],
    (consentsRes.data ?? []) as ConsentRef[],
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AAR-487 (M5) — Akte-Detail
// ─────────────────────────────────────────────────────────────────────────────

export type TimelineKind = 'done' | 'current' | 'planned'

export type TimelineEvent = {
  timestamp: string
  title: string
  kind: TimelineKind
  meta?: string
}

export type FallDetailProvision = {
  id: string
  betrag_netto_eur: number
  status: string
  service_typ: string | null
  trigger_at: string | null
}

// Kunden-Identitaet = KundeIdentity (Lead-Fallback-Shape aus kontakte.ts). id ist
// jetzt nullbar (Lead-only-Faelle ohne geschaedigter_user_id) — Consumer nutzen id nicht.
export type FallDetailKunde = KundeIdentity

export type FallDetail = {
  consent_scope: string
  fall: {
    id: string
    claim_nummer: string | null
    // CMM-44 MP-6a / CMM-49 T1.2: abgeleitete 4-Phase + Substate (v_claim_phase) — ersetzt
    // den alten claims.phase-10-Code UND das legacy faelle.status (CMM-71).
    mainPhase: ClaimMainPhase
    subPhase: ClaimSubPhase
    service_typ: string | null
    created_at: string
    updated_at: string | null
    unfalldatum: string | null
    unfallort: string | null
    schadens_art: string | null
    unfallhergang: string | null
    schadens_hoehe_netto: number | null
    fahrzeug_hersteller: string | null
    fahrzeug_modell: string | null
    fahrzeug_baujahr: number | null
    kennzeichen: string | null
    fin_vin: string | null
    kilometerstand: number | null
    erstzulassung: string | null
    gegner_name: string | null
    gegner_kennzeichen: string | null
    gegner_schadennummer: string | null
    gegner_versicherung: string | null
    zeugen_kontakte: unknown
    sv_termin: string | null
    gutachten_eingegangen_am: string | null
    kanzlei_uebergeben_am: string | null
    regulierung_am: string | null
    reparaturkosten: number | null
    wertminderung: number | null
    nutzungsausfall_gesamt: number | null
    gutachter_honorar: number | null
    // Datenminimierung (Variante B, 26.06.): wiederbeschaffungswert/restwert/
    // totalschaden bewusst NICHT im Makler-Type. Die Schaden-Bewertung des Kunden
    // geht einen Vermittler nichts an (Art. 5 DSGVO) — die 3 leben auf gutachten/
    // v_gutachten_werte; hier absichtlich weggelassen, nicht aus Versehen.
    // CMM-44 SP-B PR2b: abtretung_signiert_am lebt auf claims (SSoT) — die View
    // v_faelle_mit_aktuellem_termin liefert die Spalte bereits aus claims
    // (PR1-Repoint), daher flacher View-Read ohne Embed.
    abtretung_signiert_am: string | null
  }
  kunde: FallDetailKunde | null
  /** Ansprechpartner zum Fall (KB/SV/Kanzlei) fuer die Chat-Tab-Karte. */
  kontakte: MaklerFallKontakte
  provision: FallDetailProvision | null
  timeline: TimelineEvent[]
}

/**
 * AAR-487: Lädt einen Fall mit allen für die Detail-Ansicht benötigten
 * Relationen. Authz erfolgt über makler_fall_consent + RLS aus M1.
 * Gibt null zurück, wenn der Fall nicht existiert oder der Makler keinen
 * aktiven Consent hat.
 */
export async function getMaklerFallDetail(
  maklerId: string,
  fallId: string,
): Promise<FallDetail | null> {
  const supabase = await createClient()

  const { data: consent } = await supabase
    .from('makler_fall_consent')
    .select('consent_scope, widerrufen_am')
    .eq('makler_id', maklerId)
    .eq('fall_id', fallId)
    .is('widerrufen_am', null)
    .maybeSingle()
  if (!consent) return null

  // CMM-44 SP-B PR2b: abtretung_signiert_am lebt auf claims (SSoT); die View
  // v_faelle_mit_aktuellem_termin liefert die Spalte bereits aus claims
  // (PR1-Repoint) — flacher View-Read, kein claims-Embed nötig.
  const { data: fall } = await supabase
    .from('v_faelle_mit_aktuellem_termin')
    .select(`
      id, claim_id, claim_nummer, service_typ,
      created_at, updated_at, unfalldatum, unfallort, schadens_art,
      unfallhergang, schadens_hoehe_netto,
      fahrzeug_hersteller, fahrzeug_modell, fahrzeug_baujahr,
      kennzeichen, fin_vin, kilometerstand, erstzulassung,
      gegner_name, gegner_kennzeichen, gegner_schadennummer,
      gegner_versicherung, zeugen_kontakte,
      sv_id, kundenbetreuer_id,
      kanzlei_ansprechpartner_name, kanzlei_ansprechpartner_email, kanzlei_ansprechpartner_telefon,
      sv_termin, gutachten_eingegangen_am, kanzlei_uebergeben_am,
      regulierung_am, reparaturkosten, wertminderung,
      nutzungsausfall_gesamt, gutachter_honorar,
      abtretung_signiert_am
    `)
    .eq('id', fallId)
    .maybeSingle()
  if (!fall) return null

  // claim_id fuer Phase-Read + Kunden/Kontakt-Lookup (View exponiert geschaedigter_user_id nicht).
  const detailClaimId = (fall as { claim_id?: string | null }).claim_id ?? null

  // Makler-PII, scope-gestaffelt: Kunde (geschaedigter) + Ansprechpartner (KB/SV/Kanzlei) via
  // service-role lesen. Der Makler hat bewusst KEINE profiles-RLS — ein RLS-Policy-Ansatz fuehrte
  // zu 42P17-Rekursion (profiles-Policy liest claims, dessen RLS wieder profiles liest). Authz =
  // der oben geprüfte aktive Consent (Route redirected zusaetzlich non-vollzugriff). Kunden-Kontakt
  // ist feld-gestaffelt (vollzugriff -> voll, minimal -> nur Name); KB/SV/Kanzlei sind Claimondo-/
  // Kanzlei-seitige Kontakte (kein Kunden-PII) und werden voll aufgeloest.
  const fallRow = fall as Record<string, unknown>
  const full = consent.consent_scope === 'vollzugriff'
  let kunde: FallDetailKunde | null = null
  let kontakte: MaklerFallKontakte = { kundenbetreuer: null, sv: null, kanzlei: null }
  // Gutachten-Werte kommen aus dem bereits gelesenen View-Row — kein zweiter (service-role-)Read
  // mehr noetig, seit #4159 das rolle_sieht_gutachtenwerte()-Gate entfernt hat (live verifiziert).
  const gutachtenWerte: GutachtenWerte = mapGutachtenWerteAusClaimView(fallRow)

  if (detailClaimId) {
    const admin = createAdminClient()

    // claims traegt geschaedigter_user_id + lead_id (die View exponiert geschaedigter nicht).
    const { data: claimRow } = await admin
      .from('claims')
      .select('geschaedigter_user_id, lead_id')
      .eq('id', detailClaimId)
      .maybeSingle()
    const geschaedigterId = (claimRow?.geschaedigter_user_id as string | null) ?? null
    const leadId = (claimRow?.lead_id as string | null) ?? null
    const kbId = (fallRow.kundenbetreuer_id as string | null) ?? null
    const svId = (fallRow.sv_id as string | null) ?? null

    // Kunde-Profil, Lead (Fallback), KB-Profil und SV-Row parallel.
    const [kProfilRes, leadRes, kbRes, svRowRes] = await Promise.all([
      geschaedigterId
        ? admin.from('profiles').select('id, vorname, nachname, email, telefon, adresse, plz, ort').eq('id', geschaedigterId).maybeSingle()
        : Promise.resolve({ data: null }),
      leadId
        ? admin.from('leads').select('vorname, nachname, telefon, email').eq('id', leadId).maybeSingle()
        : Promise.resolve({ data: null }),
      kbId
        ? admin.from('profiles').select('vorname, nachname, email, telefon').eq('id', kbId).maybeSingle()
        : Promise.resolve({ data: null }),
      svId
        ? admin.from('sachverstaendige').select('profile_id, verifiziert').eq('id', svId).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    // Kunde: Profil bevorzugt, Lead-Fallback (Feld-Audit-Fix — Detail == Liste). full -> Kontakt.
    kunde = mergeKundeIdentity(
      (kProfilRes.data as Partial<KundeIdentity> | null) ?? null,
      (leadRes.data as { vorname: string | null; nachname: string | null; telefon: string | null; email: string | null } | null) ?? null,
      full,
    )

    // Kundenbetreuer.
    const kb = kbRes.data as { vorname: string | null; nachname: string | null; email: string | null; telefon: string | null } | null
    const kundenbetreuer = kb
      ? { vorname: kb.vorname ?? null, nachname: kb.nachname ?? null, email: kb.email ?? null, telefon: kb.telefon ?? null }
      : null

    // Sachverstaendiger: sachverstaendige -> profiles (+ verifiziert, anzeigename-Vorrang).
    let sv: MaklerFallKontakte['sv'] = null
    const svRow = svRowRes.data as { profile_id: string | null; verifiziert: boolean | null } | null
    if (svRow?.profile_id) {
      const { data: svProfil } = await admin
        .from('profiles')
        .select('vorname, nachname, email, telefon, anzeigename')
        .eq('id', svRow.profile_id)
        .maybeSingle()
      if (svProfil) {
        const { vorname, nachname } = svDisplayName(
          svProfil as { anzeigename?: string | null; vorname?: string | null; nachname?: string | null },
        )
        sv = {
          vorname,
          nachname,
          email: (svProfil.email as string | null) ?? null,
          telefon: (svProfil.telefon as string | null) ?? null,
          verifiziert: Boolean(svRow.verifiziert),
        }
      }
    }

    // Kanzlei: direkt aus den View-Feldern (Name-only; FallKontakteCard blendet leer aus).
    const kanzlei = buildKanzleiKontakt(
      fallRow.kanzlei_ansprechpartner_name as string | null,
      fallRow.kanzlei_ansprechpartner_email as string | null,
      fallRow.kanzlei_ansprechpartner_telefon as string | null,
    )

    kontakte = { kundenbetreuer, sv, kanzlei }
  }

  const { data: provisionRows } = await supabase
    .from('partner_provisionen')
    .select('id, betrag_netto_eur, status, service_typ, trigger_at')
    .eq('partner_typ', 'makler')
    .eq('partner_id', maklerId)
    .eq('fall_id', fallId)
    .order('trigger_at', { ascending: false })
    .limit(1)
  const provision = provisionRows?.[0]
    ? {
        id: provisionRows[0].id,
        betrag_netto_eur: Number(provisionRows[0].betrag_netto_eur ?? 0),
        status: provisionRows[0].status,
        service_typ: provisionRows[0].service_typ ?? null,
        trigger_at: provisionRows[0].trigger_at ?? null,
      }
    : null

  // Datenschutz-Entscheid (Aaron 04.07.): Makler sehen KEINE Kundendokumente (Vermittler-
  // Datenminimierung). Frueher wurde hier fall_dokumente gelesen — es gibt aber keine
  // Makler-RLS-Policy, der Read lieferte immer 0 (leerer Tab). Feature entfernt.

  const timeline = buildTimelineForFall(
    fall as unknown as FallDetail['fall'],
    consent as unknown as { consent_scope: string },
  )

  // CMM-44 MP-4e/MP-8b: abgeleitete 4-Phase via Service-Read (Makler-RLS deckt die
  // v_claim_phase-Join-Tabellen nicht ab). v_claim_phase ist claims-zentrisch -> claims.id.
  // detailClaimId ist oben (fuer den Kunden-Lookup) bereits aus fall.claim_id abgeleitet.
  const phaseCell = detailClaimId ? (await getClaimPhaseMap([detailClaimId])).get(detailClaimId) : undefined

  return {
    consent_scope: consent.consent_scope,
    fall: {
      ...(fall as Record<string, unknown>),
      // Gutachten-Werte numerisch normalisiert (der View liefert numeric teils als String).
      ...gutachtenWerte,
      mainPhase: phaseCell?.mainPhase ?? 'erfassung',
      subPhase: phaseCell?.subPhase ?? 'sa_offen',
    } as unknown as FallDetail['fall'],
    kunde,
    kontakte,
    provision,
    timeline,
  }
}

/**
 * Baut die Timeline aus den Datumspunkten des Falls. Pragmatisch — echte
 * Phase-History wird in separatem Ticket nachgezogen, hier reichen die
 * Milestone-Timestamps aus der faelle-Row.
 */
function buildTimelineForFall(
  fall: FallDetail['fall'],
  _consent: { consent_scope: string },
): TimelineEvent[] {
  void _consent
  const events: TimelineEvent[] = []

  events.push({
    timestamp: fall.created_at,
    title: 'Fall angelegt',
    kind: 'done',
  })
  if (fall.abtretung_signiert_am) {
    events.push({
      timestamp: fall.abtretung_signiert_am,
      title: 'Abtretungserklärung unterschrieben',
      kind: 'done',
    })
  }
  if (fall.sv_termin) {
    const inFuture = new Date(fall.sv_termin).getTime() > Date.now()
    events.push({
      timestamp: fall.sv_termin,
      title: inFuture ? 'SV-Termin geplant' : 'SV-Termin',
      kind: inFuture ? 'planned' : 'done',
    })
  }
  if (fall.gutachten_eingegangen_am) {
    events.push({
      timestamp: fall.gutachten_eingegangen_am,
      title: 'Gutachten eingegangen',
      kind: 'done',
    })
  }
  if (fall.kanzlei_uebergeben_am) {
    events.push({
      timestamp: fall.kanzlei_uebergeben_am,
      title: 'An Kanzlei übergeben',
      kind: 'done',
    })
  }
  if (fall.regulierung_am) {
    events.push({
      timestamp: fall.regulierung_am,
      title: 'Reguliert',
      kind: 'done',
    })
  }

  // Sort ascending, mark latest non-future „done" als „current"
  events.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1))
  return events
}

// ─────────────────────────────────────────────────────────────────────────────
// AAR-486 (M4) — Akten-Liste
// ─────────────────────────────────────────────────────────────────────────────

export type AktenFilter = 'aktiv' | 'abgeschlossen' | 'storniert'

export type MaklerAkteRow = {
  id: string
  claim_nummer: string | null
  // CMM-44 MP-6a: abgeleitete 4-Phase + Substate (v_claim_phase) — ersetzt den
  // alten claims.phase-10-Code, der in MP-6c gedroppt wird.
  mainPhase: ClaimMainPhase
  subPhase: ClaimSubPhase
  service_typ: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  sv_termin: string | null
  schadens_hoehe_netto: number | null
  updated_at: string | null
  created_at: string
  kunde_vorname: string | null
  kunde_nachname: string | null
  consent_scope: string
}

// CMM-49 T1.2 (CMM-71): AKTEN_FILTER_STATUS (fall_status-Bucket-Map) entfernt — die drei
// Filter-Chips laufen jetzt über die abgeleitete Phase (v_claim_phase main_phase/sub_phase,
// von v_faelle_mit_aktuellem_termin geliefert). zahlung-eingegangen = AKTIV (Aaron 01.06.):
//   aktiv         = main_phase != 'abschluss'
//   abgeschlossen = main_phase  = 'abschluss' AND sub_phase != 'storniert'
//   storniert     = sub_phase   = 'storniert'

/**
 * AAR-486: Akten des Maklers für einen Filter — Zwei-Schritt-Query:
 * erst fall-ids via makler_fall_consent (aktiver Consent), dann faelle mit
 * Status-Filter + Lead-Join. Vermeidet Supabase-Foreign-Table-Order-Pain.
 */
export async function getMaklerFaelleList(
  maklerId: string,
  filter: AktenFilter,
): Promise<MaklerAkteRow[]> {
  const supabase = await createClient()

  const { data: consentRows } = await supabase
    .from('makler_fall_consent')
    .select('fall_id, consent_scope')
    .eq('makler_id', maklerId)
    .is('widerrufen_am', null)

  const scopeByFall = new Map<string, string>()
  for (const row of consentRows ?? []) {
    if (row.fall_id) scopeByFall.set(row.fall_id, row.consent_scope)
  }
  const fallIds = Array.from(scopeByFall.keys())
  if (fallIds.length === 0) return []

  // CMM-49 T1.2 (CMM-71): Filter über abgeleitete Phase statt faelle.status-Bucket.
  let q = supabase
    .from('v_faelle_mit_aktuellem_termin')
    .select(`
      id, claim_id, claim_nummer, service_typ,
      fahrzeug_hersteller, fahrzeug_modell,
      sv_termin, schadens_hoehe_netto, updated_at, created_at,
      lead:leads!lead_id(vorname, nachname)
    `)
    .in('id', fallIds)
  if (filter === 'aktiv') q = q.neq('main_phase', 'abschluss')
  else if (filter === 'abgeschlossen') q = q.eq('main_phase', 'abschluss').neq('sub_phase', 'storniert')
  else if (filter === 'storniert') q = q.eq('sub_phase', 'storniert')
  const { data } = await q.order('updated_at', { ascending: false, nullsFirst: false })

  // CMM-44 MP-4e/MP-8b: 4-Phase/Substate via Service-Read (Makler-RLS deckt die
  // v_claim_phase-Join-Tabellen nicht ab). v_claim_phase ist claims-zentrisch -> ueber
  // faelle.claim_id mappen (claims.id-Key).
  const listClaimIds = ((data ?? []) as Array<{ claim_id: string | null }>)
    .map((r) => r.claim_id)
    .filter((x): x is string => !!x)
  const phaseMap = await getClaimPhaseMap(listClaimIds)

  type Row = {
    id: string
    claim_id: string | null
    claim_nummer: string | null
    service_typ: string | null
    fahrzeug_hersteller: string | null
    fahrzeug_modell: string | null
    sv_termin: string | null
    schadens_hoehe_netto: number | null
    updated_at: string | null
    created_at: string
    lead:
      | { vorname: string | null; nachname: string | null }[]
      | { vorname: string | null; nachname: string | null }
      | null
  }

  return ((data ?? []) as Row[]).map((r) => {
    const lead = Array.isArray(r.lead) ? r.lead[0] : r.lead
    return {
      id: r.id,
      claim_nummer: r.claim_nummer,
      // CMM-44 MP-4e: abgeleitete 4-Phase + Substate (Default erfassung/sa_offen wenn kein View-Row).
      mainPhase: (r.claim_id ? phaseMap.get(r.claim_id) : undefined)?.mainPhase ?? 'erfassung',
      subPhase: (r.claim_id ? phaseMap.get(r.claim_id) : undefined)?.subPhase ?? 'sa_offen',
      service_typ: r.service_typ,
      fahrzeug_hersteller: r.fahrzeug_hersteller,
      fahrzeug_modell: r.fahrzeug_modell,
      sv_termin: r.sv_termin,
      schadens_hoehe_netto:
        r.schadens_hoehe_netto !== null ? Number(r.schadens_hoehe_netto) : null,
      updated_at: r.updated_at,
      created_at: r.created_at,
      kunde_vorname: lead?.vorname ?? null,
      kunde_nachname: lead?.nachname ?? null,
      consent_scope: scopeByFall.get(r.id) ?? 'minimal',
    }
  })
}

/**
 * Parallele Counts für die Filter-Chips.
 */
export async function getMaklerFaelleCounts(
  maklerId: string,
): Promise<Record<AktenFilter, number>> {
  const supabase = await createClient()
  const { data: consentRows } = await supabase
    .from('makler_fall_consent')
    .select('fall_id')
    .eq('makler_id', maklerId)
    .is('widerrufen_am', null)
  const fallIds = (consentRows ?? [])
    .map((r) => r.fall_id)
    .filter((x): x is string => !!x)
  if (fallIds.length === 0) {
    return { aktiv: 0, abgeschlossen: 0, storniert: 0 }
  }

  // CMM-49 T1.2 (CMM-71): Counts über abgeleitete Phase (v_faelle_mit_aktuellem_termin) statt faelle.status.
  const [aktivRes, abgRes, storRes] = await Promise.all([
    supabase
      .from('v_faelle_mit_aktuellem_termin')
      .select('id', { count: 'exact', head: true })
      .in('id', fallIds)
      .neq('main_phase', 'abschluss'),
    supabase
      .from('v_faelle_mit_aktuellem_termin')
      .select('id', { count: 'exact', head: true })
      .in('id', fallIds)
      .eq('main_phase', 'abschluss')
      .neq('sub_phase', 'storniert'),
    supabase
      .from('v_faelle_mit_aktuellem_termin')
      .select('id', { count: 'exact', head: true })
      .in('id', fallIds)
      .eq('sub_phase', 'storniert'),
  ])

  return {
    aktiv: aktivRes.count ?? 0,
    abgeschlossen: abgRes.count ?? 0,
    storniert: storRes.count ?? 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AAR-484 (M2) — Dashboard-Daten
// ─────────────────────────────────────────────────────────────────────────────

export type DashboardActivityItem =
  | {
      kind: 'lead'
      id: string
      timestamp: string
      titel: string
      status: string
    }
  | {
      kind: 'provision'
      id: string
      timestamp: string
      betrag_netto_eur: number
      status: string
      fall_id: string | null
      kunde_name: string | null
    }

export type DashboardData = {
  stats: {
    offeneLeads: number
    aktiveAkten: number
    monatPending: number
    monatFreigegeben: number
    konversion: number
  }
  activity: DashboardActivityItem[]
  /** Makler hat >=1 erfolgreiche Vermittlung (>=1 Provision) — steuert die Erste-Vermittlung-Card. */
  hatVermittlung: boolean
  /** Primaerer Promo-Code des Maklers (fuer ShareTools in der Erste-Vermittlung-Card); null wenn keiner. */
  promoCode: string | null
}

/**
 * Leichte Einzel-Query: Anzahl offener Leads (Status neu/quali-offen) eines Maklers
 * ueber seine Promo-Codes. Extrahiert aus getMaklerDashboardData, damit die
 * Abrechnungs-Seite die (dorthin verschobene) Pipeline-Karte rendern kann, ohne die
 * volle Dashboard-Aggregation zu laden.
 */
export async function getMaklerOffeneLeadsCount(maklerId: string): Promise<number> {
  const supabase = await createClient()
  const { data: promoRows } = await supabase
    .from('promotion_codes')
    .select('id')
    .eq('makler_id', maklerId)
  const promoIds = (promoRows ?? []).map((p) => p.id)
  if (promoIds.length === 0) return 0
  const { count } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    // gleiche Definition wie getMaklerDashboardData (Status-Enum-Audit: 'quali-offen').
    .in('status', ['neu', 'quali-offen'])
    .in('promotion_code_id', promoIds)
  return count ?? 0
}

/**
 * AAR-484: Parallel-Fetch aller Dashboard-Kennzahlen für einen Makler.
 *
 * Leads-Scope: alle Leads deren promotion_code_id zu einem eigenen Promo-Code
 * gehört. Wir holen die Promo-IDs zuerst und filtern dann via `.in()` — das
 * vermeidet die SQL-Injection-Gefahr der ticket-Spec (wo `.filter(..., 'in',
 * '(SELECT ...)')` mit Template-Literal zusammengebaut war).
 */
export async function getMaklerDashboardData(maklerId: string): Promise<DashboardData> {
  const supabase = await createClient()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // Promo-Code-IDs einmal auflösen, dann als IN-Liste wiederverwenden.
  // `code` zusaetzlich fuer die Erste-Vermittlung-Card (ShareTools braucht den Code-Slug).
  const { data: promoRows } = await supabase
    .from('promotion_codes')
    .select('id, code')
    .eq('makler_id', maklerId)
  const promoIds = (promoRows ?? []).map((p) => p.id)
  const promoCode = (promoRows ?? [])[0]?.code ?? null

  // Wenn keine Promo-Codes existieren → alle lead-basierten Queries sind leer
  // und müssen nicht gefeuert werden.
  const hasPromos = promoIds.length > 0

  const [
    leadsOpenRes,
    leadsTotalRes,
    faelleRes,
    provPendingRes,
    provReleasedRes,
    activityLeadsRes,
    activityProvRes,
    provTotalRes,
  ] = await Promise.all([
    hasPromos
      ? supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          // FIX (Status-Enum-Audit 05.07.): 'qualifiziert' ∉ lead_status-Enum -> 'quali-offen' (wie spontan.ts).
          .in('status', ['neu', 'quali-offen'])
          .in('promotion_code_id', promoIds)
      : Promise.resolve({ data: null, count: 0, error: null }),
    hasPromos
      ? supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .in('promotion_code_id', promoIds)
      : Promise.resolve({ data: null, count: 0, error: null }),
    supabase
      .from('makler_fall_consent')
      .select('fall_id', { count: 'exact', head: true })
      .eq('makler_id', maklerId)
      .is('widerrufen_am', null),
    supabase
      .from('partner_provisionen')
      .select('betrag_netto_eur')
      .eq('partner_typ', 'makler')
      .eq('partner_id', maklerId)
      .eq('status', 'pending'),
    supabase
      .from('partner_provisionen')
      .select('betrag_netto_eur')
      .eq('partner_typ', 'makler')
      .eq('partner_id', maklerId)
      .eq('status', 'freigegeben')
      .gte('trigger_at', monthStart),
    hasPromos
      ? supabase
          .from('leads')
          .select('id, vorname, nachname, created_at, status')
          .in('promotion_code_id', promoIds)
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('partner_provisionen')
      .select(`
        id, betrag_netto_eur, status, trigger_at, fall_id,
        fall:faelle_claim_bridge!partner_provisionen_claim_bridge_fkey(
          claims:claims!fk_bridge_claim(
            leads:lead_id(vorname, nachname),
            kunde:geschaedigter_user_id(vorname, nachname)
          )
        )
      `)
      .eq('partner_typ', 'makler')
      .eq('partner_id', maklerId)
      .order('trigger_at', { ascending: false })
      .limit(5),
    // Erste-Vermittlung-Signal: hat der Makler >=1 Provision (= mind. eine erfolgreiche
    // Vermittlung)? RLS-sicher (Makler liest eigene Provisionen). head+count = billig.
    supabase
      .from('partner_provisionen')
      .select('id', { count: 'exact', head: true })
      .eq('partner_typ', 'makler')
      .eq('partner_id', maklerId),
  ])

  const monatPending = (provPendingRes.data ?? []).reduce(
    (s, r) => s + Number(r.betrag_netto_eur ?? 0),
    0,
  )
  const monatFreigegeben = (provReleasedRes.data ?? []).reduce(
    (s, r) => s + Number(r.betrag_netto_eur ?? 0),
    0,
  )

  const offeneLeads = leadsOpenRes.count ?? 0
  const totalLeads = leadsTotalRes.count ?? 0
  const aktiveAkten = faelleRes.count ?? 0
  const konversion = totalLeads > 0 ? aktiveAkten / totalLeads : 0
  const hatVermittlung = (provTotalRes.count ?? 0) >= 1

  // Activity-Merge: Leads + Provisionen nach Timestamp DESC, Top 10
  const leadsActivity: DashboardActivityItem[] = (activityLeadsRes.data ?? []).map(
    (l) => ({
      kind: 'lead' as const,
      id: l.id,
      timestamp: l.created_at,
      titel: [l.vorname, l.nachname].filter(Boolean).join(' ').trim() || 'Neuer Lead',
      status: l.status,
    }),
  )
  const provActivity: DashboardActivityItem[] = (activityProvRes.data ?? []).map((p) => {
    // Value-Loop-Story: Kunden-/Lead-Name aus dem Nested-Embed (Array|Objekt je Cardinality
    // normalisieren, AGENTS §6). kunde (geschaedigter) hat Vorrang, sonst der Lead-Name.
    const fallRaw = (p as { fall?: unknown }).fall
    const fall = Array.isArray(fallRaw) ? fallRaw[0] : fallRaw
    const claimRaw = (fall as { claims?: unknown } | null | undefined)?.claims
    const claim = Array.isArray(claimRaw) ? claimRaw[0] : claimRaw
    const nameOf = (raw: unknown): string | null => {
      const o = (Array.isArray(raw) ? raw[0] : raw) as
        | { vorname?: string | null; nachname?: string | null }
        | null
        | undefined
      const n = [o?.vorname, o?.nachname].filter(Boolean).join(' ').trim()
      return n.length > 0 ? n : null
    }
    const kunde_name =
      nameOf((claim as { kunde?: unknown } | null | undefined)?.kunde) ??
      nameOf((claim as { leads?: unknown } | null | undefined)?.leads)
    return {
      kind: 'provision' as const,
      id: p.id,
      timestamp: p.trigger_at,
      betrag_netto_eur: Number(p.betrag_netto_eur ?? 0),
      status: p.status,
      fall_id: p.fall_id,
      kunde_name,
    }
  })

  const activity = [...leadsActivity, ...provActivity]
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, 10)

  return {
    stats: {
      offeneLeads,
      aktiveAkten,
      monatPending,
      monatFreigegeben,
      konversion,
    },
    activity,
    hatVermittlung,
    promoCode,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AAR-490 (M8) — Abrechnungen: Provisions-Historie + Monats-Summary
// ─────────────────────────────────────────────────────────────────────────────

export type ProvisionStatus = 'pending' | 'freigegeben' | 'storniert' | 'ausgezahlt'

export type MaklerProvisionRow = {
  id: string
  betrag_netto_eur: number
  status: ProvisionStatus
  service_typ: string | null
  trigger_event: string | null
  trigger_at: string | null
  /** Freigabe-/Clawback-Frist = Fall-Completion + 7 Tage (FG4-A). null = Fall noch nicht abgeschlossen. */
  release_deadline: string | null
  storniert_am: string | null
  storno_grund: string | null
  fall_id: string | null
  claim_nummer: string | null
  kunde_name: string | null
}

export type MaklerAbrechnungsData = {
  monthPending: number
  monthReleased: number
  lifetimeTotal: number
  auszahlungNext: string
  currentMonth: string
  provisionen: MaklerProvisionRow[]
}

/**
 * Bildet yyyy-mm für den aktuellen (oder explizit angefragten) Monat sowie
 * Monatsstart/Ende und das Auszahlungs-Datum (1. des Folgemonats).
 */
function monthRange(monthIso: string | undefined): {
  current: string
  startIso: string
  endIso: string
  auszahlungIso: string
} {
  const now = new Date()
  let year: number
  let month0: number
  if (monthIso && /^\d{4}-\d{2}$/.test(monthIso)) {
    year = Number(monthIso.slice(0, 4))
    month0 = Number(monthIso.slice(5, 7)) - 1
  } else {
    year = now.getFullYear()
    month0 = now.getMonth()
  }
  const start = new Date(Date.UTC(year, month0, 1))
  const end = new Date(Date.UTC(year, month0 + 1, 1))
  const auszahlung = new Date(Date.UTC(year, month0 + 1, 1))
  return {
    current: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    auszahlungIso: auszahlung.toISOString(),
  }
}

function sumBetrag(
  rows: Array<{ betrag_netto_eur: number | string | null }> | null,
): number {
  if (!rows) return 0
  return rows.reduce((s, r) => s + Number(r.betrag_netto_eur ?? 0), 0)
}

export async function getMaklerAbrechnungsData(
  maklerId: string,
  monthIso?: string,
): Promise<MaklerAbrechnungsData> {
  const supabase = await createClient()
  const range = monthRange(monthIso)

  const [pendingRes, releasedRes, totalRes, rowsRes] = await Promise.all([
    supabase
      .from('partner_provisionen')
      .select('betrag_netto_eur')
      .eq('partner_typ', 'makler')
      .eq('partner_id', maklerId)
      .eq('status', 'pending'),
    supabase
      .from('partner_provisionen')
      .select('betrag_netto_eur')
      .eq('partner_typ', 'makler')
      .eq('partner_id', maklerId)
      .in('status', ['freigegeben', 'ausgezahlt'])
      .gte('trigger_at', range.startIso)
      .lt('trigger_at', range.endIso),
    supabase
      .from('partner_provisionen')
      .select('betrag_netto_eur')
      .eq('partner_typ', 'makler')
      .eq('partner_id', maklerId)
      .in('status', ['freigegeben', 'ausgezahlt']),
    supabase
      .from('partner_provisionen')
      .select(
        `
        id, betrag_netto_eur, status, service_typ, trigger_event,
        trigger_at, claim_id, storniert_am, storno_grund,
        fall:faelle_claim_bridge!partner_provisionen_claim_bridge_fkey(
          id:fall_id,
          claims:claims!fk_bridge_claim(
            claim_nummer,
            leads:lead_id(vorname, nachname),
            kunde:geschaedigter_user_id(vorname, nachname)
          )
        )
      `,
      )
      .eq('partner_typ', 'makler')
      .eq('partner_id', maklerId)
      .order('trigger_at', { ascending: false, nullsFirst: false })
      .limit(200),
  ])

  // Fehler NICHT verschlucken: genau das hat den PGRST201-Bruch (s.o.) 6 Tage lang versteckt —
  // die Tabelle war leer, die KPI-Summen darüber zeigten trotzdem Betraege.
  if (rowsRes.error) console.error('[getMaklerAbrechnungsData] provisionen:', rowsRes.error.message)

  // Freigabe-/Clawback-Frist der pending Provisionen = Fall-Completion + 7 Tage (FG4-A-Gate), NICHT
  // mehr hold_until (Erstellung+7d, seit FG4-A falsch). Service-role, da Completion (claims/termine)
  // unter Makler-RLS nicht voll lesbar ist; nur EIGENE pending-claim_ids -> kein Cross-Tenant-Read.
  const rawRows = rowsRes.data ?? []
  const completionMap = await loadCompletionMap(
    createAdminClient(),
    rawRows
      .filter((r) => (r as { status?: string }).status === 'pending')
      .map((r) => (r as { claim_id?: string | null }).claim_id ?? null),
  )

  const provisionen: MaklerProvisionRow[] = rawRows.map((row) => {
    const claimId = (row as { claim_id?: string | null }).claim_id ?? null
    const completion =
      (row as { status?: string }).status === 'pending' && claimId ? completionMap.get(claimId) : undefined
    const fallRaw = (row as { fall?: unknown }).fall
    // CMM-49 Regression-Fix (#2688): FK->bridge-Repoint. leads/kunde haengen jetzt
    // unter claims (bridge hat keine lead_id/kunde_id) -> ueber fallClaim lesen.
    const fall = (Array.isArray(fallRaw) ? fallRaw[0] : fallRaw) as
      | {
          id: string | null
          claims?:
            | Array<{
                claim_nummer: string | null
                leads: { vorname: string | null; nachname: string | null } | { vorname: string | null; nachname: string | null }[] | null
                kunde: { vorname: string | null; nachname: string | null } | { vorname: string | null; nachname: string | null }[] | null
              }>
            | {
                claim_nummer: string | null
                leads: { vorname: string | null; nachname: string | null } | { vorname: string | null; nachname: string | null }[] | null
                kunde: { vorname: string | null; nachname: string | null } | { vorname: string | null; nachname: string | null }[] | null
              }
            | null
        }
      | null
      | undefined

    const fallClaim = Array.isArray(fall?.claims) ? fall?.claims[0] : fall?.claims

    const leadRaw = fallClaim?.leads
    const lead = (Array.isArray(leadRaw) ? leadRaw[0] : leadRaw) as
      | { vorname: string | null; nachname: string | null }
      | null
      | undefined
    const kundeRaw = fallClaim?.kunde
    const kunde = (Array.isArray(kundeRaw) ? kundeRaw[0] : kundeRaw) as
      | { vorname: string | null; nachname: string | null }
      | null
      | undefined

    const namen = [kunde?.vorname, kunde?.nachname]
      .filter(Boolean)
      .join(' ')
      .trim()
    const leadName = [lead?.vorname, lead?.nachname].filter(Boolean).join(' ').trim()
    const kundeName = namen || leadName || null

    return {
      id: row.id as string,
      betrag_netto_eur: Number(row.betrag_netto_eur ?? 0),
      status: (row.status as ProvisionStatus) ?? 'pending',
      service_typ: (row.service_typ as string | null) ?? null,
      trigger_event: (row.trigger_event as string | null) ?? null,
      trigger_at: (row.trigger_at as string | null) ?? null,
      release_deadline: completion ? releaseDeadlineTs(completion) : null,
      storniert_am: (row.storniert_am as string | null) ?? null,
      storno_grund: (row.storno_grund as string | null) ?? null,
      fall_id: fall?.id ?? null,
      claim_nummer: fallClaim?.claim_nummer ?? null,
      kunde_name: kundeName,
    }
  })

  return {
    monthPending: sumBetrag(pendingRes.data),
    monthReleased: sumBetrag(releasedRes.data),
    lifetimeTotal: sumBetrag(totalRes.data),
    auszahlungNext: range.auszahlungIso,
    currentMonth: range.current,
    provisionen,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AAR-488 (M6) — Chat-Tab: Gruppenchat-Integration
// ─────────────────────────────────────────────────────────────────────────────

export type ChatSenderRolle =
  | 'kunde'
  | 'kundenbetreuer'
  | 'sachverstaendiger'
  | 'gutachter'
  | 'makler'
  | 'system'
  | string

export type MaklerChatMessage = {
  id: string
  fall_id: string
  kanal: string
  nachricht: string
  created_at: string
  sender_id: string | null
  sender_rolle: ChatSenderRolle | null
  is_system: boolean
  sender_vorname: string | null
  sender_nachname: string | null
  sender_avatar_url: string | null
}

/**
 * Lädt den Fall-Gruppenchat für die Makler-Sicht. Liest sowohl den bestehenden
 * Kanal `gruppenchat` als auch den reservierten `chat_gruppe_mit_makler`
 * (beide sind im CHECK erlaubt — MVP nutzt `gruppenchat`).
 *
 * Consent-Gate läuft in der Detail-Route; diese Funktion liest nur.
 */
export async function getFallChat(fallId: string): Promise<MaklerChatMessage[]> {
  // v2-Cutover: via Admin lesen (das Vollzugriff-Consent-Gate laeuft in der Detail-Route,
  // page.tsx). Union aus dem v1-Kanal `gruppenchat` UND dem v2-`kunde_gruppe`-Thread des
  // Falls — sonst saehe der Makler die Nachrichten von Kunde/KB/SV NICHT (die sind
  // thread-nativ mit kanal=null). Der Thread wird per thread_id gematcht (nicht fall_id),
  // weil v2-Zeilen fall_id=claim_id tragen (CMM-49), das vom faelle-fall_id abweichen kann.
  const admin = createAdminClient()
  const claimId = await resolveClaimId(admin, fallId)
  let gruppeThreadId: string | null = null
  if (claimId) {
    const { data: thr } = await admin
      .from('chat_threads')
      .select('id')
      .eq('claim_id', claimId)
      .eq('art', 'kunde_gruppe')
      .maybeSingle()
    gruppeThreadId = (thr as { id: string } | null)?.id ?? null
  }

  const selectCols = `
      id,
      fall_id,
      kanal,
      nachricht,
      created_at,
      sender_id,
      sender_rolle,
      is_system,
      sender:profiles!nachrichten_sender_id_fkey(
        id, vorname, nachname, avatar_url
      )
    `
  let query = admin.from('nachrichten').select(selectCols).order('created_at', { ascending: true })
  query = gruppeThreadId
    ? query.or(
        `and(fall_id.eq.${fallId},kanal.in.(gruppenchat,chat_gruppe_mit_makler)),thread_id.eq.${gruppeThreadId}`,
      )
    : query.eq('fall_id', fallId).in('kanal', ['gruppenchat', 'chat_gruppe_mit_makler'])
  const { data, error } = await query

  if (error) {
    console.error('[getFallChat]', error.message)
    return []
  }

  return (data ?? []).map((row) => {
    const senderRaw = (row as { sender: unknown }).sender
    const sender = Array.isArray(senderRaw) ? senderRaw[0] : senderRaw
    const s = (sender ?? null) as
      | { vorname: string | null; nachname: string | null; avatar_url: string | null }
      | null
    return {
      id: row.id as string,
      fall_id: row.fall_id as string,
      kanal: row.kanal as string,
      nachricht: row.nachricht as string,
      created_at: row.created_at as string,
      sender_id: (row.sender_id as string | null) ?? null,
      sender_rolle: (row.sender_rolle as string | null) ?? null,
      is_system: Boolean(row.is_system),
      sender_vorname: s?.vorname ?? null,
      sender_nachname: s?.nachname ?? null,
      sender_avatar_url: s?.avatar_url ?? null,
    }
  })
}

/**
 * Resolviert den `kunde_gruppe`-Thread eines Falls — fuer die MaklerChatTab-Realtime-
 * Subscription auf v2-Nachrichten (Kunde/KB/SV tragen kein kanal='gruppenchat', nur
 * thread_id). null wenn noch kein Gruppen-Thread existiert.
 */
export async function getFallGruppeThreadId(fallId: string): Promise<string | null> {
  const admin = createAdminClient()
  const claimId = await resolveClaimId(admin, fallId)
  if (!claimId) return null
  const { data } = await admin
    .from('chat_threads')
    .select('id')
    .eq('claim_id', claimId)
    .eq('art', 'kunde_gruppe')
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// AAR-491 (M9) — Promo & QR-Code: Stats + Code-Lookup
// ─────────────────────────────────────────────────────────────────────────────

export type PromoCodeRow = {
  id: string
  code: string
  aktiv: boolean
}

export type PromoStats = {
  clicks: number
  leads: number
  akten: number
  konversion: number // akten / leads (0..1)
}

/**
 * Liefert den primären aktiven Promo-Code des Maklers (bei mehreren
 * Codes den zuerst angelegten). Im MVP-Flow hat jeder Makler genau einen.
 */
export async function getMaklerPrimaryPromoCode(
  maklerId: string,
): Promise<PromoCodeRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('promotion_codes')
    .select('id, code, aktiv')
    .eq('makler_id', maklerId)
    .eq('aktiv', true)
    .order('erstellt_am', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data as PromoCodeRow | null) ?? null
}

/**
 * Aggregiert Klicks/Leads/Akten für einen Promo-Code. leads-Count ist
 * via promotion_code_id direkt. akten-Count geht über leads→faelle per
 * lead_id. konversion = akten / leads (0 wenn keine Leads).
 */
export async function getPromoStats(promoCodeId: string): Promise<PromoStats> {
  const supabase = await createClient()

  const [clicksRes, leadsRes, aktenRes] = await Promise.all([
    supabase
      .from('promo_clicks')
      .select('id', { count: 'exact', head: true })
      .eq('promotion_code_id', promoCodeId),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('promotion_code_id', promoCodeId),
    // CMM-49-Fix: Akten = konvertierte Leads dieses Promo-Codes (leads.konvertiert_am gesetzt).
    // Der fruehere Count via `claims` war fuer die Makler-Rolle RLS-unsichtbar (es gibt keine
    // makler-SELECT-Policy auf claims) -> strukturell immer 0. leads sind via
    // promotion_codes.makler_id Makler-sichtbar; konvertiert_am ~= claims.lead_id (live 88 vs 89).
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('promotion_code_id', promoCodeId)
      .not('konvertiert_am', 'is', null),
  ])

  const leads = leadsRes.count ?? 0
  const aktenCount = aktenRes.count ?? 0
  const konversion = leads > 0 ? aktenCount / leads : 0

  return {
    clicks: clicksRes.count ?? 0,
    leads,
    akten: aktenCount,
    konversion,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AAR-492 (M10) — Einstellungen: Consents + Full-Profile-Row
// ─────────────────────────────────────────────────────────────────────────────

export type MaklerFullProfile = {
  id: string
  firma: string | null
  ansprechpartner_vorname: string | null
  ansprechpartner_nachname: string | null
  ihk_nummer: string | null
  ust_id: string | null
  // USt-relevante Abrechnungs-Stammdaten (§14 UStG) — Pflicht bei Anlage,
  // hier nachpflegbar fuer Bestands-Makler (rechtsform kann NULL sein).
  rechtsform: string | null
  ist_kleinunternehmer: boolean
  email: string | null
  telefon: string | null
  adresse_strasse: string | null
  adresse_plz: string | null
  adresse_ort: string | null
  bank_iban: string | null
  bank_bic: string | null
  bank_kontoinhaber: string | null
  notification_preferences: NotificationPreferences
}

export type NotificationPreferences = {
  neuer_lead: boolean
  kanzlei_uebergabe: boolean
  provision_freigegeben: boolean
  monats_abrechnung: boolean
  woechentlicher_report: boolean
}

const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  neuer_lead: true,
  kanzlei_uebergabe: true,
  provision_freigegeben: true,
  monats_abrechnung: true,
  woechentlicher_report: false,
}

export function normalizeNotificationPrefs(
  raw: unknown,
): NotificationPreferences {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_NOTIFICATION_PREFS }
  const r = raw as Record<string, unknown>
  return {
    neuer_lead: r.neuer_lead === undefined ? true : Boolean(r.neuer_lead),
    kanzlei_uebergabe:
      r.kanzlei_uebergabe === undefined ? true : Boolean(r.kanzlei_uebergabe),
    provision_freigegeben:
      r.provision_freigegeben === undefined
        ? true
        : Boolean(r.provision_freigegeben),
    monats_abrechnung:
      r.monats_abrechnung === undefined ? true : Boolean(r.monats_abrechnung),
    woechentlicher_report: Boolean(r.woechentlicher_report),
  }
}

export async function getMaklerFullProfile(
  maklerId: string,
): Promise<MaklerFullProfile | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('makler')
    .select(
      'id, firma, ansprechpartner_vorname, ansprechpartner_nachname, ihk_nummer, ust_id, rechtsform, ist_kleinunternehmer, email, telefon, adresse_strasse, adresse_plz, adresse_ort, bank_iban, bank_bic, bank_kontoinhaber, notification_preferences',
    )
    .eq('id', maklerId)
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id as string,
    firma: (data.firma as string | null) ?? null,
    ansprechpartner_vorname:
      (data.ansprechpartner_vorname as string | null) ?? null,
    ansprechpartner_nachname:
      (data.ansprechpartner_nachname as string | null) ?? null,
    ihk_nummer: (data.ihk_nummer as string | null) ?? null,
    ust_id: (data.ust_id as string | null) ?? null,
    rechtsform: (data.rechtsform as string | null) ?? null,
    // NULL (Bestands-Makler vor der Pflicht) -> false in der UI = "nicht angehakt".
    ist_kleinunternehmer: Boolean(data.ist_kleinunternehmer),
    email: (data.email as string | null) ?? null,
    telefon: (data.telefon as string | null) ?? null,
    adresse_strasse: (data.adresse_strasse as string | null) ?? null,
    adresse_plz: (data.adresse_plz as string | null) ?? null,
    adresse_ort: (data.adresse_ort as string | null) ?? null,
    bank_iban: (data.bank_iban as string | null) ?? null,
    bank_bic: (data.bank_bic as string | null) ?? null,
    bank_kontoinhaber: (data.bank_kontoinhaber as string | null) ?? null,
    notification_preferences: normalizeNotificationPrefs(
      data.notification_preferences,
    ),
  }
}

export type AktiveConsentRow = {
  id: string
  consent_scope: string | null
  consent_gegeben_am: string | null
  fall_id: string | null
  claim_nummer: string | null
  kunde_name: string | null
}

export async function getMaklerAktiveConsents(
  maklerId: string,
): Promise<AktiveConsentRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('makler_fall_consent')
    .select(
      `
      id, consent_scope, consent_gegeben_am,
      fall:faelle_claim_bridge!makler_fall_consent_fall_id_fkey(
        id:fall_id,
        claims:claims!fk_bridge_claim(
          claim_nummer,
          leads:lead_id(vorname, nachname),
          kunde:geschaedigter_user_id(vorname, nachname)
        )
      )
      `,
    )
    .eq('makler_id', maklerId)
    .is('widerrufen_am', null)
    .order('consent_gegeben_am', { ascending: false })

  return (data ?? []).map((row) => {
    const fallRaw = (row as { fall?: unknown }).fall
    // CMM-49 Regression-Fix (#2688): FK->bridge-Repoint. leads/kunde haengen jetzt
    // unter claims (bridge hat keine lead_id/kunde_id) -> ueber fallClaim lesen.
    const fall = (Array.isArray(fallRaw) ? fallRaw[0] : fallRaw) as
      | {
          id: string | null
          claims?:
            | Array<{
                claim_nummer: string | null
                leads: { vorname: string | null; nachname: string | null } | { vorname: string | null; nachname: string | null }[] | null
                kunde: { vorname: string | null; nachname: string | null } | { vorname: string | null; nachname: string | null }[] | null
              }>
            | {
                claim_nummer: string | null
                leads: { vorname: string | null; nachname: string | null } | { vorname: string | null; nachname: string | null }[] | null
                kunde: { vorname: string | null; nachname: string | null } | { vorname: string | null; nachname: string | null }[] | null
              }
            | null
        }
      | null
      | undefined

    const fallClaim = Array.isArray(fall?.claims) ? fall?.claims[0] : fall?.claims

    const leadRaw = fallClaim?.leads
    const lead = (Array.isArray(leadRaw) ? leadRaw[0] : leadRaw) as
      | { vorname: string | null; nachname: string | null }
      | null
      | undefined
    const kundeRaw = fallClaim?.kunde
    const kunde = (Array.isArray(kundeRaw) ? kundeRaw[0] : kundeRaw) as
      | { vorname: string | null; nachname: string | null }
      | null
      | undefined

    const kundeName =
      [kunde?.vorname, kunde?.nachname].filter(Boolean).join(' ').trim() ||
      [lead?.vorname, lead?.nachname].filter(Boolean).join(' ').trim() ||
      null

    return {
      id: row.id as string,
      consent_scope: (row.consent_scope as string | null) ?? null,
      consent_gegeben_am: (row.consent_gegeben_am as string | null) ?? null,
      fall_id: fall?.id ?? null,
      claim_nummer: fallClaim?.claim_nummer ?? null,
      kunde_name: kundeName,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Staffelung (Meilenstein-Boni) — 1:1 gespiegelt vom Werkstatt-System
// (src/lib/werkstatt/queries.ts). Metrik = Anzahl freigegebener/ausgezahlter
// Provisionen (settled); der DB-Trigger trg_award_makler_staffel vergibt bei
// genau diesem Count. RLS: Makler liest eigene Zeilen (mss_/msb_makler_read).
// ─────────────────────────────────────────────────────────────────────────────

/** settled = freigegeben+ausgezahlt (zaehlt fuer Meilensteine), pending = Hinweis. */
export async function getMaklerVermittlungsCount(
  maklerId: string,
): Promise<{ settled: number; pending: number }> {
  const supabase = await createClient()
  const [settledRes, pendingRes] = await Promise.all([
    supabase.from('partner_provisionen').select('id', { count: 'exact', head: true })
      .eq('partner_typ', 'makler').eq('partner_id', maklerId).in('status', ['freigegeben', 'ausgezahlt']),
    supabase.from('partner_provisionen').select('id', { count: 'exact', head: true })
      .eq('partner_typ', 'makler').eq('partner_id', maklerId).eq('status', 'pending'),
  ])
  return { settled: settledRes.count ?? 0, pending: pendingRes.count ?? 0 }
}

export async function getMaklerStaffelStufen(
  maklerId: string,
): Promise<{ schwelle: number; bonus_betrag_netto: number }[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('makler_staffel_stufen')
    .select('schwelle, bonus_betrag_netto').eq('makler_id', maklerId)
    .order('schwelle', { ascending: true })
  return (data ?? []).map((r) => ({
    schwelle: Number(r.schwelle),
    bonus_betrag_netto: Number(r.bonus_betrag_netto),
  }))
}

export async function getMaklerStaffelBoni(
  maklerId: string,
): Promise<{ schwelle: number; bonus_betrag_netto: number; status: string; erstellt_am: string }[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('partner_staffel_bonus')
    .select('schwelle, bonus_betrag_netto, status, erstellt_am')
    .eq('partner_typ', 'makler').eq('partner_id', maklerId)
    .order('schwelle', { ascending: true })
  return (data ?? []).map((r) => ({
    schwelle: Number(r.schwelle),
    bonus_betrag_netto: Number(r.bonus_betrag_netto),
    status: r.status,
    erstellt_am: r.erstellt_am,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Provisions-Rechnung — Daten fuer die herunterladbare Makler-Rechnung
// (freigegebene = abrechenbare Provisionen als Positionen + Aussteller-Stammdaten).
// ─────────────────────────────────────────────────────────────────────────────

export type MaklerRechnungPositionen = {
  makler: { firma: string; adresse: string; ustId: string | null; iban: string | null; bic: string | null; kontoinhaber: string | null }
  positionen: { nr: number; datum: string; fallNr: string; kundeName: string; betragNetto: number }[]
  nettoGesamt: number
}

export async function getMaklerRechnungData(maklerId: string): Promise<MaklerRechnungPositionen | null> {
  const supabase = await createClient()
  const { data: m } = await supabase
    .from('makler')
    .select('firma, adresse_strasse, adresse_plz, adresse_ort, ust_id, bank_iban, bank_bic, bank_kontoinhaber')
    .eq('id', maklerId)
    .maybeSingle()
  if (!m) return null

  // Freigegebene Provisionen = abrechenbar. Namen via bewaehrtem Nested-Embed (wie Dashboard-Activity).
  const { data: provs } = await supabase
    .from('partner_provisionen')
    .select(`
      id, betrag_netto_eur, trigger_at,
      fall:faelle_claim_bridge!partner_provisionen_claim_bridge_fkey(
        claims:claims!fk_bridge_claim(
          claim_nummer,
          leads:lead_id(vorname, nachname),
          kunde:geschaedigter_user_id(vorname, nachname)
        )
      )
    `)
    .eq('partner_typ', 'makler')
    .eq('partner_id', maklerId)
    .eq('status', 'freigegeben')
    .order('trigger_at', { ascending: true })

  const DATE = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const nameOf = (raw: unknown): string | null => {
    const o = (Array.isArray(raw) ? raw[0] : raw) as { vorname?: string | null; nachname?: string | null } | null | undefined
    const n = [o?.vorname, o?.nachname].filter(Boolean).join(' ').trim()
    return n.length > 0 ? n : null
  }
  const positionen = (provs ?? []).map((p, i) => {
    const fallRaw = (p as { fall?: unknown }).fall
    const fall = Array.isArray(fallRaw) ? fallRaw[0] : fallRaw
    const claimRaw = (fall as { claims?: unknown } | null | undefined)?.claims
    const claim = Array.isArray(claimRaw) ? claimRaw[0] : claimRaw
    const kundeName =
      nameOf((claim as { kunde?: unknown } | null | undefined)?.kunde) ??
      nameOf((claim as { leads?: unknown } | null | undefined)?.leads) ??
      'Vermittlung'
    return {
      nr: i + 1,
      datum: p.trigger_at ? DATE.format(new Date(p.trigger_at as string)) : '—',
      fallNr: ((claim as { claim_nummer?: string | null } | null | undefined)?.claim_nummer) ?? '—',
      kundeName,
      betragNetto: Number(p.betrag_netto_eur ?? 0),
    }
  })
  const nettoGesamt = positionen.reduce((sum, p) => sum + p.betragNetto, 0)
  const adresse = [m.adresse_strasse, [m.adresse_plz, m.adresse_ort].filter(Boolean).join(' ')]
    .filter((z) => z && z.trim().length > 0)
    .join('\n')

  return {
    makler: {
      firma: m.firma,
      adresse,
      ustId: m.ust_id ?? null,
      iban: m.bank_iban ?? null,
      bic: m.bank_bic ?? null,
      kontoinhaber: m.bank_kontoinhaber ?? null,
    },
    positionen,
    nettoGesamt,
  }
}
