// AAR-939 — geteilte Kernlogik fuer den nur_gutachter-Terminabschluss (embed-B).
//
// Genutzt von zwei owner-unterschiedlichen Callern:
//   • markNurGutachterTerminDurchgefuehrt (SV-Action, sv_id-Owner-Check)
//   • bestaetigeTerminAlsKunde (Kunde-Action, claim_parties/kunde_id-Owner-Check)
//
// Auth/Ownership + nur_gutachter-Guard + Idempotenz-Vorpruefung macht der Caller.
// Hier nur die beiden atomaren Writes. revalidate ebenfalls Caller-Sache (die
// betroffenen Routen unterscheiden sich je Portal).
//
// Bewusst KEIN 'use server'-File (Shared-Kernlogik fuer zwei owner-unterschiedliche Caller).

import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

// T3-S5: CLAIM_TERMINAL_STATUSES ist ENTFERNT (claims.status gedroppt; letzte Importer in
// #4417/#4418 auf istClaimGeschlossen umgestellt). Terminal-SSoT = CLOSED_OPERATIVE_STATUS.

/**
 * Verankert den Termin als durchgefuehrt + schliesst den nur_gutachter-Claim
 * terminal ab.
 *
 * status='abgeschlossen' (NICHT 'durchgefuehrt' — letzteres wurde am 29.04. per
 * cmm32_revert_termin_status_durchgefuehrt aus gutachter_termine_status_check
 * entfernt und failte still). Kanonischer "durchgefuehrt"-Anker ist die
 * Timestamp-Spalte durchgefuehrt_am, die phase.ts + der Billing-Trigger
 * (termin_sync_auftrag_status) lesen.
 *
 * Der Claim-Close ist non-fatal: der durchgefuehrt_am-Anker (Billing) steht nach
 * Schritt 1 bereits — ein Claim-Close-Fehler darf den Termin-Abschluss nicht
 * zuruecknehmen.
 */
export async function closeNurGutachterTerminAlsDurchgefuehrt(
  db: AdminClient,
  // byUserId nullable: der Kunde-/SV-Caller uebergibt eine User-ID, der
  // WhatsApp-Inbound-Pfad (kein eingeloggter User, Ownership via Twilio-Signatur
  // + Phone-Match) uebergibt null. claims.endzustand_gesetzt_durch_user_id ist
  // nullable, der Audit-Anker bleibt also konsistent.
  params: { terminId: string; claimId: string; byUserId: string | null; grund: string },
): Promise<{ ok: boolean; error?: string }> {
  const { terminId, claimId, byUserId, grund } = params
  const now = new Date().toISOString()

  // 1) Termin: durchgefuehrt_am + CHECK-gueltiger Status. Treibt den Billing-Trigger.
  //    .is(durchgefuehrt_am, null) = atomarer Schutz gegen Doppel-Setzen/-Trigger.
  const { error: terminErr } = await db
    .from('gutachter_termine')
    .update({ status: 'abgeschlossen', durchgefuehrt_am: now })
    .eq('id', terminId)
    .is('durchgefuehrt_am', null)
  if (terminErr) return { ok: false, error: terminErr.message }

  // AAR-939 8b: SV-Tracking-Webhook termin_durchgefuehrt (value_eur = einzelpreis).
  // Dynamic import — dieses Modul exportiert CLAIM_TERMINAL_STATUSES (evtl.
  // client-importiert), darf also nicht statisch ein 'server-only'-Modul ziehen.
  // No-op wenn der Termin nicht zu einer embed-B-Anfrage gehoert. Non-fatal.
  try {
    const { fireTrackingWebhook } = await import('@/lib/embed/tracking-webhook')
    await fireTrackingWebhook({ event: 'termin_durchgefuehrt', terminId })
  } catch (err) {
    console.error('[AAR-939 8b] tracking termin_durchgefuehrt fehlgeschlagen:', err)
  }

  // 2) Claim terminal schliessen — via ENGINE (Fundament C1-Funnel).
  // Frueher ein Direkt-Write auf claims.operative_status (Ratchet-Baseline-Eintrag): der
  // umging die State-Machine -> KEIN phase_transitions-Event-Log, keine Timeline, kein
  // fall.status_changed-Emit. Jetzt laeuft der Close ueber transitionFallStatus; 'termin_
  // durchgefuehrt' ist dort ein BROADLY_REACHABLE_TERMINAL (aus jedem AKTIVEN Zustand
  // erreichbar = das frueher guard-lose Verhalten) und setzt abgeschlossen_am selbst.
  // Der bisherige "nur wenn nicht bereits terminal"-Guard steckt jetzt in der Engine
  // (istTerminalUebergangErlaubt) -> bereits geschlossener Claim => Engine wirft => caught
  // (Idempotenz erhalten, kein Doppel-Close).
  // Non-fatal wie zuvor: der durchgefuehrt_am-Anker (Billing) steht nach Schritt 1 bereits.
  const { data: bridge } = await db
    .from('faelle_claim_bridge')
    .select('fall_id')
    .eq('claim_id', claimId)
    .maybeSingle()
  const fallId = (bridge?.fall_id as string | null) ?? null
  if (fallId) {
    try {
      const { transitionFallStatus } = await import('@/lib/faelle/state-machine')
      await transitionFallStatus(fallId, 'termin_durchgefuehrt', {
        user_id: byUserId ?? undefined,
        grund,
      })
      // endzustand_*-Audit-Anker: claims-only Spalten (NICHT im CLAIM_OWNED_DUPLICATE_COLUMNS-
      // Split-Set der Engine -> dort wuerden sie im ungeschriebenen faelleUpdate landen).
      // Daher hier separat, nach dem erfolgreichen Engine-Uebergang. Kein operative_status
      // in diesem Payload -> Ratchet-konform.
      const { error: auditErr } = await db
        .from('claims')
        .update({
          endzustand_gesetzt_durch_user_id: byUserId,
          endzustand_gesetzt_am: now,
          endzustand_grund: grund,
        })
        .eq('id', claimId)
      if (auditErr) console.error('[AAR-939] endzustand-Audit-Write fehlgeschlagen:', auditErr.message)
    } catch (err) {
      console.error(
        '[AAR-939] claim terminal close via Engine fehlgeschlagen (non-fatal):',
        err instanceof Error ? err.message : err,
      )
    }
  } else {
    console.error(`[AAR-939] keine Bridge-Row fuer claim ${claimId} — Terminal-Close uebersprungen`)
  }

  return { ok: true }
}
