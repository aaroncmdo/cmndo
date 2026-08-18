// AAR-431: Kanzlei-SLA-Tracker. Analog zu lib/sla/tracker.ts (SV-SLAs),
// aber für Kanzlei-Deadlines (AS-Versand, Rüge-Versand, Kürzungs-Antwort,
// VS-Nachfass). Nutzt dieselbe Tabelle sla_tracking via target_rolle.

import { createAdminClient } from '@/lib/supabase/admin'
import type { KanzleiSlaTyp } from './blocker-detection'
import { resolveSlaBreachTaskCancel } from './task-resolution'

export const KANZLEI_SLA_LABEL: Record<KanzleiSlaTyp, string> = {
  kanzlei_as_versand: 'Anschlussschreiben-Versand (2 WT)',
  kanzlei_ruege_versand: 'Rüge-Versand (2 WT)',
  kanzlei_kuerzung_antwort: 'Einschätzung zur VS-Kürzung (3 WT)',
  kanzlei_vs_nachfass: 'VS-Nachfassung (Kanzlei)',
}

interface StartOptions {
  phase?: string
  deadline: Date
  target_rolle?: 'kanzlei' | 'sv' | 'kunde'
}

/**
 * Startet einen Kanzlei-SLA. Idempotent via UNIQUE(fall_id, sla_typ) — existiert
 * bereits ein Eintrag (auch completed), bleibt er unverändert.
 */
export async function startKanzleiSla(
  fallId: string,
  slaTyp: KanzleiSlaTyp,
  opts: StartOptions,
): Promise<void> {
  const db = createAdminClient()
  const now = new Date()

  const { error } = await db.from('sla_tracking').insert({
    fall_id: fallId,
    sla_typ: slaTyp,
    started_at: now.toISOString(),
    breach_at: opts.deadline.toISOString(),
    status: 'pending',
    target_rolle: opts.target_rolle ?? 'kanzlei',
    phase: opts.phase ?? null,
    n_mahnungen: 0,
  })

  // 23505 = unique_violation → Eintrag existiert bereits, ignorieren (idempotent)
  if (error && error.code !== '23505') {
    console.error(`[AAR-431] startKanzleiSla(${slaTyp}) Fehler:`, error.message)
    return
  }

  if (!error) {
    await db.from('timeline').insert({
      fall_id: fallId,
      typ: 'system',
      titel: `SLA gestartet: ${KANZLEI_SLA_LABEL[slaTyp]}`,
      beschreibung: `Deadline: ${opts.deadline.toLocaleString('de-DE')}${opts.phase ? ` (Phase: ${opts.phase})` : ''}`,
    })
  }
}

/**
 * Schließt einen Kanzlei-SLA ab und canceled zugehörige KB-Nachfass-Tasks.
 */
export async function completeKanzleiSla(
  fallId: string,
  slaTyp: KanzleiSlaTyp,
): Promise<void> {
  const db = createAdminClient()

  const { data: sla } = await db
    .from('sla_tracking')
    .select('id, status')
    .eq('fall_id', fallId)
    .eq('sla_typ', slaTyp)
    .maybeSingle()

  if (!sla || sla.status === 'completed') return

  await db
    .from('sla_tracking')
    .update({ completed_at: new Date().toISOString(), status: 'completed' })
    .eq('id', sla.id as string)

  // Pending KB-Nachfass-Tasks aufloesen. Der fruehre Wert abgebrochen ist KEIN
  // gueltiger task_status-enum-Wert (Postgres lehnte das UPDATE ab -> Cancel lief nie).
  // ⚠ Genau hier hat die Klasse schon einmal zugeschlagen (s. Kommentar oben): ein
  // CHECK-invalider Status liess das UPDATE still scheitern, der Cancel lief NIE.
  // Der Wert wurde korrigiert, die Pruefung fehlte bis jetzt.
  const { error: cancelFehler } = await db
    .from('tasks')
    .update(resolveSlaBreachTaskCancel(new Date(), 'Kanzlei-SLA erfüllt — Nachfass hinfällig'))
    .eq('fall_id', fallId)
    .in('typ', ['kanzlei-nachfassen', 'kunde-erinnern-fuer-kanzlei', 'sv-nachfassen-fuer-kanzlei'])
    .in('status', ['offen', 'in-bearbeitung', 'blockiert'])
  if (cancelFehler) {
    console.error(`[Kanzlei-SLA] Nachfass-Tasks nicht aufgeloest (Fall ${fallId}) — bleiben offen:`, cancelFehler.message)
  }

  await db.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: `SLA erfüllt: ${KANZLEI_SLA_LABEL[slaTyp]}`,
    beschreibung: 'Zugehörige KB-Nachfass-Tasks wurden automatisch abgeschlossen.',
  })
}
