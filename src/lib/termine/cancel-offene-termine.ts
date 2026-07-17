// P3a: Bei Fall-Storno die offenen Termine des Falls canceln (engine sageAb).
// Non-critical: ein fehlgeschlagener Termin-Cancel darf den Fall-Storno nicht brechen.
import type { SupabaseClient } from '@supabase/supabase-js'
import { sageAb } from '@/lib/termine/engine'
import { bezugOrExpr } from './bezug-filter'

const AKTIV = ['bestaetigt', 'reserviert', 'verlegt', 'verlegung_pending']

/** Cancelt alle aktiven gutachter_termine eines Falls (status -> storniert + cancelled_at). */
export async function cancelOffeneTermineFuerFall(
  db: SupabaseClient,
  fallId: string,
  grund: string,
): Promise<void> {
  try {
    const { data: termine } = await db
      .from('gutachter_termine')
      .select('id')
      // P3.3: bezug-aware statt naivem .eq('fall_id') -> matcht auch bezug-native Termine.
      .or(bezugOrExpr('fall', fallId))
      .in('status', AKTIV)
    for (const t of (termine ?? []) as { id: string }[]) {
      const r = await sageAb(t.id, { status: 'storniert', grund, db })
      if (!r.ok) console.error(`[storno] sageAb(${t.id}) fehlgeschlagen (non-critical): ${r.error}`)
    }
  } catch (err) {
    console.error('[storno] cancelOffeneTermineFuerFall fehlgeschlagen (non-critical):', err)
  }
}
