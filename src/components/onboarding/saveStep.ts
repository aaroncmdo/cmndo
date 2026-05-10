'use server'

import { createClient } from '@/lib/supabase/server'
import type { OnboardingFeld } from './types'

const ALLOWED_TABLES = new Set<string>(['gutachter_finder_anfragen'])

export async function saveOnboardingStep(
  anfrageId: string | null,
  _phaseKey: string,
  values: Record<string, unknown>,
  felder: OnboardingFeld[],
): Promise<{ ok: true; anfrageId: string } | { ok: false; error: string }> {
  const supabase = await createClient()

  // Group field updates by target table
  const updatesByTable = new Map<string, Record<string, unknown>>()
  for (const feld of felder) {
    const { tabelle, spalte } = feld.db_target
    if (!ALLOWED_TABLES.has(tabelle)) continue
    if (!(feld.feld_key in values)) continue
    const val = values[feld.feld_key]
    if (val === undefined) continue
    if (!updatesByTable.has(tabelle)) updatesByTable.set(tabelle, {})
    updatesByTable.get(tabelle)![spalte] = val
  }

  let id = anfrageId

  if (!id) {
    // Shell-Datensatz anlegen — wird durch spätere Phase-Updates befüllt.
    // vorname/nachname/email sind NOT NULL → leere Strings als Platzhalter,
    // status='entwurf' signalisiert unvollständige Anfrage.
    const payload = {
      vorname: '',
      nachname: '',
      email: '',
      schadentyp: 'unbekannt',
      status: 'entwurf',
      ...(updatesByTable.get('gutachter_finder_anfragen') ?? {}),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('gutachter_finder_anfragen')
      .insert(payload)
      .select('id')
      .single()

    if (error || !data) return { ok: false, error: error?.message ?? 'Insert fehlgeschlagen' }
    return { ok: true, anfrageId: (data as { id: string }).id }
  }

  // Bestehenden Datensatz pro Tabelle updaten
  for (const [tabelle, updates] of updatesByTable) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from(tabelle)
      .update(updates)
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
  }

  return { ok: true, anfrageId: id }
}
