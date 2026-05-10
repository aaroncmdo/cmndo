// CMM-2 (Phase 0 Foundation): Zentraler Loader für claim-as-SSoT.
//
// `getClaimForRole(supabase, claimId, rolle)` liefert einen `ClaimFull`
// aus der View `v_claim_full`. Die Spalten-Whitelist je Rolle implementiert
// das Need-to-know-Prinzip auf Application-Layer; die *eigentliche*
// Sicherheitsgrenze ist die RLS auf `claims` und den Sub-Entity-Tabellen
// (siehe Migrationen AAR-810 / AAR-829 / AAR-831).
//
// `getClaimListing(supabase, rolle, filter)` liefert die schmale Listen-
// Repräsentation aus `v_claim_listing` für Kanban/Dashboards.
//
// Drift-Schutz: Beide Funktionen sind die EINZIGEN Aufrufpunkte, die
// produktive UI-Code für claim-Reads benutzen darf. Siehe
// docs/claim-as-ssot-umbau.md §3.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { ClaimFull, ClaimListing, Rolle } from './types'

type DbClient = SupabaseClient<Database>

// ─── Spalten-Whitelist je Rolle ─────────────────────────────────────────────
// Wird nicht für Sicherheit verwendet (RLS macht das), sondern für:
//   • Performance (Kunde sieht zB keine SV-internen Felder → kleinere Payload)
//   • Vertraglichkeit (UI-Komponenten wissen, welche Felder garantiert da sind)
//
// Wir lassen `*` für Admin/KB; für Kunde/SV/Kanzlei wird gefiltert.
//
// Hinweis: jsonb_agg-Spalten der Sub-Entities werden über Sub-Whitelists
// nicht eingeschränkt — die Sub-Entity-RLS regelt was im Array landet.
const COLUMNS_KUNDE: string[] = [
  'id',
  'claim_nummer',
  'phase',
  'status',
  'schadentag',
  'schadenzeit',
  'schadenort_adresse',
  'schadenort_plz',
  'schadenort_ort',
  'schadenort_lat',
  'schadenort_lng',
  'schadenart',
  'fall_typ',
  'unfall_konstellation',
  'hergang_kunde_text',
  'hat_personenschaden',
  'hat_mietwagen',
  'hat_nutzungsausfall',
  'hat_sachschaden',
  'sachschaden_beschreibung',
  'kunden_konstellation',
  'kanzlei_wunsch',
  'kanzlei_wunsch_gefragt_am',
  'kanzlei_wunsch_gefragt_in_phase',
  'gegner_bekannt',
  'gegner_versicherungsnummer',
  'gegner_aktenzeichen',
  'unfallskizze_url',
  'unfallskizze_svg',
  'unfallskizze_bestaetigt',
  'created_at',
  'updated_at',
  'vehicle_id',
  'lead_id',
  // Assignment + Sub-Entities aus View
  'fall_nummer',
  'sv_id',
  'service_typ',
  'parties',
  'vehicle_involvements',
  'payments',
  'mietwagen',
  'repairs',
  // KEIN vs_korrespondenz für Kunde — interne VS-Briefe
]

const COLUMNS_SV: string[] = [
  'id',
  'claim_nummer',
  'phase',
  'status',
  'schadentag',
  'schadenzeit',
  'schadenort_adresse',
  'schadenort_plz',
  'schadenort_ort',
  'schadenort_lat',
  'schadenort_lng',
  'schadenort_kategorie',
  'schadenart',
  'fall_typ',
  'unfall_konstellation',
  'hergang_kunde_text',
  'hergang_sv_text',
  'hat_personenschaden',
  'hat_mietwagen',
  'hat_sachschaden',
  'sachschaden_beschreibung',
  'polizei_aktenzeichen',
  'polizei_bericht_vorhanden',
  'polizei_vor_ort',
  'polizeibericht_status',
  'bkat_unfallart',
  'fahrerflucht',
  'auslandskennzeichen',
  'unfallskizze_url',
  'unfallskizze_svg',
  'unfallskizze_bestaetigt',
  'unfallskizze_ablehnung_grund',
  'created_at',
  'updated_at',
  'vehicle_id',
  // Assignment + Sub-Entities aus View
  'fall_nummer',
  'sv_id',
  'service_typ',
  'parties',
  'vehicle_involvements',
  'repairs',
  // SV sieht keine payments / mietwagen / vs_korrespondenz
]

const COLUMNS_KANZLEI: string[] = [
  'id',
  'claim_nummer',
  'phase',
  'status',
  'schadentag',
  'schadenort_adresse',
  'schadenort_plz',
  'schadenort_ort',
  'schadenart',
  'fall_typ',
  'unfall_konstellation',
  'hergang_kunde_text',
  'hergang_sv_text',
  'hat_personenschaden',
  'hat_sachschaden',
  'kanzlei_wunsch',
  'gegner_versicherungsnummer',
  'gegner_aktenzeichen',
  'created_at',
  'updated_at',
  // Assignment + Sub-Entities aus View
  'fall_nummer',
  'sv_id',
  'service_typ',
  'parties',
  'vehicle_involvements',
  'payments',
  'vs_korrespondenz',
  'repairs',
]

const COLUMN_PROFILES: Record<Rolle, string> = {
  kunde: COLUMNS_KUNDE.join(','),
  sv: COLUMNS_SV.join(','),
  kb: '*',
  admin: '*',
  kanzlei: COLUMNS_KANZLEI.join(','),
}

// ─── getClaimForRole ────────────────────────────────────────────────────────
export async function getClaimForRole(
  supabase: DbClient,
  claimId: string,
  rolle: Rolle,
): Promise<ClaimFull | null> {
  const { data, error } = await supabase
    .from('v_claim_full')
    .select(COLUMN_PROFILES[rolle])
    .eq('id', claimId)
    .maybeSingle()

  if (error) {
    console.error('[getClaimForRole]', { rolle, claimId, error })
    return null
  }

  return (data as ClaimFull | null) ?? null
}

// ─── resolveClaimId ─────────────────────────────────────────────────────────
// Übergangs-Helper: nimmt entweder eine `claims.id` oder eine `faelle.id`
// und liefert die zugehörige `claims.id` zurück. Wird benötigt, solange
// alte Routen `/faelle/[id]` mit `faelle.id` operieren. Nach Phase 6 ist
// `faelle.id = claims.id` (1:1 nach Cleanup) und dieser Helper kann weg.
export async function resolveClaimId(
  supabase: DbClient,
  maybeId: string,
): Promise<string | null> {
  // 1) direkter Treffer in claims
  const { data: direct } = await supabase
    .from('claims')
    .select('id')
    .eq('id', maybeId)
    .maybeSingle()
  if (direct?.id) return direct.id

  // 2) Fallback: faelle.id → faelle.claim_id
  const { data: viaFall } = await supabase
    .from('faelle')
    .select('claim_id')
    .eq('id', maybeId)
    .maybeSingle()
  if (viaFall?.claim_id) return viaFall.claim_id as string

  return null
}

// ─── getClaimListing ────────────────────────────────────────────────────────
// Liefert die Listen-Repräsentation. RLS filtert auf Tabellen-Ebene was
// die Rolle sehen darf. Optionale Zusatz-Filter:
//   • `kundenbetreuerId` — KB-Tagesgeschäft (claims.kundenbetreuer_id)
//   • `svId` — SV-Tagesgeschäft (faelle.sv_id)
//   • `serviceTyp` — z.B. 'komplett' für Kanzlei-View
export type ClaimListingFilter = {
  kundenbetreuerId?: string
  svId?: string
  serviceTyp?: 'gutachten' | 'komplett'
  phasePrefix?: string
  limit?: number
}

export async function getClaimListing(
  supabase: DbClient,
  _rolle: Rolle,
  filter: ClaimListingFilter = {},
): Promise<ClaimListing[]> {
  let query = supabase
    .from('v_claim_listing')
    .select('*')
    .order('updated_at', { ascending: false })

  if (filter.kundenbetreuerId) {
    query = query.eq('claim_kundenbetreuer_id', filter.kundenbetreuerId)
  }
  if (filter.svId) {
    query = query.eq('sv_id', filter.svId)
  }
  if (filter.serviceTyp) {
    query = query.eq('service_typ', filter.serviceTyp)
  }
  if (filter.phasePrefix) {
    query = query.like('phase', `${filter.phasePrefix}%`)
  }
  if (filter.limit) {
    query = query.limit(filter.limit)
  }

  const { data, error } = await query

  if (error) {
    console.error('[getClaimListing]', { error, filter })
    return []
  }

  return (data ?? []) as ClaimListing[]
}
