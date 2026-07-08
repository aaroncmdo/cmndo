// src/lib/partner-rang/get.ts
import type { PartnerTyp, Tier } from './types'
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
