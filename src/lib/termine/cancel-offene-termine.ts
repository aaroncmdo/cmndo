// P3a: Bei Fall-Storno die offenen Termine des Falls canceln (engine sageAb).
// Non-critical: ein fehlgeschlagener Termin-Cancel darf den Fall-Storno nicht brechen.
//
// Ops-Test 11.08. (RC-5): auf die BEZUG-ACHSE generalisiert. Bei einer Quali-
// Disqualifikation (Eigenverschulden / Kasko-Werkstattbindung) haengt der bereits
// reservierte Gutachter-Termin an der LEAD-Achse — der Lead ist zu dem Zeitpunkt
// noch nicht konvertiert, es gibt keinen Fall. Ohne die Lead-Achse blieb der Slot
// des Gutachters fuer einen disqualifizierten Lead dauerhaft blockiert.
import type { SupabaseClient } from '@supabase/supabase-js'
import { sageAb } from '@/lib/termine/engine'
import { bezugOrExpr, type BezugAchse } from './bezug-filter'

const AKTIV = ['bestaetigt', 'reserviert', 'verlegt', 'verlegung_pending']

/**
 * Cancelt alle aktiven gutachter_termine eines Bezugs (status -> storniert + cancelled_at).
 * Bezug-aware: matcht die Legacy-Spalte `${achse}_id` ODER die kanonische bezug-Achse.
 */
export async function cancelOffeneTermineFuerBezug(
  db: SupabaseClient,
  achse: BezugAchse,
  id: string,
  grund: string,
): Promise<void> {
  // Ohne ID wuerde der or-Ausdruck degenerieren — lieber gar nicht filtern als zu breit.
  if (!id) return
  try {
    const { data: termine } = await db
      .from('gutachter_termine')
      .select('id')
      // P3.3: bezug-aware statt naivem .eq(`${achse}_id`) -> matcht auch bezug-native Termine.
      .or(bezugOrExpr(achse, id))
      .in('status', AKTIV)
    for (const t of (termine ?? []) as { id: string }[]) {
      const r = await sageAb(t.id, { status: 'storniert', grund, db })
      if (!r.ok) console.error(`[storno] sageAb(${t.id}) fehlgeschlagen (non-critical): ${r.error}`)
    }
  } catch (err) {
    console.error(`[storno] cancelOffeneTermineFuerBezug(${achse}) fehlgeschlagen (non-critical):`, err)
  }
}

/** Cancelt alle aktiven gutachter_termine eines Falls. Duenner Wrapper (3 Storno-Call-Sites). */
export async function cancelOffeneTermineFuerFall(
  db: SupabaseClient,
  fallId: string,
  grund: string,
): Promise<void> {
  return cancelOffeneTermineFuerBezug(db, 'fall', fallId, grund)
}
