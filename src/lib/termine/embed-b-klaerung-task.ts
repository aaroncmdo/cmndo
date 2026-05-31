// AAR-939 — Dispatcher-Klaerungs-Task fuer ungeklaerte nur_gutachter/embed-B-Termine.
//
// Erzeugt einen Review-Task fuer das Dispatch-Team, wenn der Ausgang eines
// nur_gutachter-Termins nicht eindeutig ist:
//   • Kunde meldet ueber das Portal "Gutachter kam nicht" (SV-No-Show), oder
//   • niemand meldet etwas und der Termin ist ueberfaellig (Cron-Schweigen).
//
// typ='dispatch' → erscheint in der Dispatch-Dashboard-Queue (filtert auf
// typ='dispatch' + status='offen'). task_typ traegt die Semantik und macht ihn
// in /admin/tasks unterscheidbar. Idempotent: pro Termin hoechstens EIN offener
// Klaerungs-Task (entity_type='termin', entity_id=terminId).
//
// Bewusst KEIN 'use server' — genutzt von der Kunde-NEIN-Action UND dem
// Resolution-Cron. Raw tasks-Insert analog sv-ablehnung.ts (etabliertes Muster).

import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

export const EMBED_B_KLAERUNG_TASK_TYP = 'embed_b_termin_klaerung'

export type EmbedBKlaerungGrund = 'kunde_meldet_sv_no_show' | 'keine_rueckmeldung'

// Termin-Status, die einen nur_gutachter-Termin als NICHT mehr "offen/ungeklaert"
// markieren — gemeinsame Ausschlussliste fuer Banner-Gating (page.tsx) UND den
// Resolution-Cron, damit beide dieselbe Definition von "stale" nutzen.
export const TERMIN_RESOLUTION_EXCLUDED_STATUSES = [
  'storniert', 'abgesagt', 'abgelehnt', 'verlegt', 'verlegung_pending', 'abgeschlossen', 'verschoben',
] as const

/** PostgREST-in-Liste fuer `.not('status', 'in', ...)`. */
export const TERMIN_RESOLUTION_EXCLUDED_IN_CLAUSE = `(${TERMIN_RESOLUTION_EXCLUDED_STATUSES.map(
  (s) => `"${s}"`,
).join(',')})`

/**
 * Legt einen Dispatcher-Klaerungs-Task an (idempotent pro Termin). Liefert
 * created=false zurueck, wenn bereits ein offener Task fuer den Termin existiert.
 */
export async function createEmbedBKlaerungTask(
  db: AdminClient,
  params: {
    terminId: string
    fallId: string | null
    leadId: string | null
    grund: EmbedBKlaerungGrund
  },
): Promise<{ ok: boolean; created: boolean; error?: string }> {
  const { terminId, fallId, leadId, grund } = params

  // Idempotenz: existiert bereits ein OFFENER Klaerungs-Task fuer diesen Termin?
  const { data: existing } = await db
    .from('tasks')
    .select('id')
    .eq('entity_type', 'termin')
    .eq('entity_id', terminId)
    .eq('task_typ', EMBED_B_KLAERUNG_TASK_TYP)
    .eq('status', 'offen')
    .limit(1)
    .maybeSingle()
  if (existing) return { ok: true, created: false }

  const titel =
    grund === 'kunde_meldet_sv_no_show'
      ? 'Kunde meldet: Gutachter nicht erschienen — prüfen + Verlegung'
      : 'Gutachter-Termin ohne Rückmeldung — Ausgang klären'
  const beschreibung =
    grund === 'kunde_meldet_sv_no_show'
      ? 'Der Kunde hat über das Portal gemeldet, dass der Gutachter nicht zum Termin erschienen ist. Bitte prüfen: SV-No-Show bestätigen (Record) + neuen Termin vermitteln. Abrechnung läuft per Default weiter (kein Auto-Storno).'
      : 'Der nur_gutachter-Termin ist überfällig und wurde weder als durchgeführt noch als No-Show gemeldet. Bitte den Ausgang klären: durchgeführt / SV-No-Show / Verlegung / Storno.'

  const { error } = await db.from('tasks').insert({
    fall_id: fallId,
    lead_id: leadId,
    typ: 'dispatch',
    task_typ: EMBED_B_KLAERUNG_TASK_TYP,
    titel,
    beschreibung,
    status: 'offen',
    prioritaet: 'dringend',
    auto_erstellt: true,
    entity_type: 'termin',
    entity_id: terminId,
    faellig_am: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  })
  if (error) return { ok: false, created: false, error: error.message }
  return { ok: true, created: true }
}
