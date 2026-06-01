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
// Bewusst KEIN 'use server'-File: so ist CLAIM_TERMINAL_STATUSES importierbar
// (AGENTS.md §use-server-Konstanten — Export aus 'use server' wird im
// Client-Bundle zu undefined).

import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

// Terminale claims.status — aus diesen heraus NICHT mehr ueberschreiben
// (Guard analog endzustand-actions setEndzustandFields). Kanonischer Ort;
// frueher lokal in termine/actions.ts dupliziert.
export const CLAIM_TERMINAL_STATUSES = [
  'reguliert_vollstaendig', 'storniert', 'klage_rechtsstreit',
  'verjaehrt', 'abgelehnt_final', 'an_externe_kanzlei_uebergeben',
  'termin_durchgefuehrt',
] as const

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

  // 2) Claim terminal schliessen — guarded gegen bereits terminale Stati.
  const { error: claimErr } = await db
    .from('claims')
    .update({
      status: 'termin_durchgefuehrt',
      endzustand_gesetzt_durch_user_id: byUserId,
      endzustand_gesetzt_am: now,
      endzustand_grund: grund,
    })
    .eq('id', claimId)
    .not('status', 'in', `(${CLAIM_TERMINAL_STATUSES.map((s) => `"${s}"`).join(',')})`)
  if (claimErr) {
    console.error('[AAR-939] claim terminal close failed:', claimErr.message)
  }

  return { ok: true }
}
