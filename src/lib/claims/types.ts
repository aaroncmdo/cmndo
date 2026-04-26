// CMM-2 (Phase 0 Foundation): Type-System für claim-as-SSoT.
//
// `Claim` ist der Basis-Type aus den generierten Supabase-Types.
// `ClaimFull` ergänzt ihn um die Sub-Entities, wie sie aus dem View
// `v_claim_full` als jsonb-Arrays kommen.
// `ClaimListing` ist die schmale Listen-Repräsentation aus `v_claim_listing`.
// `Rolle` ist die zentrale Enum für Permission-Gating an Components.
//
// Diese Types sind die einzige Vertragsgrundlage zwischen Loader,
// Server-Actions und UI-Components. Drift hier → Drift überall.

import type { Database } from '@/lib/supabase/database.types'

// ─── Basistabellen ──────────────────────────────────────────────────────────
export type Claim = Database['public']['Tables']['claims']['Row']
export type ClaimInsert = Database['public']['Tables']['claims']['Insert']
export type ClaimUpdate = Database['public']['Tables']['claims']['Update']

export type ClaimParty = Database['public']['Tables']['claim_parties']['Row']
export type ClaimVehicleInvolvement =
  Database['public']['Tables']['claim_vehicle_involvements']['Row']
export type ClaimPayment = Database['public']['Tables']['claim_payments']['Row']
export type ClaimMietwagen = Database['public']['Tables']['claim_mietwagen']['Row']
export type VsKorrespondenz = Database['public']['Tables']['vs_korrespondenz']['Row']
export type Repair = Database['public']['Tables']['repairs']['Row']

// ─── ClaimFull — Detail-View aus v_claim_full ───────────────────────────────
// Spiegelt die Struktur der View: claims.* + Assignment aus faelle +
// Sub-Entities als Arrays (jsonb_agg).
export type ClaimFull = Claim & {
  // Assignment-Felder aus faelle (parallele Row, gleiche id)
  fall_nummer: string | null
  sv_id: string | null
  service_typ: string | null
  // Sub-Entities (jsonb_agg → Arrays; nie null, ggf. leer)
  parties: ClaimParty[]
  vehicle_involvements: ClaimVehicleInvolvement[]
  payments: ClaimPayment[]
  mietwagen: ClaimMietwagen[]
  vs_korrespondenz: VsKorrespondenz[]
  repairs: Repair[]
}

// ─── ClaimListing — Listen/Kanban aus v_claim_listing ───────────────────────
export type ClaimListing = {
  claim_id: string
  claim_nummer: string | null
  phase: string
  status: string
  schadentag: string
  kunden_konstellation: string | null
  created_at: string
  updated_at: string
  fall_nummer: string | null
  sv_id: string | null
  faelle_kundenbetreuer_id: string | null
  claim_kundenbetreuer_id: string | null
  service_typ: string | null
  kunde_anzeigename: string | null
  kunde_vorname: string | null
  kunde_nachname: string | null
  kennzeichen: string | null
}

// ─── Rolle — die 5 Claim-Konsumenten ────────────────────────────────────────
// Dispatcher steht hier bewusst NICHT — der arbeitet auf `leads`,
// nicht auf claims. Siehe docs/claim-as-ssot-umbau.md §2.
export type Rolle = 'kunde' | 'sv' | 'kb' | 'admin' | 'kanzlei'

export const ROLLEN: readonly Rolle[] = ['kunde', 'sv', 'kb', 'admin', 'kanzlei'] as const

// ─── Phase + Status (Welle-7) ───────────────────────────────────────────────
// String-Konstanten für den UI-Layer. Backend nutzt direkt die ENUM-Werte
// aus claims.phase / claims.status — diese Konstanten dienen der
// Auto-Vervollständigung in TypeScript.
export const CLAIM_PHASEN = [
  '0_lead',
  '1_neu',
  '2_in_bearbeitung',
  '3_gutachter_unterwegs',
  '4_gutachten_fertig',
  '5_in_reparatur',
  '6_kommunikation_versicherung',
  '9_reguliert',
  '9_abgelehnt',
  '9_an_externe_kanzlei',
  '9_storniert',
] as const
export type ClaimPhase = (typeof CLAIM_PHASEN)[number]

export const CLAIM_STATUS = [
  'dispatch_done',
  'in_bearbeitung',
  'in_kommunikation_vs',
  'reguliert',
  'abgelehnt',
  'an_externe_kanzlei_uebergeben',
  'storniert',
] as const
export type ClaimStatus = (typeof CLAIM_STATUS)[number]
