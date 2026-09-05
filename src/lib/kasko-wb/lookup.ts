// Wissensbasis nach NAMEN abfragen (Berater-API + Endpunkt /api/v1/kasko-werkstattbindung). Die Phase-1-Actions
// arbeiten mit UUIDs; ein LLM kennt nur „HUK-COBURG" und „Classic SELECT". Admin-Client wie kasko-wb/actions.ts
// (oeffentliche Referenzdaten, keine Kundendaten). Kein 'use server' — normaler Server-Import fuer Route Handler.

import type { SupabaseClient } from '@supabase/supabase-js'
import { waehleTreffer } from './namen'

export type MarkeKurz = {
  id: string
  slug: string
  marke: string
  wbStatus: 'optional' | 'standard' | 'keine'
  wbMarker: string[]
  stand: string
}
export type TarifKurz = {
  id: string
  anzeigename: string
  hatWerkstattbindung: boolean
  bindungsumfang: 'keine' | 'voll' | 'nur_glas' | 'unklar'
  verlaesslichkeit: 'belegt' | 'abgeleitet' | 'nicht_belegt'
}
export type LookupErgebnis =
  | {
      status: 'gefunden'
      marke: MarkeKurz
      tarif: TarifKurz | null
      tarifStatus: 'gefunden' | 'nicht_angegeben' | 'nicht_gefunden' | 'mehrdeutig'
      /** bei nicht_angegeben/nicht_gefunden: alle Tarife der Marke; bei mehrdeutig: die passenden */
      tarifKandidaten: TarifKurz[]
    }
  | { status: 'mehrdeutig'; kandidaten: MarkeKurz[] }
  | { status: 'nicht_gefunden' }

type MarkeRow = { id: string; slug: string; marke: string; wb_status: MarkeKurz['wbStatus']; wb_marker: string[] | null; stand: string }
type TarifRow = {
  id: string
  anzeigename: string
  hat_werkstattbindung: boolean
  bindungsumfang: TarifKurz['bindungsumfang']
  verlaesslichkeit: TarifKurz['verlaesslichkeit']
}

// Pure Kern (ohne DB) — separat exportiert, damit die Trefferlogik ohne Supabase-Mock testbar ist.
export function waehleMarke(marken: MarkeKurz[], versicherer: string): Treffer<MarkeKurz> {
  const nachName = waehleTreffer(marken.map((m) => ({ name: m.marke, wert: m })), versicherer)
  if (nachName.status === 'eindeutig') return { status: 'eindeutig', treffer: nachName.treffer.wert }
  // Slug-Schreibweise („huk-coburg") ist die haeufigste LLM-Eingabe — zweite Chance ueber den Slug.
  const nachSlug = waehleTreffer(marken.map((m) => ({ name: m.slug, wert: m })), versicherer)
  if (nachSlug.status === 'eindeutig') return { status: 'eindeutig', treffer: nachSlug.treffer.wert }
  if (nachName.status === 'mehrdeutig') return { status: 'mehrdeutig', kandidaten: nachName.kandidaten.map((k) => k.wert) }
  if (nachSlug.status === 'mehrdeutig') return { status: 'mehrdeutig', kandidaten: nachSlug.kandidaten.map((k) => k.wert) }
  return { status: 'kein_treffer' }
}

export function waehleTarif(tarife: TarifKurz[], tarif: string | null | undefined): Pick<Extract<LookupErgebnis, { status: 'gefunden' }>, 'tarif' | 'tarifStatus' | 'tarifKandidaten'> {
  if (!tarif?.trim()) return { tarif: null, tarifStatus: 'nicht_angegeben', tarifKandidaten: tarife }
  const t = waehleTreffer(tarife.map((x) => ({ name: x.anzeigename, wert: x })), tarif)
  if (t.status === 'eindeutig') return { tarif: t.treffer.wert, tarifStatus: 'gefunden', tarifKandidaten: [] }
  if (t.status === 'mehrdeutig') return { tarif: null, tarifStatus: 'mehrdeutig', tarifKandidaten: t.kandidaten.map((k) => k.wert) }
  return { tarif: null, tarifStatus: 'nicht_gefunden', tarifKandidaten: tarife }
}

type Treffer<T> = { status: 'eindeutig'; treffer: T } | { status: 'mehrdeutig'; kandidaten: T[] } | { status: 'kein_treffer' }

export async function findeKaskoTarifNachName(
  admin: SupabaseClient,
  eingabe: { versicherer: string; tarif?: string | null },
): Promise<{ ok: true; ergebnis: LookupErgebnis } | { ok: false; error: string }> {
  const { data: marken, error } = await admin
    .from('kasko_versicherer_marken')
    .select('id, slug, marke, wb_status, wb_marker, stand')
    .eq('aktiv', true)
  if (error) return { ok: false, error: error.message }
  const markenKurz: MarkeKurz[] = ((marken ?? []) as unknown as MarkeRow[]).map((m) => ({
    id: m.id,
    slug: m.slug,
    marke: m.marke,
    wbStatus: m.wb_status,
    wbMarker: m.wb_marker ?? [],
    stand: m.stand,
  }))
  const treffer = waehleMarke(markenKurz, eingabe.versicherer)
  if (treffer.status === 'kein_treffer') return { ok: true, ergebnis: { status: 'nicht_gefunden' } }
  if (treffer.status === 'mehrdeutig') return { ok: true, ergebnis: { status: 'mehrdeutig', kandidaten: treffer.kandidaten } }
  const marke = treffer.treffer

  const { data: tarife, error: tErr } = await admin
    .from('kasko_tarife')
    .select('id, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit')
    .eq('marke_id', marke.id)
    .eq('aktiv', true)
    .order('reihenfolge', { ascending: true })
  if (tErr) return { ok: false, error: tErr.message }
  const tarifeKurz: TarifKurz[] = ((tarife ?? []) as unknown as TarifRow[]).map((t) => ({
    id: t.id,
    anzeigename: t.anzeigename,
    hatWerkstattbindung: t.hat_werkstattbindung,
    bindungsumfang: t.bindungsumfang,
    verlaesslichkeit: t.verlaesslichkeit,
  }))
  return { ok: true, ergebnis: { status: 'gefunden', marke, ...waehleTarif(tarifeKurz, eingabe.tarif) } }
}
