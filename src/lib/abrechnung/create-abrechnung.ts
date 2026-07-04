import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateUst } from '@/lib/billing/calculate-ust'
import { nextRechnungsNrRaw } from '@/lib/billing/generate-rechnungs-nr'

export interface BerechneteBetraege { nettoCent: number; ustCent: number; bruttoCent: number; ustSatz: number; nummer: string }
export interface AbrechnungInput { positionen: Array<{ betrag_netto_cent: number } & Record<string, unknown>>; kontext: Record<string, unknown> }
export interface AbrechnungDescriptor {
  zielTabelle: string
  positionenTabelle: string | null
  positionsFkSpalte: string | null
  ustSatz?: number
  nummer: (kontext: Record<string, unknown>) => { serie: string; jahr: number; format: (jahr: number, lfdNr: number) => string }
  buildHeaderRow: (b: BerechneteBetraege, positionen: AbrechnungInput['positionen'], kontext: Record<string, unknown>) => Record<string, unknown>
  buildPositionRow?: (position: Record<string, unknown>, headerId: string, kontext: Record<string, unknown>) => Record<string, unknown>
  pruefeBestehend?: (db: SupabaseClient<any>, kontext: Record<string, unknown>) => Promise<string | null>
  markiere?: (db: SupabaseClient<any>, headerId: string, positionen: AbrechnungInput['positionen'], kontext: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>
}
export type CreateAbrechnungResult =
  | { ok: true; erstellt: true; id: string; nummer: string; betraege: BerechneteBetraege; markiertOk: boolean }
  | { ok: true; erstellt: false; bestehendeId: string }
  | { ok: false; error: string }

export async function createAbrechnung(
  db: SupabaseClient<any>, descriptor: AbrechnungDescriptor, input: AbrechnungInput,
): Promise<CreateAbrechnungResult> {
  const { positionen, kontext } = input
  if (descriptor.pruefeBestehend) {
    const bestehendeId = await descriptor.pruefeBestehend(db, kontext)
    if (bestehendeId) return { ok: true, erstellt: false, bestehendeId }
  }
  const nettoCent = positionen.reduce((s, p) => s + Math.round(p.betrag_netto_cent), 0)
  const { ust_cent, brutto_cent, ust_satz_pct } = calculateUst(nettoCent, descriptor.ustSatz ?? 19)
  const spec = descriptor.nummer(kontext)
  let nummer: string
  try {
    const lfdNr = await nextRechnungsNrRaw(spec.serie, spec.jahr)
    nummer = spec.format(spec.jahr, lfdNr)
  } catch (err) { return { ok: false, error: `Nummer-Allokation fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}` } }
  const betraege: BerechneteBetraege = { nettoCent, ustCent: ust_cent, bruttoCent: brutto_cent, ustSatz: ust_satz_pct, nummer }
  const { data: header, error: headerErr } = await db.from(descriptor.zielTabelle).insert(descriptor.buildHeaderRow(betraege, positionen, kontext)).select('id').single()
  if (headerErr || !header) return { ok: false, error: `Header-Insert fehlgeschlagen: ${headerErr?.message ?? 'kein Datensatz'}` }
  const id = (header as { id: string }).id
  if (descriptor.positionenTabelle && descriptor.buildPositionRow) {
    const rows = positionen.map((p) => descriptor.buildPositionRow!(p, id, kontext))
    const { error: posErr } = await db.from(descriptor.positionenTabelle).insert(rows)
    if (posErr) return { ok: false, error: `Positionen-Insert fehlgeschlagen: ${posErr.message}` }
  }
  let markiertOk = true
  if (descriptor.markiere) {
    const r = await descriptor.markiere(db, id, positionen, kontext)
    markiertOk = r.ok
    if (!r.ok) console.error(`[createAbrechnung] markiere fehlgeschlagen (id=${id}):`, r.error)
  }
  return { ok: true, erstellt: true, id, nummer, betraege, markiertOk }
}
