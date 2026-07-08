// AAR-956 WP-B (Task 9): Query-Helper fuer Werkstatt-Portal. Jede Funktion
// nutzt den auth-aware SSR-Client, sodass die RLS-Policies aus
// werkstatt_provisionen (wp_werkstatt_read: werkstatt_id=auth.uid()-werkstatt)
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
    // Fix: claims hat keine werkstatt-RLS-Policy → count via werkstatt_provisionen
    // (UNIQUE auf claim_id, eine Provision-Row pro Claim → count == vermittelte Claims).
    supabase
      .from('werkstatt_provisionen')
      .select('id', { count: 'exact', head: true })
      .eq('werkstatt_id', werkstattId),
    supabase
      .from('werkstatt_provisionen')
      .select('betrag_netto_eur')
      .eq('werkstatt_id', werkstattId)
      .eq('status', 'pending'),
    supabase
      .from('werkstatt_provisionen')
      .select('betrag_netto_eur')
      .eq('werkstatt_id', werkstattId)
      .eq('status', 'freigegeben'),
    supabase
      .from('werkstatt_provisionen')
      .select('betrag_netto_eur')
      .eq('werkstatt_id', werkstattId)
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

export type WerkstattProvisionStatus = 'pending' | 'freigegeben' | 'storniert' | 'ausgezahlt'

export type WerkstattProvisionRow = {
  id: string
  betrag_netto_eur: number
  status: WerkstattProvisionStatus
  trigger_event: string | null
  trigger_at: string | null
  hold_until: string | null
  storniert_am: string | null
  storno_grund: string | null
  erstellt_am: string
  // Claim-Nummer zum Zuordnen (kein PII)
  claim_nummer: string | null
}

/**
 * Provisions-Liste fuer eine Werkstatt — leak-safe: nur betrag, status,
 * dates, claim_nummer. Keine Kundennamen.
 */
export async function getWerkstattProvisionen(werkstattId: string): Promise<WerkstattProvisionRow[]> {
  const supabase = await createClient()

  // claim_nummer liegt denormalisiert auf werkstatt_provisionen (Mig 20260623050718) — RLS-sicher
  // direkt lesbar; KEIN claims-Join (claims hat keine werkstatt-RLS-Policy -> lieferte sonst null).
  const { data } = await supabase
    .from('werkstatt_provisionen')
    .select(`
      id, betrag_netto_eur, status, trigger_event,
      trigger_at, hold_until, storniert_am, storno_grund, erstellt_am,
      claim_nummer
    `)
    .eq('werkstatt_id', werkstattId)
    .order('erstellt_am', { ascending: false, nullsFirst: false })
    .limit(200)

  return (data ?? []).map((row) => {
    return {
      id: row.id as string,
      betrag_netto_eur: Number((row as unknown as { betrag_netto_eur: number | null }).betrag_netto_eur ?? 0),
      status: ((row as unknown as { status: string }).status ?? 'pending') as WerkstattProvisionStatus,
      trigger_event: ((row as unknown as { trigger_event: string | null }).trigger_event) ?? null,
      trigger_at: ((row as unknown as { trigger_at: string | null }).trigger_at) ?? null,
      hold_until: ((row as unknown as { hold_until: string | null }).hold_until) ?? null,
      storniert_am: ((row as unknown as { storniert_am: string | null }).storniert_am) ?? null,
      storno_grund: ((row as unknown as { storno_grund: string | null }).storno_grund) ?? null,
      erstellt_am: (row as unknown as { erstellt_am: string }).erstellt_am,
      claim_nummer: ((row as unknown as { claim_nummer: string | null }).claim_nummer) ?? null,
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
    supabase.from('werkstatt_provisionen').select('id', { count: 'exact', head: true })
      .eq('werkstatt_id', werkstattId).in('status', ['freigegeben', 'ausgezahlt']),
    supabase.from('werkstatt_provisionen').select('id', { count: 'exact', head: true })
      .eq('werkstatt_id', werkstattId).eq('status', 'pending'),
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
  const { data } = await supabase.from('werkstatt_staffel_bonus')
    .select('schwelle, bonus_betrag_netto, status, erstellt_am').eq('werkstatt_id', werkstattId)
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
  gutachten_minderwert, gutachten_restwert, gutachten_wiederbeschaffungswert, gutachten_totalschaden
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
