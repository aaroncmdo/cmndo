// AAR-956 WP-B (Task 9): Query-Helper fuer Werkstatt-Portal. Jede Funktion
// nutzt den auth-aware SSR-Client, sodass die RLS-Policies aus
// partner_provisionen (pp_partner_read: partner_typ='werkstatt' + werkstaetten.user_id=auth.uid())
// greifen und Werkstaetten nur ihre eigenen Rows sehen.
//
// Leak-safe (Provisionen): Die Provisions-Queries selektieren NUR nicht-PII-
// Felder (betrag, status, dates, claim_nummer). Keine Kundennamen/Kontaktdaten.
//
// Ausnahme Auftrags-View: getWerkstattAuftraege/getWerkstattAuftrag lesen
// zusaetzlich kunde_name aus v_werkstatt_auftrag. Das ist legitim — die View ist
// RLS-gegatet (is_werkstatt_for_claim), eine Werkstatt sieht also ausschliesslich
// die Kunden IHRER EIGENEN Claims (Parity mit der makler/akten-Sicht). Der
// Kundenname wird NICHT auf die werkstatt_provisionen-Queries ausgeweitet.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStorageUrlBulk } from '@/lib/storage/url'
// FG4-A: Provisions-Freigabe = Fall-Completion + 7 Tage. Die pending-Frist wird daraus abgeleitet
// (nicht mehr aus hold_until = Erstellung+7d, seit FG4-A falsch).
import { releaseDeadlineTs } from '@/lib/provisionen/completion-release-gate'
import { loadCompletionMap } from '@/lib/provisionen/completion-fetch'

export type WerkstattRow = {
  id: string
  name: string
  status: string
  provision_betrag_netto: number
  adresse_strasse: string | null
  adresse_plz: string | null
  adresse_ort: string | null
}

/** Holt die Werkstatt-Row fuer den eingeloggten User (oder null). */
export async function getWerkstattByUserId(): Promise<WerkstattRow | null> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return null
  const { data } = await supabase
    .from('werkstaetten')
    .select('id, name, status, provision_betrag_netto, adresse_strasse, adresse_plz, adresse_ort')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id as string,
    name: data.name as string,
    status: (data as unknown as { status: string }).status ?? 'aktiv',
    provision_betrag_netto: Number((data as unknown as { provision_betrag_netto: number | null }).provision_betrag_netto ?? 150),
    adresse_strasse: (data.adresse_strasse as string | null) ?? null,
    adresse_plz: (data.adresse_plz as string | null) ?? null,
    adresse_ort: (data.adresse_ort as string | null) ?? null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Uebersicht-Kennzahlen
// ─────────────────────────────────────────────────────────────────────────────

export type WerkstattOverview = {
  vermittelteClaimsTotal: number
  provisionen: {
    offeneSumme: number
    freigegebeneSumme: number
    ausgezahlteSumme: number
  }
}

/**
 * Parallel-Fetch aller Uebersicht-Kennzahlen fuer eine Werkstatt.
 * Leak-safe: keine PII — nur Counts + Summen.
 */
export async function getWerkstattOverview(werkstattId: string): Promise<WerkstattOverview> {
  const supabase = await createClient()

  const [claimsRes, offenRes, freigRes, ausgRes] = await Promise.all([
    // Fix: claims hat keine werkstatt-RLS-Policy → count via partner_provisionen
    // (UNIQUE auf (partner_typ, claim_id), eine Provision-Row pro Claim → count == vermittelte Claims).
    supabase
      .from('partner_provisionen')
      .select('id', { count: 'exact', head: true })
      .eq('partner_typ', 'werkstatt')
      .eq('partner_id', werkstattId),
    supabase
      .from('partner_provisionen')
      .select('betrag_netto_eur')
      .eq('partner_typ', 'werkstatt')
      .eq('partner_id', werkstattId)
      .eq('status', 'pending'),
    supabase
      .from('partner_provisionen')
      .select('betrag_netto_eur')
      .eq('partner_typ', 'werkstatt')
      .eq('partner_id', werkstattId)
      .eq('status', 'freigegeben'),
    supabase
      .from('partner_provisionen')
      .select('betrag_netto_eur')
      .eq('partner_typ', 'werkstatt')
      .eq('partner_id', werkstattId)
      .eq('status', 'ausgezahlt'),
  ])

  const sum = (rows: Array<{ betrag_netto_eur: unknown }> | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.betrag_netto_eur ?? 0), 0)

  return {
    vermittelteClaimsTotal: claimsRes.count ?? 0,
    provisionen: {
      offeneSumme: sum(offenRes.data),
      freigegebeneSumme: sum(freigRes.data),
      ausgezahlteSumme: sum(ausgRes.data),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Provisionen-Liste
// ─────────────────────────────────────────────────────────────────────────────

// 'unterdrueckt' (P3 Netzwerk): intra-Freundesnetzwerk -> keine Einzelprovision (Abo deckt).
export type WerkstattProvisionStatus = 'pending' | 'freigegeben' | 'storniert' | 'ausgezahlt' | 'unterdrueckt'

export type WerkstattProvisionRow = {
  id: string
  betrag_netto_eur: number
  status: WerkstattProvisionStatus
  trigger_event: string | null
  trigger_at: string | null
  /** Freigabe-/Clawback-Frist = Fall-Completion + 7 Tage (FG4-A). null = Fall noch nicht abgeschlossen. */
  release_deadline: string | null
  storniert_am: string | null
  storno_grund: string | null
  erstellt_am: string
  // Claim-Nummer zum Zuordnen (kein PII)
  claim_nummer: string | null
  // W1.7: claim_id fuer Deep-Link auf /werkstatt/auftraege/[claimId] — liegt direkt
  // auf partner_provisionen (UNIQUE partner_typ,claim_id), RLS-sicher, kein claims-Join.
  claim_id: string | null
}

/**
 * Provisions-Liste fuer eine Werkstatt — leak-safe: nur betrag, status,
 * dates, claim_nummer. Keine Kundennamen.
 */
export async function getWerkstattProvisionen(werkstattId: string): Promise<WerkstattProvisionRow[]> {
  const supabase = await createClient()

  // claim_nummer liegt denormalisiert auf partner_provisionen (werkstatt-Herkunft) — RLS-sicher
  // direkt lesbar; KEIN claims-Join (claims hat keine werkstatt-RLS-Policy -> lieferte sonst null).
  const { data } = await supabase
    .from('partner_provisionen')
    .select(`
      id, betrag_netto_eur, status, trigger_event,
      trigger_at, claim_id, storniert_am, storno_grund, erstellt_am,
      claim_nummer
    `)
    .eq('partner_typ', 'werkstatt')
    .eq('partner_id', werkstattId)
    .order('erstellt_am', { ascending: false, nullsFirst: false })
    .limit(200)

  // Freigabe-/Clawback-Frist der pending Provisionen = Fall-Completion + 7 Tage (FG4-A-Gate), NICHT
  // mehr hold_until (Erstellung+7d, seit FG4-A falsch). Service-role, weil das Werkstatt-Portal
  // KEINE claims-RLS hat (der User-Client liest claims sonst 0); nur EIGENE pending-claim_ids.
  const rows = data ?? []
  const completionMap = await loadCompletionMap(
    createAdminClient(),
    rows
      .filter((r) => (r as unknown as { status?: string }).status === 'pending')
      .map((r) => (r as unknown as { claim_id?: string | null }).claim_id ?? null),
  )

  return rows.map((row) => {
    const claimId = (row as unknown as { claim_id?: string | null }).claim_id ?? null
    const completion =
      (row as unknown as { status?: string }).status === 'pending' && claimId ? completionMap.get(claimId) : undefined
    return {
      id: row.id as string,
      betrag_netto_eur: Number((row as unknown as { betrag_netto_eur: number | null }).betrag_netto_eur ?? 0),
      status: ((row as unknown as { status: string }).status ?? 'pending') as WerkstattProvisionStatus,
      trigger_event: ((row as unknown as { trigger_event: string | null }).trigger_event) ?? null,
      trigger_at: ((row as unknown as { trigger_at: string | null }).trigger_at) ?? null,
      release_deadline: completion ? releaseDeadlineTs(completion) : null,
      storniert_am: ((row as unknown as { storniert_am: string | null }).storniert_am) ?? null,
      storno_grund: ((row as unknown as { storno_grund: string | null }).storno_grund) ?? null,
      erstellt_am: (row as unknown as { erstellt_am: string }).erstellt_am,
      claim_nummer: ((row as unknown as { claim_nummer: string | null }).claim_nummer) ?? null,
      claim_id: claimId,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Staffelung (Meilenstein-Boni)
// ─────────────────────────────────────────────────────────────────────────────

/** settled = freigegeben+ausgezahlt (zaehlt fuer Meilensteine), pending = Hinweis. */
export async function getWerkstattVermittlungsCount(
  werkstattId: string,
): Promise<{ settled: number; pending: number }> {
  const supabase = await createClient()
  const [settledRes, pendingRes] = await Promise.all([
    supabase.from('partner_provisionen').select('id', { count: 'exact', head: true })
      .eq('partner_typ', 'werkstatt').eq('partner_id', werkstattId).in('status', ['freigegeben', 'ausgezahlt']),
    supabase.from('partner_provisionen').select('id', { count: 'exact', head: true })
      .eq('partner_typ', 'werkstatt').eq('partner_id', werkstattId).eq('status', 'pending'),
  ])
  return { settled: settledRes.count ?? 0, pending: pendingRes.count ?? 0 }
}

export async function getWerkstattStaffelStufen(
  werkstattId: string,
): Promise<{ schwelle: number; bonus_betrag_netto: number }[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('werkstatt_staffel_stufen')
    .select('schwelle, bonus_betrag_netto').eq('werkstatt_id', werkstattId)
    .order('schwelle', { ascending: true })
  return (data ?? []).map((r) => ({
    schwelle: Number((r as unknown as { schwelle: number }).schwelle),
    bonus_betrag_netto: Number((r as unknown as { bonus_betrag_netto: number }).bonus_betrag_netto),
  }))
}

export async function getWerkstattStaffelBoni(
  werkstattId: string,
): Promise<{ schwelle: number; bonus_betrag_netto: number; status: string; erstellt_am: string }[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('partner_staffel_bonus')
    .select('schwelle, bonus_betrag_netto, status, erstellt_am')
    .eq('partner_typ', 'werkstatt').eq('partner_id', werkstattId)
    .order('schwelle', { ascending: true })
  return (data ?? []).map((r) => ({
    schwelle: Number((r as unknown as { schwelle: number }).schwelle),
    bonus_betrag_netto: Number((r as unknown as { bonus_betrag_netto: number }).bonus_betrag_netto),
    status: (r as unknown as { status: string }).status,
    erstellt_am: (r as unknown as { erstellt_am: string }).erstellt_am,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Auftraege — self-scoped via v_werkstatt_auftrag (SECURITY-DEFINER-View mit Gate
// is_werkstatt_for_claim). Zeigt Gutachter + Besichtigungstermin + Fahrzeug (das,
// was die Werkstatt zum Koordinieren braucht) — anders als die KVA-Funnel-Liste
// "Meine Vermittlungen". KEIN neuer RPC: die View IST der SSoT + RLS-gegatet.
// ─────────────────────────────────────────────────────────────────────────────

export type WerkstattAuftrag = {
  claim_id: string
  claim_nummer: string | null
  richtung: string | null
  // Kunde + Vermittlungs-Kontext (v_werkstatt_auftrag ist RLS-gegatet -> eigene Claims)
  kunde_name: string | null
  quelle: string | null
  zugewiesen_am: string | null
  // D — rollen-korrekte Zusatzspalten (v_werkstatt_auftrag)
  abrechnungsweg: string | null
  vermittler_werkstatt_id: string | null
  reparatur_werkstatt_id: string | null
  meine_rolle: string | null
  vermittlung_status: string | null
  operative_status: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  kennzeichen: string | null
  schadenart: string | null
  reparaturwunsch: string | null
  gutachter_firmenname: string | null
  besichtigung_start: string | null
  besichtigung_ort: string | null
  besichtigung_status: string | null
  provision_betrag_netto: number | null
  provision_status: string | null
  // SP2 Task 5 — Reparaturtermin-Spalten (additiv, aus v_werkstatt_auftrag)
  reparatur_termin_id: string | null
  reparatur_termin_status: string | null
  reparatur_wunschtermin: string | null
  reparatur_bestaetigter_termin: string | null
  reparatur_absage_grund: string | null
  // SP3 Task 2 — Gutachten-Kennzahlen (additiv, aus v_werkstatt_auftrag).
  // HINWEIS: gutachten_bericht_pdf_url wird NICHT an den Client gereicht —
  // bleibt server-only; die oeffneGutachtenPdf-Action liest ihn frisch.
  gutachten_fertiggestellt_am: string | null
  gutachten_reparaturkosten_netto: number | null
  gutachten_reparaturkosten_brutto: number | null
  gutachten_minderwert: number | null
  gutachten_restwert: number | null
  gutachten_wiederbeschaffungswert: number | null
  gutachten_totalschaden: boolean | null
  // KVA — Werkstatt-Kostenvoranschlag-Snapshot (claims.*), NICHT der SV-Gutachten-Wert.
  kostenvoranschlag_netto: number | null
  kostenvoranschlag_brutto: number | null
  reparatur_freigegeben_am: string | null
  // R1: Kunde-KVA-Ablehnung -> Werkstatt muss ueberarbeiten (kvaStatus='abgelehnt' + Re-Upload).
  kva_abgelehnt_am: string | null
  kva_abgelehnt_grund: string | null
  // AV3/AV4/AV5: Auffahrunfall-Hinweis (bkat_unfallart) + Reparaturdauer (Gutachten bzw. Werkstatt-KVA).
  unfallart: string | null
  reparaturdauer_tage: number | null
  reparaturdauer_tage_kva: number | null
  // SP Task 10 — Rückruf-Wunschzeit (additiv, aus v_werkstatt_auftrag via reparatur_termine).
  reparatur_rueckruf_wunschzeit: string | null
}

// Gemeinsame Spalten-Auswahl + Row-Mapping (DRY: Liste + Einzel-Loader).
const AUFTRAG_SELECT = `
  claim_id, claim_nummer, richtung, kunde_name, quelle, zugewiesen_am,
  vermittlung_status, operative_status,
  abrechnungsweg, vermittler_werkstatt_id, reparatur_werkstatt_id, meine_rolle,
  fahrzeug_hersteller, fahrzeug_modell, kennzeichen, schadenart, reparaturwunsch,
  gutachter_firmenname,
  besichtigung_start, besichtigung_ort, besichtigung_status,
  provision_betrag_netto, provision_status,
  reparatur_termin_id, reparatur_termin_status, reparatur_wunschtermin,
  reparatur_bestaetigter_termin, reparatur_absage_grund,
  gutachten_fertiggestellt_am, gutachten_reparaturkosten_netto, gutachten_reparaturkosten_brutto,
  gutachten_minderwert, gutachten_restwert, gutachten_wiederbeschaffungswert, gutachten_totalschaden,
  kostenvoranschlag_netto, kostenvoranschlag_brutto, reparatur_freigegeben_am,
  kva_abgelehnt_am, kva_abgelehnt_grund,
  unfallart, reparaturdauer_tage, reparaturdauer_tage_kva,
  reparatur_rueckruf_wunschzeit
`

function mapWerkstattAuftragRow(r: Record<string, unknown>): WerkstattAuftrag {
  return {
    claim_id: r.claim_id as string,
    claim_nummer: (r.claim_nummer as string | null) ?? null,
    richtung: (r.richtung as string | null) ?? null,
    kunde_name: (r.kunde_name as string | null) ?? null,
    quelle: (r.quelle as string | null) ?? null,
    zugewiesen_am: (r.zugewiesen_am as string | null) ?? null,
    abrechnungsweg: (r.abrechnungsweg as string | null) ?? null,
    vermittler_werkstatt_id: (r.vermittler_werkstatt_id as string | null) ?? null,
    reparatur_werkstatt_id: (r.reparatur_werkstatt_id as string | null) ?? null,
    meine_rolle: (r.meine_rolle as string | null) ?? null,
    vermittlung_status: (r.vermittlung_status as string | null) ?? null,
    operative_status: (r.operative_status as string | null) ?? null,
    fahrzeug_hersteller: (r.fahrzeug_hersteller as string | null) ?? null,
    fahrzeug_modell: (r.fahrzeug_modell as string | null) ?? null,
    kennzeichen: (r.kennzeichen as string | null) ?? null,
    schadenart: (r.schadenart as string | null) ?? null,
    reparaturwunsch: (r.reparaturwunsch as string | null) ?? null,
    gutachter_firmenname: (r.gutachter_firmenname as string | null) ?? null,
    besichtigung_start: (r.besichtigung_start as string | null) ?? null,
    besichtigung_ort: (r.besichtigung_ort as string | null) ?? null,
    besichtigung_status: (r.besichtigung_status as string | null) ?? null,
    provision_betrag_netto: r.provision_betrag_netto != null ? Number(r.provision_betrag_netto) : null,
    provision_status: (r.provision_status as string | null) ?? null,
    // SP2 Task 5 — Reparaturtermin-Spalten
    reparatur_termin_id: (r.reparatur_termin_id as string | null) ?? null,
    reparatur_termin_status: (r.reparatur_termin_status as string | null) ?? null,
    reparatur_wunschtermin: (r.reparatur_wunschtermin as string | null) ?? null,
    reparatur_bestaetigter_termin: (r.reparatur_bestaetigter_termin as string | null) ?? null,
    reparatur_absage_grund: (r.reparatur_absage_grund as string | null) ?? null,
    // SP3 Task 2 — Gutachten-Kennzahlen (PDF-Pfad bleibt server-only)
    gutachten_fertiggestellt_am: (r.gutachten_fertiggestellt_am as string | null) ?? null,
    gutachten_reparaturkosten_netto: r.gutachten_reparaturkosten_netto != null ? Number(r.gutachten_reparaturkosten_netto) : null,
    gutachten_reparaturkosten_brutto: r.gutachten_reparaturkosten_brutto != null ? Number(r.gutachten_reparaturkosten_brutto) : null,
    gutachten_minderwert: r.gutachten_minderwert != null ? Number(r.gutachten_minderwert) : null,
    gutachten_restwert: r.gutachten_restwert != null ? Number(r.gutachten_restwert) : null,
    gutachten_wiederbeschaffungswert: r.gutachten_wiederbeschaffungswert != null ? Number(r.gutachten_wiederbeschaffungswert) : null,
    gutachten_totalschaden: r.gutachten_totalschaden != null ? Boolean(r.gutachten_totalschaden) : null,
    // KVA — Werkstatt-Kostenvoranschlag (claims.*)
    kostenvoranschlag_netto: r.kostenvoranschlag_netto != null ? Number(r.kostenvoranschlag_netto) : null,
    kostenvoranschlag_brutto: r.kostenvoranschlag_brutto != null ? Number(r.kostenvoranschlag_brutto) : null,
    reparatur_freigegeben_am: (r.reparatur_freigegeben_am as string | null) ?? null,
    kva_abgelehnt_am: (r.kva_abgelehnt_am as string | null) ?? null,
    kva_abgelehnt_grund: (r.kva_abgelehnt_grund as string | null) ?? null,
    // AV3/AV4/AV5
    unfallart: (r.unfallart as string | null) ?? null,
    reparaturdauer_tage: r.reparaturdauer_tage != null ? Number(r.reparaturdauer_tage) : null,
    reparaturdauer_tage_kva: r.reparaturdauer_tage_kva != null ? Number(r.reparaturdauer_tage_kva) : null,
    // SP Task 10
    reparatur_rueckruf_wunschzeit: (r.reparatur_rueckruf_wunschzeit as string | null) ?? null,
  }
}

/** Self-scoped Auftrags-Liste via v_werkstatt_auftrag (RLS-Gate in der View). */
export async function getWerkstattAuftraege(): Promise<WerkstattAuftrag[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_werkstatt_auftrag')
    .select(AUFTRAG_SELECT)
    .order('besichtigung_start', { ascending: false, nullsFirst: false })
  if (error) {
    console.error('[werkstatt] getWerkstattAuftraege:', error.message)
    return []
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapWerkstattAuftragRow)
}

/** Ein einzelner Auftrag via v_werkstatt_auftrag (RLS-Gate). null = kein Zugriff/nicht da. */
export async function getWerkstattAuftrag(claimId: string): Promise<WerkstattAuftrag | null> {
  if (!claimId) return null
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_werkstatt_auftrag')
    .select(AUFTRAG_SELECT)
    .eq('claim_id', claimId)
    .maybeSingle()
  if (error) {
    console.error('[werkstatt] getWerkstattAuftrag:', error.message)
    return null
  }
  return data ? mapWerkstattAuftragRow(data as unknown as Record<string, unknown>) : null
}

/**
 * Zusatz-Kontext fuer die Werkstatt-Detailseite (Fahrzeug-Detail, Vorschaeden,
 * Ansprechpartner), der NICHT in v_werkstatt_auftrag steckt. Liest v_claim_full
 * + das Kundenbetreuer-Profil via ADMIN-Client — der Caller MUSS vorher via
 * getWerkstattAuftrag (RLS-Gate) die Fall-Zugehoerigkeit bewiesen haben
 * (Defense-in-Depth, analog zur SV-Fallakte-Page). null = nichts gefunden.
 * v_claim_full-Spalten prod-verifiziert (ungetypter Admin-Client -> kein silent-400).
 */
export type WerkstattAuftragExtra = {
  fahrzeug_baujahr: string | number | null
  fahrzeug_farbe: string | null
  erstzulassung: string | null
  kilometerstand: string | number | null
  hergang: string | null
  hat_vorschaeden: boolean | null
  vorschaden_anzahl: number | null
  vorschaden_erkannt: string | null
  vorschaden_letzter_datum: string | null
  kunde_vorname: string | null
  kunde_nachname: string | null
  kunde_telefon: string | null
  kunde_email: string | null
  betreuer: { vorname: string | null; nachname: string | null; telefon: string | null; email: string | null } | null
  // W1: aufgeloeste Kunden-Schadensfoto-URLs (fuer den Werkstatt-KVA).
  schadensfotos: string[]
}

export async function getWerkstattAuftragExtra(claimId: string): Promise<WerkstattAuftragExtra | null> {
  if (!claimId) return null
  const admin = createAdminClient()
  const { data: vcf } = await admin
    .from('v_claim_full')
    .select(
      'fahrzeug_baujahr, fahrzeug_farbe, erstzulassung, kilometerstand, hergang_kunde_text, hat_vorschaeden, vorschaden_anzahl, vorschaden_erkannt, vorschaden_letzter_datum, kunde_vorname, kunde_nachname, kunde_telefon, kunde_email, kundenbetreuer_id',
    )
    .eq('id', claimId)
    .maybeSingle()
  if (!vcf) return null
  const row = vcf as Record<string, unknown>

  let betreuer: WerkstattAuftragExtra['betreuer'] = null
  const kbId = (row.kundenbetreuer_id as string | null) ?? null
  if (kbId) {
    const { data: kb } = await admin
      .from('profiles')
      .select('vorname, nachname, telefon, email')
      .eq('id', kbId)
      .maybeSingle()
    if (kb) {
      const k = kb as Record<string, unknown>
      betreuer = {
        vorname: (k.vorname as string | null) ?? null,
        nachname: (k.nachname as string | null) ?? null,
        telefon: (k.telefon as string | null) ?? null,
        email: (k.email as string | null) ?? null,
      }
    }
  }

  // W1: Kunden-Schadensfotos fuer den KVA (fall_dokumente typ='schadensfoto', claim-gekeyt).
  // Die zugewiesene Werkstatt (ownership via getWerkstattAuftrag) braucht die Schadensbilder,
  // um zu kalkulieren — bei Selbstzahler gibt es kein Gutachten. URLs zur Laufzeit aufloesen
  // (getStorageUrlBulk) statt gespeicherte, evtl. abgelaufene URLs zu nutzen.
  const { data: fotoRows } = await admin
    .from('fall_dokumente')
    .select('storage_path')
    .eq('claim_id', claimId)
    .eq('dokument_typ', 'schadensfoto')
    .is('geloescht_am', null)
  const fotoPaths = ((fotoRows ?? []) as Array<{ storage_path: string | null }>)
    .map((r) => r.storage_path)
    .filter((p): p is string => !!p)
  const schadensfotos = fotoPaths.length
    ? (await getStorageUrlBulk(admin, fotoPaths.map((path) => ({ bucket: 'fall-dokumente', path })))).filter(
        (u): u is string => !!u,
      )
    : []

  return {
    fahrzeug_baujahr: (row.fahrzeug_baujahr as string | number | null) ?? null,
    fahrzeug_farbe: (row.fahrzeug_farbe as string | null) ?? null,
    erstzulassung: (row.erstzulassung as string | null) ?? null,
    kilometerstand: (row.kilometerstand as string | number | null) ?? null,
    hergang: (row.hergang_kunde_text as string | null) ?? null,
    hat_vorschaeden: (row.hat_vorschaeden as boolean | null) ?? null,
    vorschaden_anzahl: (row.vorschaden_anzahl as number | null) ?? null,
    vorschaden_erkannt: (row.vorschaden_erkannt as string | null) ?? null,
    vorschaden_letzter_datum: (row.vorschaden_letzter_datum as string | null) ?? null,
    kunde_vorname: (row.kunde_vorname as string | null) ?? null,
    kunde_nachname: (row.kunde_nachname as string | null) ?? null,
    kunde_telefon: (row.kunde_telefon as string | null) ?? null,
    kunde_email: (row.kunde_email as string | null) ?? null,
    betreuer,
    schadensfotos,
  }
}

export type WerkstattChatMessage = {
  id: string
  nachricht: string
  created_at: string
  sender_id: string | null
  sender_rolle: string | null
  is_system: boolean
  sender_vorname: string | null
  sender_nachname: string | null
}

/**
 * Fall-Gruppenchat fuer die Werkstatt-Sicht. Liest den geteilten `gruppenchat`-Kanal
 * (wie der Makler-Chat, kanal-basiert) via ADMIN-Client — der Caller MUSS vorher via
 * getWerkstattAuftrag (RLS-Gate) die Fall-Zugehoerigkeit bewiesen haben (Defense-in-Depth).
 * v2-Cutover (analog getFallChat/#4349): Union aus dem v1-Kanal `gruppenchat` (fall_id) UND
 * dem v2-`kunde_gruppe`-THREAD (thread_id) des Falls — sonst saehe die Werkstatt die Nachrichten
 * von Kunde/KB/SV NICHT (die sind thread-nativ mit kanal=null). Thread per claim_id resolved.
 * Sender-Namen 2-Step statt Embed (ungetypter Admin-Client -> kein silent-400).
 * Gibt zusaetzlich `fallId` + `gruppeThreadId` zurueck (die Realtime-Sub-Ids der WerkstattChatTab),
 * damit die Route sie nicht separat aufloesen muss (frueher getWerkstattChatRealtimeIds, konsolidiert).
 */
export async function getWerkstattFallChat(
  claimId: string,
): Promise<{ messages: WerkstattChatMessage[]; fallId: string; gruppeThreadId: string | null }> {
  if (!claimId) return { messages: [], fallId: claimId, gruppeThreadId: null }
  const admin = createAdminClient()
  const { data: bridge } = await admin
    .from('faelle_claim_bridge')
    .select('fall_id')
    .eq('claim_id', claimId)
    .maybeSingle()
  const fallId = ((bridge as { fall_id?: string } | null)?.fall_id) ?? claimId

  const { data: thr } = await admin
    .from('chat_threads')
    .select('id')
    .eq('claim_id', claimId)
    .eq('art', 'kunde_gruppe')
    .maybeSingle()
  const gruppeThreadId = (thr as { id: string } | null)?.id ?? null

  let query = admin
    .from('nachrichten')
    .select('id, nachricht, created_at, sender_id, sender_rolle, is_system')
    .order('created_at', { ascending: true })
  query = gruppeThreadId
    ? query.or(`and(fall_id.eq.${fallId},kanal.eq.gruppenchat),thread_id.eq.${gruppeThreadId}`)
    : query.eq('fall_id', fallId).eq('kanal', 'gruppenchat')
  const { data, error } = await query
  if (error || !data) return { messages: [], fallId, gruppeThreadId }

  const rows = data as Array<Record<string, unknown>>
  const senderIds = [
    ...new Set(rows.map((r) => r.sender_id as string | null).filter(Boolean) as string[]),
  ]
  const namen = new Map<string, { vorname: string | null; nachname: string | null }>()
  if (senderIds.length) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, vorname, nachname')
      .in('id', senderIds)
    for (const p of (profile ?? []) as Array<Record<string, unknown>>) {
      namen.set(p.id as string, {
        vorname: (p.vorname as string | null) ?? null,
        nachname: (p.nachname as string | null) ?? null,
      })
    }
  }

  const messages = rows.map((r) => {
    const sid = (r.sender_id as string | null) ?? null
    const n = sid ? namen.get(sid) : null
    return {
      id: r.id as string,
      nachricht: (r.nachricht as string) ?? '',
      created_at: (r.created_at as string) ?? '',
      sender_id: sid,
      sender_rolle: (r.sender_rolle as string | null) ?? null,
      is_system: (r.is_system as boolean) ?? false,
      sender_vorname: n?.vorname ?? null,
      sender_nachname: n?.nachname ?? null,
    }
  })
  return { messages, fallId, gruppeThreadId }
}
