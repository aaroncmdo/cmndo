// KI-Intake: geteiltes Feld-Schema fuer den Feststellungs-Step. EINE Quelle
// (onboarding_felder, flow_key 'lead-erfassung'), gefiltert wie die Feststellung
// (istFeststellungsFeld). Wizard UND KI-Schicht lesen dasselbe.
import { createAdminClient } from '@/lib/supabase/admin'
import { istFeststellungsFeld } from './feststellung-felder'

export type IntakeFeld = {
  feld_key: string
  typ: string
  label: string
  hint: string | null
  optionen: { wert: string; label: string }[] | null
  pflicht: boolean
  sektion: string | null
  spalte: string
}

export function normalizeOptionen(raw: unknown): { wert: string; label: string }[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out = raw.map((o) => {
    if (typeof o === 'string') return { wert: o, label: o }
    const rec = o as Record<string, unknown>
    const wert = (rec.wert ?? rec.value) as string | undefined
    const label = (rec.label ?? wert) as string | undefined
    return wert ? { wert, label: label ?? wert } : null
  })
  const clean = out.filter((x): x is { wert: string; label: string } => x !== null)
  return clean.length ? clean : null
}

export async function ladeFeststellungIntakeSchema(): Promise<IntakeFeld[]> {
  const admin = createAdminClient()
  const { data: phasen } = await admin
    .from('onboarding_phasen')
    .select('id')
    .eq('flow_key', 'lead-erfassung')
  const phaseIds = ((phasen ?? []) as Array<{ id: string }>).map((p) => p.id)
  if (phaseIds.length === 0) return []

  const { data } = await admin
    .from('onboarding_felder')
    .select('feld_key, typ, label, hint, optionen, pflicht, sektion, db_target, reihenfolge')
    .in('phase_id', phaseIds)
    .order('reihenfolge', { ascending: true })

  const felder: IntakeFeld[] = []
  for (const row of (data ?? []) as Array<{
    feld_key: string
    typ: string
    label: string | null
    hint: string | null
    optionen: unknown
    pflicht: boolean | null
    sektion: string | null
    db_target: { tabelle?: string; spalte?: string } | null
  }>) {
    if (!istFeststellungsFeld({ feld_key: row.feld_key, typ: row.typ, sektion: row.sektion })) continue
    const t = row.db_target
    if (t?.tabelle !== 'leads' || !t.spalte) continue
    felder.push({
      feld_key: row.feld_key,
      typ: row.typ,
      label: row.label ?? row.feld_key,
      hint: row.hint,
      optionen: normalizeOptionen(row.optionen),
      pflicht: row.pflicht === true,
      sektion: row.sektion,
      spalte: t.spalte,
    })
  }
  return felder
}
