// AAR-956 WP-B (Task 9): Query-Helper fuer Werkstatt-Portal. Jede Funktion
// nutzt den auth-aware SSR-Client, sodass die RLS-Policies aus
// werkstatt_provisionen (wp_werkstatt_read: werkstatt_id=auth.uid()-werkstatt)
// greifen und Werkstaetten nur ihre eigenen Rows sehen.
//
// Leak-safe: Alle Queries selektieren NUR nicht-PII-Felder (betrag, status,
// dates, claim_nummer). Keine Kundennamen/Kontaktdaten.

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
