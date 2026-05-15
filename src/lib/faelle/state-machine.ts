import { createAdminClient } from '@/lib/supabase/admin'
import { emitEvent } from '@/lib/notifications/emit'

/**
 * KFZ-202: Zentrale State-Machine fuer faelle.status.
 * Validiert alle Uebergaenge, setzt Timestamps, schreibt Timeline.
 *
 * AAR-501 N6: Jeder Übergang emittet das entsprechende Notification-Event
 * (fall.status_changed / fall.storniert / kanzlei.uebergabe / regulierung.ergebnis),
 * damit alle Caller automatisch den Event-Bus benutzen. Fehler im Emit werden
 * geloggt — der Status-Übergang bleibt atomar.
 */

export const FALL_STATUS_TRANSITIONS: Record<string, string[]> = {
  'ersterfassung': ['sv-gesucht', 'sv-zugewiesen', 'sv-termin', 'storniert'],
  'onboarding': ['ersterfassung', 'storniert'],
  'sv-gesucht': ['sv-zugewiesen', 'sv-termin', 'storniert'],
  'sv-zugewiesen': ['sv-termin', 'storniert'],
  'sv-termin': ['besichtigung', 'begutachtung-laeuft', 'storniert'],
  'besichtigung': ['begutachtung-laeuft', 'gutachten-eingegangen', 'storniert'],
  'begutachtung-laeuft': ['gutachten-eingegangen', 'storniert'],
  'gutachten-eingegangen': ['filmcheck', 'gutachten-eingegangen', 'storniert'],
  'filmcheck': ['kanzlei-uebergeben', 'gutachten-eingegangen', 'storniert'],
  'qc-pruefung': ['kanzlei-uebergeben', 'gutachten-eingegangen', 'storniert'],
  'kanzlei-uebergeben': ['anschlussschreiben', 'storniert'],
  // AAR-167 Fix: 'klage' als zulässiges Ziel aufgenommen, nachdem die Kanzlei
  // den Fall gerichtlich weiterführt. 'vs-kuerzt' fehlte bisher komplett —
  // Webhook `vs_kuerzt` schreibt Status direkt, aber uebergebeFallKlage()
  // ruft transitionFallStatus() und darf ab hier abzweigen.
  'anschlussschreiben': ['regulierung-laeuft', 'nachbesichtigung-laeuft', 'vs-abgelehnt', 'vs-kuerzt', 'regulierung', 'klage', 'storniert'],
  'regulierung': ['zahlung-eingegangen', 'nachbesichtigung-laeuft', 'abgeschlossen', 'storniert'],
  'regulierung-laeuft': ['zahlung-eingegangen', 'nachbesichtigung-laeuft', 'vs-abgelehnt', 'vs-kuerzt', 'klage', 'storniert'],
  'vs-kuerzt': ['nachbesichtigung-laeuft', 'regulierung-laeuft', 'vs-abgelehnt', 'klage', 'storniert'],
  'nachbesichtigung-laeuft': ['regulierung-laeuft', 'vs-abgelehnt', 'klage', 'storniert'],
  'vs-abgelehnt': ['klage', 'storniert'],
  'klage': ['abgeschlossen', 'storniert'],
  'zahlung-eingegangen': ['abgeschlossen'],
  'abgeschlossen': [],
  'storniert': [],
}

export async function transitionFallStatus(
  fallId: string,
  newStatus: string,
  metadata?: {
    vs_reaktion_typ?: string
    betrag?: number
    grund?: string
    user_id?: string
  },
): Promise<void> {
  const db = createAdminClient()

  const { data: fall, error: fetchErr } = await db
    .from('faelle')
    .select('id, status')
    .eq('id', fallId)
    .single()

  if (fetchErr || !fall) throw new Error(`Fall ${fallId} nicht gefunden`)

  const currentStatus = fall.status as string

  // Validate transition
  const allowed = FALL_STATUS_TRANSITIONS[currentStatus]
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Ungueltiger Status-Uebergang: ${currentStatus} → ${newStatus}. Erlaubt: ${allowed?.join(', ') ?? 'keine'}`,
    )
  }

  const now = new Date().toISOString()
  const update: Record<string, unknown> = {
    status: newStatus,
    status_changed_at: now,
    updated_at: now,
  }

  // Status-specific timestamp fields
  if (newStatus === 'storniert') {
    update.storniert_am = now
    if (metadata?.grund) update.storno_grund = metadata.grund
  }
  if (newStatus === 'abgeschlossen') {
    update.abgeschlossen_am = now
  }
  if (newStatus === 'kanzlei-uebergeben') {
    update.kanzlei_uebergeben_am = now
  }
  if (newStatus === 'anschlussschreiben') {
    update.anschlussschreiben_am = now
  }
  if (newStatus === 'zahlung-eingegangen') {
    update.zahlung_eingegangen_am = now
    if (metadata?.betrag) update.zahlung_betrag = metadata.betrag
  }
  if (newStatus === 'regulierung' || newStatus === 'regulierung-laeuft') {
    update.regulierung_am = now
    update.regulierung_angekuendigt_am = now
  }
  if (newStatus === 'vs-abgelehnt') {
    update.vs_reaktion_typ = 'abgelehnt'
    update.vs_reaktion_am = now
    if (metadata?.grund) update.vs_ablehnungsgrund = metadata.grund
  }
  // AAR-167: Klage-Übergabe markiert den Fall als „geschlossen aus Claimondo-
  // Sicht" — LexDrive führt weiter. Kein eigener Timestamp — status_changed_at
  // reicht, geschlossen_grund kommt als Prompt-Input in der Action.
  if (newStatus === 'klage') {
    if (metadata?.grund) update.geschlossen_grund = metadata.grund
  }
  // AAR-167: VS-Kürzung — analog zu vs-abgelehnt, aber als eigener Reaktions-Typ
  if (newStatus === 'vs-kuerzt') {
    update.vs_reaktion_typ = 'gekuerzt'
    update.vs_reaktion_am = now
    if (metadata?.grund) update.vs_kuerzung_grund = metadata.grund
  }

  const { error: updateErr } = await db
    .from('faelle')
    .update(update)
    .eq('id', fallId)

  if (updateErr) throw new Error(updateErr.message)

  // Timeline entry
  await db.from('timeline').insert({
    fall_id: fallId,
    typ: 'status-change',
    titel: `Status: ${currentStatus} → ${newStatus}`,
    beschreibung: metadata?.grund ?? null,
    erstellt_von: metadata?.user_id ?? null,
  })

  // AAR-586 Finding 1: phase_transitions als Audit-Log aller Status-Übergänge.
  // Non-critical — Fehler blockieren den Übergang nicht.
  db.from('phase_transitions').insert({
    fall_id: fallId,
    from_phase: currentStatus,
    to_phase: newStatus,
    trigger_type: 'auto',
    transitioned_by: metadata?.user_id ?? null,
    actor_rolle: null,
    grund: metadata?.grund ?? null,
    payload: { via: 'transitionFallStatus', metadata: metadata ?? null },
  }).then(({ error }) => {
    if (error) console.error('[AAR-586] phase_transitions insert failed (non-critical):', error.message)
  })

  // AAR-501 N6: Notification-Event emittieren. Generische fall.status_changed
  // für jeden Übergang + spezifische Events für Storno und Kanzlei-Übergabe.
  // Emit-Fehler dürfen den Übergang nicht brechen.
  try {
    if (newStatus === 'storniert') {
      await emitEvent(
        'fall.storniert',
        { fallId, grund: metadata?.grund ?? 'storniert' },
        { fallId, triggeredBy: metadata?.user_id },
      )
    } else if (newStatus === 'kanzlei-uebergeben') {
      await emitEvent(
        'kanzlei.uebergabe',
        { fallId },
        { fallId, triggeredBy: metadata?.user_id },
      )
      await emitEvent(
        'fall.status_changed',
        { fallId, oldStatus: currentStatus, newStatus },
        { fallId, triggeredBy: metadata?.user_id },
      )
    } else {
      await emitEvent(
        'fall.status_changed',
        { fallId, oldStatus: currentStatus, newStatus },
        { fallId, triggeredBy: metadata?.user_id },
      )
    }
  } catch (err) {
    console.error('[AAR-501] emitEvent fall.status_changed failed:', err)
  }

  // AAR-77: LexDrive-Email bei Status-Wechsel auf kanzlei-uebergeben
  if (newStatus === 'kanzlei-uebergeben') {
    try {
      const { buildAndSendKanzleiEmail } = await import('@/lib/lexdrive/email-sender')
      buildAndSendKanzleiEmail(fallId).catch(err =>
        console.error('[AAR-77] LexDrive-Email Fehler:', err),
      )
    } catch (err) {
      console.error('[AAR-77] LexDrive-Email Trigger Fehler:', err)
    }
  }

  // AAR-85: SLA-Tracking an Status-Uebergaengen
  try {
    const { completeSla, startSla } = await import('@/lib/sla/tracker')
    if (newStatus === 'sv-zugewiesen' || newStatus === 'sv-termin') {
      await completeSla(fallId, 'gutachter_zuweisung')
    }
    if (newStatus === 'besichtigung' || newStatus === 'begutachtung-laeuft') {
      await completeSla(fallId, 'besichtigung')
      await startSla(fallId, 'gutachten_upload')
    }
    if (newStatus === 'gutachten-eingegangen') {
      await completeSla(fallId, 'gutachten_upload')
    }
  } catch (err) { console.error('[AAR-85] SLA Status-Hook:', err) }

  // AAR-431: Kanzlei-SLA-Tracking
  try {
    const { startKanzleiSla } = await import('@/lib/sla/kanzlei-tracker')
    const { addWorkingDays } = await import('@/lib/sla/workdays')

    // Bei Kanzlei-Übergabe → AS-Versand-SLA (2 WT)
    if (newStatus === 'kanzlei-uebergeben') {
      await startKanzleiSla(fallId, 'kanzlei_as_versand', {
        phase: 'kanzlei_uebergabe',
        deadline: addWorkingDays(new Date(), 2),
        target_rolle: 'kanzlei',
      })
    }

    // Bei VS-Kürzung → Kanzlei-Antwort-SLA (3 WT)
    if (newStatus === 'vs-kuerzt') {
      await startKanzleiSla(fallId, 'kanzlei_kuerzung_antwort', {
        phase: 'vs_antwort',
        deadline: addWorkingDays(new Date(), 3),
        target_rolle: 'kanzlei',
      })
    }
  } catch (err) {
    console.error('[AAR-431] Kanzlei-SLA Status-Hook:', err)
  }

  // AAR-924: Per-Case-Billing-Trigger. Bei Status-Wechsel auf
  // gutachten-eingegangen (primär) oder abgeschlossen (Backstop, falls
  // gutachten-eingegangen übersprungen wurde z.B. via direkter VS-Reaktion)
  // wird processCaseBilling(fallId) aufgerufen: setzt lead_preis_netto,
  // verrechnet werbebudget_guthaben_netto, schreibt sv_nachzahlung_netto.
  // Idempotent (no-op wenn lead_preis_netto bereits gesetzt). Non-critical:
  // Fehler im Trigger brechen den Status-Uebergang nicht — Batch-Cron
  // case-billing-batch fängt es am Folgetag.
  if (newStatus === 'gutachten-eingegangen' || newStatus === 'abgeschlossen') {
    try {
      const { processCaseBilling } = await import('@/lib/abrechnung/process-case-billing')
      const result = await processCaseBilling(fallId)
      if (result) {
        console.log(`[AAR-924] processCaseBilling triggered via ${newStatus} for fall ${fallId}: lead_preis=${result.lead_preis_netto}`)
      }
    } catch (err) {
      console.error('[AAR-924] processCaseBilling Status-Hook fehlgeschlagen:', err)
    }
  }

  // AAR-313: Auto-Task „Mietwagen / Nutzungsausfall klären" für KB,
  // sobald die Besichtigung läuft. Idempotent über task_code.
  if (newStatus === 'besichtigung' || newStatus === 'begutachtung-laeuft') {
    try {
      const { data: details } = await db
        .from('faelle')
        .select('mietwagen_flag, nutzungsausfall, kundenbetreuer_id, fall_nummer')
        .eq('id', fallId)
        .single()
      const relevant = details?.mietwagen_flag === true || details?.nutzungsausfall === true
      if (relevant) {
        const { data: existing } = await db
          .from('tasks')
          .select('id')
          .eq('fall_id', fallId)
          .eq('task_code', 'mietwagen-klaeren')
          .maybeSingle()
        if (!existing) {
          await db.from('tasks').insert({
            fall_id: fallId,
            typ: 'kb',
            task_code: 'mietwagen-klaeren',
            titel: 'Nutzungsausfall/Mietwagen klären',
            beschreibung:
              'Fahrzeug fahrbereit? Wenn nein: Kanzlei informieren für Versicherungsanfrage Mietwagen. Reparaturnachweis einfordern sobald Reparatur abgeschlossen.',
            status: 'offen',
            prioritaet: 'hoch',
            empfaenger_rolle: 'kundenbetreuer',
            empfaenger_user_id: details?.kundenbetreuer_id ?? null,
            zugewiesen_an: details?.kundenbetreuer_id ?? null,
            auto_erstellt: true,
            trigger_event: `status:${newStatus}`,
            phase: 'besichtigung',
          })
        }
      }
    } catch (err) {
      console.error('[AAR-313] Mietwagen/Nutzungsausfall Auto-Task fehlgeschlagen:', err)
    }
  }
}
