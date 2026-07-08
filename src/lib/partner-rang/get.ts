// src/lib/partner-rang/get.ts
import type { PartnerTyp, Tier } from './types'
import { rangFortschritt } from './compute'
import { ladeRangConfig } from './config-loader'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any

export type PartnerRangRow = { tier: Tier; sinnsatz: string; volumen: number; stand: string }

function mapRow(row: { rang: string | null; sinnsatz: string | null; volumen: number | null; stand: string } | null): PartnerRangRow | null {
  if (!row || !row.rang) return null
  return { tier: row.rang as Tier, sinnsatz: row.sinnsatz ?? '', volumen: row.volumen ?? 0, stand: row.stand }
}

export async function getPartnerRang(supabase: Sb, typ: PartnerTyp, id: string): Promise<PartnerRangRow | null> {
  const { data } = await supabase
    .from('partner_rang')
    .select('rang, sinnsatz, volumen, stand')
    .eq('partner_typ', typ)
    .eq('partner_id', id)
    .maybeSingle()
  return mapRow(data)
}

export async function getPartnerRangBatch(supabase: Sb, typ: PartnerTyp, ids: string[]): Promise<Map<string, PartnerRangRow>> {
  const out = new Map<string, PartnerRangRow>()
  if (ids.length === 0) return out
  const { data } = await supabase
    .from('partner_rang')
    .select('partner_id, rang, sinnsatz, volumen, stand')
    .eq('partner_typ', typ)
    .in('partner_id', ids)
  for (const row of (data ?? []) as { partner_id: string; rang: string | null; sinnsatz: string | null; volumen: number | null; stand: string }[]) {
    const mapped = mapRow(row)
    if (mapped) out.set(row.partner_id, mapped)
  }
  return out
}

export type PartnerRangSelf = {
  tier: Tier
  sinnsatz: string
  volumen: number
  naechster: Tier | null
  prozent: number
}

/**
 * Selbstansicht des verdienten Rangs (Makler/Werkstatt-Dashboard): Tier + Sinnsatz + Volumen
 * (in der EIGENEN Ansicht erlaubt) + Fortschritt zur naechsten Stufe (Motivation). Laedt die
 * Live-Config (DB-getunte Schwellen). null = kein Rang (nicht gegatet). Der Composite-Score
 * bleibt intern — nur der Fortschritts-Prozent verlaesst die Funktion (keine nackte Zahl).
 */
export async function getPartnerRangSelf(supabase: Sb, typ: PartnerTyp, id: string): Promise<PartnerRangSelf | null> {
  const config = await ladeRangConfig(supabase)
  const { data } = await supabase
    .from('partner_rang')
    .select('rang, sinnsatz, volumen, score')
    .eq('partner_typ', typ)
    .eq('partner_id', id)
    .maybeSingle()
  if (!data || !data.rang) return null
  const tier = data.rang as Tier
  const { naechster, prozent } = rangFortschritt(Number(data.score ?? 0), tier, config)
  return { tier, sinnsatz: data.sinnsatz ?? '', volumen: data.volumen ?? 0, naechster, prozent }
}
