// AAR-322 (Child 2 von AAR-320): Katalog-Loader + Rule-basierte Slot-Selektion.
// Lädt dokument_katalog aus der DB (mit In-Memory-Cache, TTL 5 Min) und
// wertet freigeschaltet_wenn / pflicht_wenn mit dem Rule-Evaluator aus.
//
// Nutzung in flow/[token]/actions.ts + admin/dispatch/actions.ts statt der
// alten hardcoded createDefaultPflichtdokumente-Logik.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildKatalogContext,
  evaluateKatalogRule,
  type Rule,
  type EvalContext,
} from './ruleEvaluator'

export type DokumentKategorie =
  | 'stammdaten'
  | 'unfall'
  | 'personenschaden'
  | 'fahrzeug'
  | 'kosten'
  | 'kanzlei'
  | 'gutachten'
  | 'sonstiges'
  | 'gutachter_verifizierung' // AAR-359: SV-seitige Verifizierungs-Slots

export type DokumentKatalogRow = {
  slot_id: string
  label: string
  beschreibung: string | null
  kategorie: DokumentKategorie
  freigeschaltet_wenn: Rule | null
  pflicht_wenn: Rule | null
  sichtbar_fuer: string[]
  anforderbar_von: string[]
  uploadbar_von: string[]
  multi_file: boolean
  akzeptierte_mime_types: string[]
  max_mb: number
  sort_order: number
  aktiv: boolean
}

// In-Memory-Cache. Module-Level → überlebt Request-Grenzen innerhalb eines
// Node-Prozesses. Bei Vercel (serverless) lebt er nur so lange wie die
// Lambda-Instanz — das ist gewollt und reicht für Traffic-Peaks.
const CACHE_TTL_MS = 5 * 60 * 1000
let cache: { rows: DokumentKatalogRow[]; expiresAt: number } | null = null

function isCacheValid(): boolean {
  return cache !== null && cache.expiresAt > Date.now()
}

/**
 * Cache-Invalidierung für Tests oder nach Katalog-Änderungen im Admin-UI.
 */
export function invalidateKatalogCache(): void {
  cache = null
}

/**
 * Lädt alle aktiven Katalog-Einträge (cached, TTL 5 Min).
 * Nutzt den übergebenen Supabase-Client — RLS filtert automatisch auf aktiv=true
 * für Nicht-Admins. Admin-Clients sehen alle Zeilen.
 */
export async function getAlleSlots(
  supabase: SupabaseClient,
): Promise<DokumentKatalogRow[]> {
  if (isCacheValid()) return cache!.rows

  const { data, error } = await supabase
    .from('dokument_katalog')
    .select(
      'slot_id, label, beschreibung, kategorie, freigeschaltet_wenn, pflicht_wenn, sichtbar_fuer, anforderbar_von, uploadbar_von, multi_file, akzeptierte_mime_types, max_mb, sort_order, aktiv',
    )
    .eq('aktiv', true)
    .order('sort_order', { ascending: true })

  if (error) {
    // Bei DB-Fehlern kein Cache-Update — nächster Aufruf lädt neu
    console.error('[katalog] getAlleSlots failed:', error)
    return []
  }

  const rows = (data ?? []) as DokumentKatalogRow[]
  cache = { rows, expiresAt: Date.now() + CACHE_TTL_MS }
  return rows
}

/**
 * Lädt einen einzelnen Slot per slot_id. Nutzt den gleichen Cache wie getAlleSlots.
 */
export async function getKatalogSlot(
  supabase: SupabaseClient,
  slotId: string,
): Promise<DokumentKatalogRow | null> {
  const alle = await getAlleSlots(supabase)
  return alle.find((s) => s.slot_id === slotId) ?? null
}

/**
 * Gibt alle Slots zurück, die für den gegebenen Lead/Fall-Kontext
 * FREIGESCHALTET sind (freigeschaltet_wenn = null oder Rule evaluates true).
 */
export async function getSlotsFuerFall(
  supabase: SupabaseClient,
  context: EvalContext,
): Promise<DokumentKatalogRow[]> {
  const alle = await getAlleSlots(supabase)
  return alle.filter((slot) => evaluateKatalogRule(slot.freigeschaltet_wenn, context))
}

/**
 * Gibt alle Slots zurück, die für den gegebenen Kontext PFLICHT sind
 * (pflicht_wenn ist nicht null und Rule evaluates true).
 * Pflicht-Slots sind eine Teilmenge der freigeschalteten Slots — wenn ein
 * Slot nicht freigeschaltet ist, kann er auch nicht Pflicht sein.
 */
export async function getPflichtSlotsFuerFall(
  supabase: SupabaseClient,
  context: EvalContext,
): Promise<DokumentKatalogRow[]> {
  const alle = await getAlleSlots(supabase)
  return alle.filter((slot) => {
    if (!evaluateKatalogRule(slot.freigeschaltet_wenn, context)) return false
    // Pflicht nur wenn pflicht_wenn explizit gesetzt ist und zu true evaluiert.
    // NULL = optional (nicht automatisch Pflicht).
    if (slot.pflicht_wenn == null) return false
    return evaluateKatalogRule(slot.pflicht_wenn, context)
  })
}

/**
 * Convenience-Wrapper: Baut Kontext aus Lead/Fall und gibt Pflicht-Slots zurück.
 */
export async function getPflichtSlotsFuerLeadFall(
  supabase: SupabaseClient,
  args: {
    lead?: Record<string, unknown> | null
    fall?: Record<string, unknown> | null
  },
): Promise<DokumentKatalogRow[]> {
  const ctx = buildKatalogContext(args)
  return getPflichtSlotsFuerFall(supabase, ctx)
}
