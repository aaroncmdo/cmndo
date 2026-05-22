import { createAdminClient } from '@/lib/supabase/admin'
import { emitEvent } from '@/lib/notifications/emit'
import { peelAuftraegeColumns, splitOrKeepFaelleUpdate } from '@/lib/faelle/claim-duplicate-columns'
import { upsertCurrentClaimPayment, type ClaimPaymentRerouteFields } from '@/lib/faelle/claim-payments'

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
  // AAR-Followup (SV-Lead-Ablehnung): sv-zugewiesen + sv-termin koennen nach
  // sv-gesucht zurueckgehen wenn SV den Lead ablehnt. Dispatch findet neuen SV.
  // Pfad gekapselt in lehneLeadAb() (src/lib/actions/sv-lead-ablehn-actions.ts).
  'sv-zugewiesen': ['sv-termin', 'sv-gesucht', 'storniert'],
  'sv-termin': ['besichtigung', 'begutachtung-laeuft', 'sv-gesucht', 'storniert'],
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
    .select('id, status, claim_id')
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
  // CMM-44 SP-J Bucket A: zahlung_eingegangen_am/zahlung_betrag liegen nicht mehr
  // auf faelle, sondern auf claim_payments (Reroute s.u. nach dem faelle/claims-
  // Write). Daher hier NICHT mehr ins faelle-Update schreiben.
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

  // CMM-44 SP-H PR2: storniert_am/storno_grund sind auf die auftraege-Sub-Tabelle
  // gewandert (1:N pro Claim — aktueller Auftrag). ZUERST peelen, damit sie nicht
  // im faelle- oder claims-Update landen; danach separat auf den aktuellen Auftrag
  // schreiben (s.u. nach dem faelle/claims-Write).
  const claimId = (fall as { claim_id?: string | null }).claim_id ?? null
  const { rest, auftraegeUpdate } = peelAuftraegeColumns(update)

  // CMM-48 PR-C + CMM-44 SP-B PR2a: Duplikat-Spalten gehen auf claims (SSoT).
  // Seit PR2a: status_changed_at + geschlossen_grund ebenfalls in
  // CLAIM_OWNED_DUPLICATE_COLUMNS aufgenommen → splitOrKeepFaelleUpdate routet
  // sie automatisch auf claims. Legacy-Faelle ohne claim_id: Fallback in
  // splitOrKeepFaelleUpdate (komplettes Update bleibt auf faelle).
  const { faelleUpdate, claimsUpdate } = splitOrKeepFaelleUpdate(rest, claimId)

  // CMM-44 SP-A2 (Cluster 3): vs_ablehnungsgrund ist ein Semantik-Duplikat mit
  // abweichendem claims-Namen (vs_ablehnungs_grund). splitOrKeepFaelleUpdate
  // kennt nur gleichnamige Spalten → der Wert landet faelschlich im faelleUpdate.
  // Hier herausziehen: bei vorhandenem claim_id mit dem neuen Namen ins
  // claimsUpdate umhaengen, sonst verwerfen (faelle-Spalte wird in PR2
  // gedroppt) — claim-lose Faelle sind Alt-Datenbestand.
  if ('vs_ablehnungsgrund' in faelleUpdate) {
    if (claimId) claimsUpdate.vs_ablehnungs_grund = faelleUpdate.vs_ablehnungsgrund
    delete faelleUpdate.vs_ablehnungsgrund
  }

  const { error: updateErr } = await db
    .from('faelle')
    .update(faelleUpdate)
    .eq('id', fallId)

  if (updateErr) throw new Error(updateErr.message)

  if (claimId && Object.keys(claimsUpdate).length > 0) {
    const { error: claimUpdateErr } = await db
      .from('claims')
      .update(claimsUpdate)
      .eq('id', claimId)
    if (claimUpdateErr) throw new Error(claimUpdateErr.message)
  }

  // CMM-44 SP-J Bucket A: Zahlungseingang -> claim_payments (1:N, aktuelle Row
  // create-or-update). status='erhalten' weil ein bestaetigter Eingang. Claim-
  // lose Legacy-Faelle (kein claim_id) koennen keine claim_payments-Row haben;
  // die zahlung_*-Daten werden dort nicht erfasst (pre-launch 0-cov, faelle-
  // Spalte stirbt in Phase 6).
  if (newStatus === 'zahlung-eingegangen' && claimId) {
    const cpFields: ClaimPaymentRerouteFields = { zahlungseingang_am: now, status: 'erhalten' }
    if (metadata?.betrag != null) cpFields.erhaltener_betrag = metadata.betrag
    const cpResult = await upsertCurrentClaimPayment(db, claimId, cpFields, metadata?.user_id ?? null)
    if (!cpResult.ok) throw new Error(cpResult.error ?? 'claim_payments Upsert fehlgeschlagen')
  }

  // CMM-44 SP-H PR2: storniert_am/storno_grund auf den aktuellen Auftrag des
  // Claims schreiben (Reader lesen sie seit SP-H von auftraege). Aktueller
  // Auftrag = ORDER BY reihenfolge DESC LIMIT 1. Existiert kein Auftrag (Storno
  // vor dem ersten Auftrag, pre-launch plausibel) → warn + skip, kein 500.
  if (claimId && Object.keys(auftraegeUpdate).length > 0) {
    const { data: aktAuftrag } = await db
      .from('auftraege')
      .select('id')
      .eq('claim_id', claimId)
      .order('reihenfolge', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (aktAuftrag) {
      const { error: auftragUpdateErr } = await db
        .from('auftraege')
        .update(auftraegeUpdate)
        .eq('id', aktAuftrag.id)
      if (auftragUpdateErr) throw new Error(auftragUpdateErr.message)
    } else {
      console.warn(
        `[CMM-44 SP-H] kein Auftrag fuer claim ${claimId} — ${Object.keys(auftraegeUpdate).join(',')} skip`,
      )
    }
  }

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

  // AAR-926: Storno-Backstop. transitionFallStatus(storniert) ruft
  // revertCaseBilling() als Hook, damit alle Storno-Pfade — auch direkte
  // Code-Pfade die nicht durch stornoFall/meldeNoShow/entscheideReklamation/
  // adminStornoFall laufen — Werbebudget zurueckbuchen und Felder zuruecksetzen.
  //
  // Whitelist STORNO_GRUENDE_OHNE_REVERT: storno_sv_spaet (< 24h vor Termin)
  // ist eine Vertragsstrafe — Lead-Preis bleibt. Daher kein Revert.
  //
  // Doppel-Call durch bestehende Caller (stornoFall sv_24h ruft transitionFallStatus
  // UND danach explizit revertCaseBilling) ist sicher: zweite Iteration laeuft
  // mit guthabenRueck=0 (kein Doppel-Increment) und Side-Effect-Logik prueft
  // abr.status (zweiter Lauf findet 'storniert' und no-op).
  if (newStatus === 'storniert') {
    const grund = metadata?.grund ?? ''
    const STORNO_GRUENDE_OHNE_REVERT = ['storno_sv_spaet']
    const skipRevert = STORNO_GRUENDE_OHNE_REVERT.some(p => grund.startsWith(p))
    if (!skipRevert) {
      try {
        const { revertCaseBilling } = await import('@/lib/abrechnung/revert-case-billing')
        await revertCaseBilling(fallId, grund || 'storniert', metadata?.user_id ?? '')
      } catch (err) {
        console.error('[AAR-926] revertCaseBilling Status-Hook fehlgeschlagen:', err)
      }
    }
  }

  // AAR-313: Auto-Task „Mietwagen / Nutzungsausfall klären" für KB,
  // sobald die Besichtigung läuft. Idempotent über task_code.
  if (newStatus === 'besichtigung' || newStatus === 'begutachtung-laeuft') {
    try {
      // CMM-44 SP-A2 (Cluster 2): mietwagen_flag/nutzungsausfall sind Semantik-
      // Duplikate — claims.hat_mietwagen / hat_nutzungsausfall ist SSoT, via
      // claims-Embed gelesen.
      const { data: details } = await db
        .from('faelle')
        .select('claim_id, claims:claim_id(hat_mietwagen, hat_nutzungsausfall)')
        .eq('id', fallId)
        .single()
      const detailClaim = details
        ? Array.isArray(details.claims) ? details.claims[0] : details.claims
        : null
      // CMM-44 SP-A: kundenbetreuer_id ist claims-Duplikat-Spalte (claims =
      // SSoT) — via claim_id aus claims laden statt aus faelle.
      let kundenbetreuerId: string | null = null
      const detailClaimId = (details as { claim_id?: string | null } | null)?.claim_id ?? null
      if (detailClaimId) {
        const { data: claimDetails } = await db
          .from('claims')
          .select('kundenbetreuer_id')
          .eq('id', detailClaimId)
          .maybeSingle()
        kundenbetreuerId = (claimDetails?.kundenbetreuer_id as string | null) ?? null
      }
      const relevant =
        detailClaim?.hat_mietwagen === true || detailClaim?.hat_nutzungsausfall === true
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
            empfaenger_user_id: kundenbetreuerId,
            zugewiesen_an: kundenbetreuerId,
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
