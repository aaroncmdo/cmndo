// Kunden-Storno eines Termins — die Fachlogik, unabhaengig vom Auth-Weg.
//
// Zwei Aufrufer mit UNTERSCHIEDLICHER Autorisierung, aber identischer Wirkung:
//   1. /api/kunde/termin/absagen   — eingeloggter Kunde (Session + Owner-Guard)
//   2. /api/v1/termin-stornieren   — FlowLink-Token (KI-Assistent/MCP, kein Login)
//
// Der Auth-Teil bleibt bewusst beim jeweiligen Aufrufer: Session-Guard und Token-Aufloesung
// sind verschiedene Fragen. Was hier liegt, ist die Antwort auf "was passiert dann" —
// und die MUSS identisch sein, egal ob der Kunde im Portal klickt oder es seinem
// Assistenten sagt. Sonst driften die beiden Wege auseinander, und der seltener genutzte
// verliert still Nebenwirkungen (Task, Timeline, Kalender-Eintrag).
//
// ⚠ `erstelltVonId` ist bewusst nullable: der Token-Weg hat keinen eingeloggten User.
// `tasks.erstellt_von_id` und `timeline.erstellt_von` sind beide nullable (DB-verifiziert).

import type { SupabaseClient } from '@supabase/supabase-js'
import { entferneKbTerminOut } from '@/lib/termine/kb-termin-sync'

/** Woher kam der Storno — landet im Task-Text, damit Dispatch die Quelle sieht. */
export type StornoQuelle = 'portal' | 'assistent'

export type StornoErgebnis =
  | { ok: true; fallId: string; startZeit: string | null; bereitsStorniert: boolean }
  | { ok: false; error: string; code: 'nicht_gefunden' | 'kein_bezug' | 'db_fehler' }

/** Status, die einen Termin als bereits beendet ausweisen — erneutes Stornieren ist ein No-op. */
const BEREITS_BEENDET = ['abgesagt', 'storniert', 'abgelehnt', 'abgeschlossen']

/**
 * Setzt den Termin auf `abgesagt`, benachrichtigt das Team per Task und schreibt die Timeline.
 *
 * Idempotent: ein bereits beendeter Termin liefert `ok: true` mit `bereitsStorniert: true`,
 * ohne erneut zu schreiben. Ein Assistent, der auf eine unklare Antwort hin ein zweites Mal
 * storniert, soll keinen zweiten Dispatch-Task ausloesen.
 */
export async function storniereTerminAlsKunde(
  admin: SupabaseClient,
  opts: {
    terminId: string
    grund?: string | null
    quelle: StornoQuelle
    erstelltVonId?: string | null
    kundenbetreuerId?: string | null
    claimNummer?: string | null
  },
): Promise<StornoErgebnis> {
  const { data: termin, error: leseFehler } = await admin
    .from('gutachter_termine')
    .select('id, fall_id, typ, status, start_zeit, bezug_typ, bezug_id')
    .eq('id', opts.terminId)
    .maybeSingle()
  if (leseFehler) return { ok: false, error: leseFehler.message, code: 'db_fehler' }
  if (!termin) return { ok: false, error: 'Termin nicht gefunden.', code: 'nicht_gefunden' }

  // Bezug-aware wie die Portal-Route: bezug-native Termine haben fall_id = NULL.
  const fallId =
    (termin.fall_id as string | null) ??
    (termin.bezug_typ === 'fall' ? (termin.bezug_id as string | null) : null)
  if (!fallId) return { ok: false, error: 'Termin ohne Fallbezug.', code: 'kein_bezug' }

  const startZeit = (termin.start_zeit as string | null) ?? null

  if (BEREITS_BEENDET.includes(termin.status as string)) {
    return { ok: true, fallId, startZeit, bereitsStorniert: true }
  }

  const grund = opts.grund ? String(opts.grund).slice(0, 500) : null

  const { error: updErr } = await admin
    .from('gutachter_termine')
    .update({
      status: 'abgesagt',
      cancelled_at: new Date().toISOString(),
      notiz_kunde: grund,
    })
    .eq('id', termin.id)
  if (updErr) return { ok: false, error: `Termin-Update fehlgeschlagen: ${updErr.message}`, code: 'db_fehler' }

  // SP2c: abgesagtes KB-Beratungs-Event aus Google + CalDAV entfernen. Fail-soft.
  if (termin.typ === 'kb_beratung') await entferneKbTerminOut(termin.id as string)

  const empfaengerRolle = termin.typ === 'kb_beratung' ? 'kundenbetreuer' : 'dispatch'
  const fallNr = opts.claimNummer ?? fallId.slice(0, 8)
  const wer = opts.quelle === 'assistent' ? 'Kunde (via KI-Assistent)' : 'Kunde'
  const titel =
    termin.typ === 'kb_beratung'
      ? `${wer} hat Beratungstermin abgesagt (${fallNr})`
      : `${wer} hat Besichtigungstermin abgesagt (${fallNr})`
  const beschreibung = [
    grund ? `Grund: ${grund}` : 'Kein Grund angegeben.',
    startZeit
      ? `War geplant: ${new Date(startZeit).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`
      : null,
    opts.quelle === 'assistent'
      ? 'Abgesagt ueber die oeffentliche API (FlowLink-Token) — kein Portal-Login.'
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  // Ueber diesen Task erfaehrt das Team von der Absage — ein stiller Fehlschlag hier
  // heisst: der Termin ist weg und niemand weiss es. Deshalb geprueft und geloggt.
  const { error: taskFehler } = await admin.from('tasks').insert({
    fall_id: fallId,
    titel,
    beschreibung,
    typ: 'termin_absage',
    status: 'offen',
    prioritaet: 'dringend',
    empfaenger_rolle: empfaengerRolle,
    empfaenger_user_id: empfaengerRolle === 'kundenbetreuer' ? (opts.kundenbetreuerId ?? null) : null,
    entity_type: 'termin',
    entity_id: termin.id,
    auto_erstellt: true,
    erstellt_von_id: opts.erstelltVonId ?? null,
  })
  if (taskFehler) {
    console.error(
      `[storno-kunde] Task NICHT erstellt (Fall ${fallId}) — Absage bleibt unbemerkt:`,
      taskFehler.message,
    )
  }

  const { error: timelineFehler } = await admin.from('timeline').insert({
    fall_id: fallId,
    typ: 'termin',
    titel: 'Kunde hat Termin abgesagt',
    beschreibung,
    erstellt_von: opts.erstelltVonId ?? null,
  })
  if (timelineFehler) console.error('[storno-kunde] Timeline-Insert fehlgeschlagen:', timelineFehler.message)

  return { ok: true, fallId, startZeit, bereitsStorniert: false }
}
