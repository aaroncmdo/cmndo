// AAR-483 (M1) + AAR-484 (M2): Query-Helper für Makler-Portal. Jede Funktion
// nutzt die auth-aware SSR-Client-Instanz, sodass die RLS-Policies aus
// aar483_m1_makler_additive_rls greifen und Makler nur ihre eigenen Rows
// sehen. Admins/KB/Dispatch sehen via anderer Policies weiterhin alles.

import { createClient } from '@/lib/supabase/server'

export type MaklerRow = {
  id: string
  user_id: string | null
  firma: string
  ansprechpartner_vorname: string
  status: string
  erstellt_am: string
}

/** Holt die Makler-Row für den eingeloggten User (oder null). */
export async function getCurrentMakler(): Promise<MaklerRow | null> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return null
  const { data } = await supabase
    .from('makler')
    .select('id, user_id, firma, ansprechpartner_vorname, status, erstellt_am')
    .eq('user_id', user.id)
    .maybeSingle()
  return data
}

/**
 * Leads für einen Makler — über promotion_code_id → promotion_codes.makler_id.
 * Nutzt Nested-FK-Filter via `!inner`, damit Leads ohne Promo-Code (optional
 * nullable FK) für Makler unsichtbar bleiben.
 */
export async function getMaklerLeads(maklerId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('leads')
    .select(`
      id, vorname, nachname, service_typ, status, created_at,
      promotion_code:promotion_codes!inner(id, code, makler_id)
    `)
    .eq('promotion_code.makler_id', maklerId)
    .order('created_at', { ascending: false })
  return data ?? []
}

/**
 * Fälle eines Maklers — nur mit aktivem Consent (widerrufen_am IS NULL).
 * Cardinality ist many-to-one, dennoch kann Supabase den Nested-Select je
 * nach Session als Array liefern — Consumer muss `Array.isArray(x) ? x[0] : x`
 * normalisieren.
 */
export async function getMaklerFaelle(maklerId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('makler_fall_consent')
    .select(`
      id, consent_scope, consent_gegeben_am, widerrufen_am,
      fall:faelle!inner(id, status, service_typ)
    `)
    .eq('makler_id', maklerId)
    .is('widerrufen_am', null)
    .order('consent_gegeben_am', { ascending: false })
  return data ?? []
}

// ─────────────────────────────────────────────────────────────────────────────
// AAR-485 (M3) — Leads mit Consent-Status
// ─────────────────────────────────────────────────────────────────────────────

export type ConsentLabel = 'kein_account' | 'minimal' | 'vollzugriff' | 'widerrufen'

export type MaklerLeadRow = {
  id: string
  vorname: string | null
  nachname: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  unfalldatum: string | null
  status: string
  created_at: string
  disqualifiziert: boolean | null
  fall_id: string | null
  fall_service_typ: string | null
  consent_label: ConsentLabel
}

type LeadRowRaw = {
  id: string
  vorname: string | null
  nachname: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  unfalldatum: string | null
  status: string
  created_at: string
  disqualifiziert: boolean | null
  fall:
    | {
        id: string
        service_typ: string
        makler_consent:
          | { consent_scope: string; widerrufen_am: string | null }[]
          | { consent_scope: string; widerrufen_am: string | null }
          | null
      }[]
    | {
        id: string
        service_typ: string
        makler_consent:
          | { consent_scope: string; widerrufen_am: string | null }[]
          | { consent_scope: string; widerrufen_am: string | null }
          | null
      }
    | null
}

/**
 * AAR-485: Leads des Maklers + verknüpfte Fall + makler_fall_consent Scope.
 * Supabase Cardinality kann Arrays oder Objects zurückgeben — beides
 * normalisieren.
 */
export async function getMaklerLeadsWithConsent(maklerId: string): Promise<MaklerLeadRow[]> {
  const supabase = await createClient()

  const { data: promoRows } = await supabase
    .from('promotion_codes')
    .select('id')
    .eq('makler_id', maklerId)
  const promoIds = (promoRows ?? []).map((p) => p.id)
  if (promoIds.length === 0) return []

  const { data } = await supabase
    .from('leads')
    .select(`
      id, vorname, nachname, fahrzeug_hersteller, fahrzeug_modell,
      unfalldatum, status, created_at, disqualifiziert,
      fall:faelle(
        id, service_typ,
        makler_consent:makler_fall_consent(consent_scope, widerrufen_am)
      )
    `)
    .in('promotion_code_id', promoIds)
    .order('created_at', { ascending: false })

  return ((data ?? []) as LeadRowRaw[]).map((lead) => {
    const fall = Array.isArray(lead.fall) ? lead.fall[0] : lead.fall
    const rawConsent = fall?.makler_consent
    const consent = rawConsent
      ? Array.isArray(rawConsent)
        ? rawConsent[0]
        : rawConsent
      : null

    let consent_label: ConsentLabel = 'kein_account'
    if (!fall) consent_label = 'kein_account'
    else if (consent?.widerrufen_am) consent_label = 'widerrufen'
    else if (consent?.consent_scope === 'minimal') consent_label = 'minimal'
    else if (consent?.consent_scope === 'vollzugriff') consent_label = 'vollzugriff'

    return {
      id: lead.id,
      vorname: lead.vorname,
      nachname: lead.nachname,
      fahrzeug_hersteller: lead.fahrzeug_hersteller,
      fahrzeug_modell: lead.fahrzeug_modell,
      unfalldatum: lead.unfalldatum,
      status: lead.status,
      created_at: lead.created_at,
      disqualifiziert: lead.disqualifiziert,
      fall_id: fall?.id ?? null,
      fall_service_typ: fall?.service_typ ?? null,
      consent_label,
    }
  })
}

/**
 * AAR-485: Provisions-Betrag für einen Fall basierend auf Makler-Sätzen
 * und service_typ. Wenn der Fall `komplett` (Vollservice) ist → komplett-
 * Betrag, sonst Gutachter-Betrag (fallback für unbekannte Service-Typen).
 */
export function provisionFuerServiceTyp(
  makler: { provision_betrag_komplett_netto: number | null; provision_betrag_nur_gutachter_netto: number | null },
  serviceTyp: string | null,
): number {
  const full = Number(makler.provision_betrag_komplett_netto ?? 0)
  const partial = Number(makler.provision_betrag_nur_gutachter_netto ?? 0)
  if (!serviceTyp) return partial
  return serviceTyp.toLowerCase().includes('komplett') ? full : partial
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

export type FallDetailDocument = {
  id: string
  dokument_typ: string
  original_filename: string | null
  mime_type: string | null
  groesse_bytes: number | null
  hochgeladen_am: string | null
  storage_path: string | null
}

export type FallDetailProvision = {
  id: string
  betrag_netto_eur: number
  status: string
  service_typ: string | null
  trigger_at: string | null
  hold_until: string | null
}

export type FallDetailKunde = {
  id: string
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
  adresse: string | null
  plz: string | null
  ort: string | null
}

export type FallDetail = {
  consent_scope: string
  fall: {
    id: string
    fall_nummer: string | null
    status: string
    aktuelle_phase: string | null
    service_typ: string | null
    created_at: string
    updated_at: string | null
    unfalldatum: string | null
    unfallort: string | null
    schadenart: string | null
    unfallhergang: string | null
    schadenhoehe_netto: number | null
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
    wiederbeschaffungswert: number | null
    restwert: number | null
    totalschaden: boolean | null
    abtretung_signiert_am: string | null
  }
  kunde: FallDetailKunde | null
  provision: FallDetailProvision | null
  documents: FallDetailDocument[]
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

  const { data: fall } = await supabase
    .from('faelle')
    .select(`
      id, fall_nummer, status, aktuelle_phase, service_typ,
      created_at, updated_at, unfalldatum, unfallort, schadenart,
      unfallhergang, schadenhoehe_netto,
      fahrzeug_hersteller, fahrzeug_modell, fahrzeug_baujahr,
      kennzeichen, fin_vin, kilometerstand, erstzulassung,
      gegner_name, gegner_kennzeichen, gegner_schadennummer,
      gegner_versicherung, zeugen_kontakte,
      sv_termin, gutachten_eingegangen_am, kanzlei_uebergeben_am,
      regulierung_am, reparaturkosten, wertminderung,
      nutzungsausfall_gesamt, gutachter_honorar,
      wiederbeschaffungswert, restwert, totalschaden,
      abtretung_signiert_am,
      kunde:profiles!faelle_kunde_id_fkey(
        id, vorname, nachname, email, telefon, adresse, plz, ort
      )
    `)
    .eq('id', fallId)
    .maybeSingle()
  if (!fall) return null

  const rawKunde = (fall as { kunde: unknown }).kunde
  const kunde = (Array.isArray(rawKunde) ? rawKunde[0] : rawKunde) as
    | FallDetailKunde
    | null

  const { data: provisionRows } = await supabase
    .from('makler_provisionen')
    .select('id, betrag_netto_eur, status, service_typ, trigger_at, hold_until')
    .eq('makler_id', maklerId)
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
        hold_until: provisionRows[0].hold_until ?? null,
      }
    : null

  const { data: documents } = await supabase
    .from('fall_dokumente')
    .select(
      'id, dokument_typ, original_filename, mime_type, groesse_bytes, hochgeladen_am, storage_path',
    )
    .eq('fall_id', fallId)
    .is('geloescht_am', null)
    .order('hochgeladen_am', { ascending: false })

  const timeline = buildTimelineForFall(
    fall as unknown as FallDetail['fall'],
    consent as unknown as { consent_scope: string },
  )

  return {
    consent_scope: consent.consent_scope,
    fall: fall as unknown as FallDetail['fall'],
    kunde,
    provision,
    documents: (documents ?? []) as FallDetailDocument[],
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

/**
 * Erzeugt Signed-URLs für alle Dokumente eines Falls. Supabase Storage
 * Bucket: `fall-dokumente` (siehe Admin-Settings).
 */
export async function getDocumentSignedUrls(
  docs: FallDetailDocument[],
): Promise<Record<string, string | null>> {
  if (docs.length === 0) return {}
  const supabase = await createClient()
  const result: Record<string, string | null> = {}
  await Promise.all(
    docs.map(async (d) => {
      if (!d.storage_path) {
        result[d.id] = null
        return
      }
      const { data } = await supabase.storage
        .from('fall-dokumente')
        .createSignedUrl(d.storage_path, 3600)
      result[d.id] = data?.signedUrl ?? null
    }),
  )
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// AAR-486 (M4) — Akten-Liste
// ─────────────────────────────────────────────────────────────────────────────

export type AktenFilter = 'aktiv' | 'abgeschlossen' | 'storniert'

export type MaklerAkteRow = {
  id: string
  fall_nummer: string | null
  status: string
  aktuelle_phase: string | null
  service_typ: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  sv_termin: string | null
  schadenhoehe_netto: number | null
  updated_at: string | null
  created_at: string
  kunde_vorname: string | null
  kunde_nachname: string | null
  consent_scope: string
}

/**
 * Status-Gruppen für die drei Filter-Chips. Wir mappen auf den tatsächlichen
 * faelle.status-Enum (siehe DB): alles was nicht „abgeschlossen"/„storniert"/
 * „zahlung-eingegangen" ist, gilt als „aktiv".
 */
const AKTEN_FILTER_STATUS: Record<AktenFilter, string[]> = {
  aktiv: [
    'ersterfassung',
    'onboarding',
    'sv-gesucht',
    'sv-zugewiesen',
    'sv-termin',
    'besichtigung',
    'begutachtung-laeuft',
    'gutachten-eingegangen',
    'filmcheck',
    'qc-pruefung',
    'kanzlei-uebergeben',
    'anschlussschreiben',
    'regulierung',
    'regulierung-laeuft',
    'nachbesichtigung-laeuft',
    'vs-abgelehnt',
  ],
  abgeschlossen: ['abgeschlossen', 'zahlung-eingegangen'],
  storniert: ['storniert'],
}

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

  const { data } = await supabase
    .from('faelle')
    .select(`
      id, fall_nummer, status, aktuelle_phase, service_typ,
      fahrzeug_hersteller, fahrzeug_modell,
      sv_termin, schadenhoehe_netto, updated_at, created_at,
      lead:leads(vorname, nachname)
    `)
    .in('id', fallIds)
    .in('status', AKTEN_FILTER_STATUS[filter])
    .order('updated_at', { ascending: false, nullsFirst: false })

  type Row = {
    id: string
    fall_nummer: string | null
    status: string
    aktuelle_phase: string | null
    service_typ: string | null
    fahrzeug_hersteller: string | null
    fahrzeug_modell: string | null
    sv_termin: string | null
    schadenhoehe_netto: number | null
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
      fall_nummer: r.fall_nummer,
      status: r.status,
      aktuelle_phase: r.aktuelle_phase,
      service_typ: r.service_typ,
      fahrzeug_hersteller: r.fahrzeug_hersteller,
      fahrzeug_modell: r.fahrzeug_modell,
      sv_termin: r.sv_termin,
      schadenhoehe_netto:
        r.schadenhoehe_netto !== null ? Number(r.schadenhoehe_netto) : null,
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

  const [aktivRes, abgRes, storRes] = await Promise.all([
    supabase
      .from('faelle')
      .select('id', { count: 'exact', head: true })
      .in('id', fallIds)
      .in('status', AKTEN_FILTER_STATUS.aktiv),
    supabase
      .from('faelle')
      .select('id', { count: 'exact', head: true })
      .in('id', fallIds)
      .in('status', AKTEN_FILTER_STATUS.abgeschlossen),
    supabase
      .from('faelle')
      .select('id', { count: 'exact', head: true })
      .in('id', fallIds)
      .in('status', AKTEN_FILTER_STATUS.storniert),
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
  const { data: promoRows } = await supabase
    .from('promotion_codes')
    .select('id')
    .eq('makler_id', maklerId)
  const promoIds = (promoRows ?? []).map((p) => p.id)

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
  ] = await Promise.all([
    hasPromos
      ? supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .in('status', ['neu', 'qualifiziert'])
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
      .from('makler_provisionen')
      .select('betrag_netto_eur')
      .eq('makler_id', maklerId)
      .eq('status', 'pending'),
    supabase
      .from('makler_provisionen')
      .select('betrag_netto_eur')
      .eq('makler_id', maklerId)
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
      .from('makler_provisionen')
      .select('id, betrag_netto_eur, status, trigger_at, fall_id')
      .eq('makler_id', maklerId)
      .order('trigger_at', { ascending: false })
      .limit(5),
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
  const provActivity: DashboardActivityItem[] = (activityProvRes.data ?? []).map(
    (p) => ({
      kind: 'provision' as const,
      id: p.id,
      timestamp: p.trigger_at,
      betrag_netto_eur: Number(p.betrag_netto_eur ?? 0),
      status: p.status,
      fall_id: p.fall_id,
    }),
  )

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
  hold_until: string | null
  storniert_am: string | null
  storno_grund: string | null
  fall_id: string | null
  fall_nummer: string | null
  fall_status: string | null
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
      .from('makler_provisionen')
      .select('betrag_netto_eur')
      .eq('makler_id', maklerId)
      .eq('status', 'pending'),
    supabase
      .from('makler_provisionen')
      .select('betrag_netto_eur')
      .eq('makler_id', maklerId)
      .in('status', ['freigegeben', 'ausgezahlt'])
      .gte('trigger_at', range.startIso)
      .lt('trigger_at', range.endIso),
    supabase
      .from('makler_provisionen')
      .select('betrag_netto_eur')
      .eq('makler_id', maklerId)
      .in('status', ['freigegeben', 'ausgezahlt']),
    supabase
      .from('makler_provisionen')
      .select(
        `
        id, betrag_netto_eur, status, service_typ, trigger_event,
        trigger_at, hold_until, storniert_am, storno_grund,
        fall:faelle!makler_provisionen_fall_id_fkey(
          id, fall_nummer, status,
          leads(vorname, nachname),
          kunde:profiles!faelle_kunde_id_fkey(vorname, nachname)
        )
      `,
      )
      .eq('makler_id', maklerId)
      .order('trigger_at', { ascending: false, nullsFirst: false })
      .limit(200),
  ])

  const provisionen: MaklerProvisionRow[] = (rowsRes.data ?? []).map((row) => {
    const fallRaw = (row as { fall?: unknown }).fall
    const fall = (Array.isArray(fallRaw) ? fallRaw[0] : fallRaw) as
      | {
          id: string | null
          fall_nummer: string | null
          status: string | null
          leads?:
            | Array<{ vorname: string | null; nachname: string | null }>
            | { vorname: string | null; nachname: string | null }
            | null
          kunde?:
            | Array<{ vorname: string | null; nachname: string | null }>
            | { vorname: string | null; nachname: string | null }
            | null
        }
      | null
      | undefined

    const leadRaw = fall?.leads
    const lead = (Array.isArray(leadRaw) ? leadRaw[0] : leadRaw) as
      | { vorname: string | null; nachname: string | null }
      | null
      | undefined
    const kundeRaw = fall?.kunde
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
      hold_until: (row.hold_until as string | null) ?? null,
      storniert_am: (row.storniert_am as string | null) ?? null,
      storno_grund: (row.storno_grund as string | null) ?? null,
      fall_id: fall?.id ?? null,
      fall_nummer: fall?.fall_nummer ?? null,
      fall_status: fall?.status ?? null,
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
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('nachrichten')
    .select(
      `
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
    `,
    )
    .eq('fall_id', fallId)
    .in('kanal', ['gruppenchat', 'chat_gruppe_mit_makler'])
    .order('created_at', { ascending: true })

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
 * Zählt ungelesene Gruppenchat-Nachrichten für den eingeloggten User im
 * gegebenen Fall. Nutzt die `gelesen`-Spalte auf `nachrichten` (dieselbe
 * Logik wie MultiChannelChat im Hauptportal).
 */
export async function getUngeleseneChatCount(
  userId: string,
  fallId: string,
): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('nachrichten')
    .select('id', { count: 'exact', head: true })
    .eq('fall_id', fallId)
    .in('kanal', ['gruppenchat', 'chat_gruppe_mit_makler'])
    .eq('gelesen', false)
    .neq('sender_id', userId)
  return count ?? 0
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

  const [clicksRes, leadsRes, leadIdsRes] = await Promise.all([
    supabase
      .from('promo_clicks')
      .select('id', { count: 'exact', head: true })
      .eq('promotion_code_id', promoCodeId),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('promotion_code_id', promoCodeId),
    supabase
      .from('leads')
      .select('id')
      .eq('promotion_code_id', promoCodeId),
  ])

  const leadIds = (leadIdsRes.data ?? []).map((r) => r.id as string)
  let aktenCount = 0
  if (leadIds.length > 0) {
    const { count } = await supabase
      .from('faelle')
      .select('id', { count: 'exact', head: true })
      .in('lead_id', leadIds)
    aktenCount = count ?? 0
  }

  const leads = leadsRes.count ?? 0
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
      'id, firma, ansprechpartner_vorname, ansprechpartner_nachname, ihk_nummer, email, telefon, adresse_strasse, adresse_plz, adresse_ort, bank_iban, bank_bic, bank_kontoinhaber, notification_preferences',
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
  fall_nummer: string | null
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
      fall:faelle!makler_fall_consent_fall_id_fkey(
        id, fall_nummer,
        leads(vorname, nachname),
        kunde:profiles!faelle_kunde_id_fkey(vorname, nachname)
      )
      `,
    )
    .eq('makler_id', maklerId)
    .is('widerrufen_am', null)
    .order('consent_gegeben_am', { ascending: false })

  return (data ?? []).map((row) => {
    const fallRaw = (row as { fall?: unknown }).fall
    const fall = (Array.isArray(fallRaw) ? fallRaw[0] : fallRaw) as
      | {
          id: string | null
          fall_nummer: string | null
          leads?:
            | Array<{ vorname: string | null; nachname: string | null }>
            | { vorname: string | null; nachname: string | null }
            | null
          kunde?:
            | Array<{ vorname: string | null; nachname: string | null }>
            | { vorname: string | null; nachname: string | null }
            | null
        }
      | null
      | undefined

    const leadRaw = fall?.leads
    const lead = (Array.isArray(leadRaw) ? leadRaw[0] : leadRaw) as
      | { vorname: string | null; nachname: string | null }
      | null
      | undefined
    const kundeRaw = fall?.kunde
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
      fall_nummer: fall?.fall_nummer ?? null,
      kunde_name: kundeName,
    }
  })
}
