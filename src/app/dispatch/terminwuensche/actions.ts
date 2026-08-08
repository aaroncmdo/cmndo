'use server'

// kunde-termin-funnel T3 (Task 10): Queue-Aktionen fuer die Dispatch-Terminwunsch-
// Warteschlange (dispatch_pending/sv_gesucht). Zuweisen nutzt die bestehende
// Dead-Pin-Reassign-Engine (reassigniereDeadPin, state-transitions.ts) — race-sicher
// ueber die Exclusion-Constraint (gutachter_termine_no_assignee_overlap) statt eines
// eigenen Update-Statements. Claim-verankerte Terminwuensche ziehen zusaetzlich den
// bestehenden sv-zuweisung-Nachlauf (setSvIdForFall + transitionFallStatus) nach —
// GENAU wie /api/sv-zuweisung — non-fatal (der Fall kann bereits weiter sein).
// Stornieren ist ein direkter gegateter Update: sageAb (state-transitions.ts) deckt
// dispatch_pending/sv_gesucht nicht ab (dessen AKTIV-Liste ist nur bestaetigt/
// reserviert/verlegt/verlegung_pending), daher hier der eigene, gegatete Pfad mit
// Row-Check (DSGVO-Storno-Lektion #4625: RLS-/Race-Writes koennen 0 Zeilen treffen
// und ohne .select()-Check still "erfolgreich" wirken).
//
// KEIN neuer Kunde-Versand (WA/Email) hier — die Outbox (Fundament C3) ist die
// parallele Lane fuer Kunde-Comms, T1 zeigt den bestaetigten Termin bereits in der
// Akte. Einzige neue Notification ist eine In-App-Mitteilung an den SV.

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { reassigniereDeadPin, weiseSvGesuchtZu } from '@/lib/termine/engine/state-transitions'
import { setSvIdForFall } from '@/lib/faelle/sv-assignment'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { createGutachterMitteilung } from '@/lib/mitteilungen'
import { formatBerlin } from '@/lib/google-calendar/timezone'

/**
 * Weist einen Terminwunsch einem echten SV zu — BEIDE Pending-Achsen (T4):
 * `dispatch_pending` (Embed-Dead-Pin, assignee sv_lead) → `reassigniereDeadPin`;
 * `sv_gesucht` (Portal-Wunschtermin, kein Assignee) → `weiseSvGesuchtZu`. Beide flippen
 * race-sicher auf `bestaetigt`+`assignee 'sachverstaendiger'`; der Claim-Nachlauf
 * (setSvIdForFall + transitionFallStatus + SV-Mitteilung) ist danach identisch.
 */
export async function weiseTerminwunschZu(
  terminId: string,
  svId: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['dispatch', 'admin'])
  if (!guard.success) return { ok: false, error: guard.error }

  const admin = createAdminClient()

  const { data: termin, error: ladeErr } = await admin
    .from('gutachter_termine')
    .select('id, status, bezug_typ, bezug_id, start_zeit')
    .eq('id', terminId)
    .maybeSingle()
  if (ladeErr) return { ok: false, error: ladeErr.message }
  if (!termin) return { ok: false, error: 'Terminwunsch nicht gefunden' }

  // Status-verzweigte Engine-Primitive (beide race-sicher via gutachter_termine_no_assignee_overlap).
  const result =
    termin.status === 'sv_gesucht'
      ? await weiseSvGesuchtZu(terminId, { partnerId: svId, db: admin })
      : await reassigniereDeadPin(terminId, { partnerId: svId, db: admin })
  if (!result.ok) return { ok: false, error: result.error }

  // Claim-verankerte Terminwuensche: bestehenden sv-zuweisung-Nachlauf ziehen.
  // fallId === bezug_id bei bezug_typ 'fall'/'claim' (Spec §4.1 — fall≡claim, IDs
  // identisch). Lead-verankerte Wuensche (bezug_typ='lead') bekommen ihre
  // Fall-Umhaengung erst spaeter bei der Konversion — hier ist nur der Termin-Flip
  // noetig, kein Claim existiert noch.
  const bezugTyp = termin.bezug_typ
  const bezugId = termin.bezug_id
  const istClaimAnker = (bezugTyp === 'fall' || bezugTyp === 'claim') && !!bezugId

  if (istClaimAnker && bezugId) {
    try {
      await setSvIdForFall(admin, bezugId, svId)
    } catch (err) {
      console.error(
        '[weiseTerminwunschZu] setSvIdForFall fehlgeschlagen (non-fatal):',
        err instanceof Error ? err.message : err,
      )
    }
    try {
      await transitionFallStatus(bezugId, 'sv-termin', {
        user_id: guard.user.id,
        grund: 'terminwunsch_zuweisung',
      })
    } catch (err) {
      // Non-fatal: der Fall kann bereits weiter sein (z.B. schon 'besichtigung') —
      // der Rueckwaerts-Uebergang waere ungueltig, die Termin-Zuweisung bleibt
      // trotzdem gueltig (spiegelt den gleichen Non-Fatal-Umgang in sv-zuweisung/route.ts).
      console.warn(
        '[weiseTerminwunschZu] transitionFallStatus(sv-termin) abgelehnt (non-fatal):',
        err instanceof Error ? err.message : err,
      )
    }
  }

  // In-App-Mitteilung an den SV (bestehender Typ 'termin_bestaetigt' passt exakt).
  // Minimal befuellt (datum/uhrzeit aus dem bereits geladenen Termin) — kein
  // zusaetzlicher Read fuer Kunde-Name/Adresse/Aktenzeichen; reichere Inhalte
  // sind Sache der Outbox-Lane (C3/Task 11).
  try {
    await createGutachterMitteilung(svId, 'termin_bestaetigt', istClaimAnker ? bezugId : null, {
      datum: formatBerlin(termin.start_zeit, { day: '2-digit', month: '2-digit' }),
      uhrzeit: formatBerlin(termin.start_zeit, { hour: '2-digit', minute: '2-digit' }),
    })
  } catch (err) {
    console.error(
      '[weiseTerminwunschZu] createGutachterMitteilung fehlgeschlagen (non-fatal):',
      err instanceof Error ? err.message : err,
    )
  }

  revalidatePath('/dispatch/terminwuensche')
  // Claim-Anker: claims.sv_id + operative_status haben sich geaendert — die
  // Fallakte zeigt beides direkt (SV-Zuweisung + Status). transitionFallStatus
  // revalidiert selbst NICHT (reiner DB-Transition-Helper, auch aus Cron-
  // Kontexten aufrufbar) — das ist Caller-Pflicht (AGENTS.md revalidatePath-Regel).
  if (istClaimAnker && bezugId) {
    revalidatePath(`/faelle/${bezugId}`)
  }
  return { ok: true }
}

/**
 * Storniert einen offenen Terminwunsch (dispatch_pending ODER sv_gesucht). Direkter
 * gegateter Update statt Engine-Pfad (sageAb deckt diese beiden Quell-Status nicht
 * ab). `grund` ist optional befuellt in `ablehnungsgrund` — dieselbe Spalte, die
 * die Engine (sageAb/entscheideVerlegung) bereits fuer Absage-/Storno-Gruende
 * einer gutachter_termine-Zeile nutzt (kein neues Feld noetig). Die aktuelle UI
 * uebergibt keinen grund (confirm()-Bestaetigung reicht) — der Parameter steht
 * bereit fuer einen spaeteren Grund-Dialog (Task 11+) ohne Signaturaenderung.
 */
export async function storniereTerminwunsch(
  terminId: string,
  grund?: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['dispatch', 'admin'])
  if (!guard.success) return { ok: false, error: guard.error }

  const admin = createAdminClient()
  const patch: Record<string, unknown> = {
    status: 'storniert',
    cancelled_at: new Date().toISOString(),
  }
  if (grund) patch.ablehnungsgrund = grund

  // Row-Check ist Pflicht (nicht nur `error`): ein .in()-gegateter Update, der
  // 0 Zeilen trifft (bereits zugewiesen/storniert), liefert KEINEN PostgREST-
  // Error zurueck — ohne .select()-Laengencheck waere das ein stiller Erfolg.
  const { data, error } = await admin
    .from('gutachter_termine')
    .update(patch)
    .eq('id', terminId)
    .in('status', ['dispatch_pending', 'sv_gesucht'])
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, error: 'Terminwunsch ist nicht mehr offen (bereits bearbeitet)' }
  }

  revalidatePath('/dispatch/terminwuensche')
  return { ok: true }
}
