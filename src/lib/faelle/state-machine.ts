import { createAdminClient } from '@/lib/supabase/admin'
import { emitEvent } from '@/lib/notifications/emit'
import { peelAuftraegeColumns, splitOrKeepFaelleUpdate } from '@/lib/faelle/claim-duplicate-columns'
import { upsertClaimPayment, type ClaimPaymentFields } from '@/lib/faelle/claim-payments'
import { peelKanzleiFaelleColumns, upsertKanzleiFall } from '@/lib/kanzlei-fall/upsert-kanzlei-fall'
import { resolveCursorOperativeStatus } from '@/lib/faelle/fall-status-claim-mapping'
import { CLOSED_OPERATIVE_STATUS } from '@/lib/claims/terminal-status'

/**
 * KFZ-202: Zentrale State-Machine fuer den operativen Status (claims.operative_status, SSoT).
 * AAR-939: claim-native — liest/schreibt KEIN faelle mehr (Cursor + Validierung via
 * faelle_claim_bridge-Anker auf claims.operative_status). D2-Gate (claim-first ohne faelle-Row).
 * Validiert alle Uebergaenge, setzt Timestamps, schreibt Timeline.
 *
 * AAR-501 N6: Jeder Übergang emittet das entsprechende Notification-Event
 * (fall.status_changed / fall.storniert / kanzlei.uebergabe / regulierung.ergebnis),
 * damit alle Caller automatisch den Event-Bus benutzen. Fehler im Emit werden
 * geloggt — der Status-Übergang bleibt atomar.
 */

export const FALL_STATUS_TRANSITIONS: Record<string, string[]> = {
  // Selbstzahler-Reparatur-Track (Reduced-Repair): ein Selbstzahler-Claim (abrechnungsweg=
  // 'selbstzahler', kein SV/Gutachten/Kanzlei) verzweigt aus der Erfassung NICHT in die
  // SV-/Begutachtungs-Achse, sondern in die Werkstatt-Reparatur-Achse. v_claim_phase branched
  // auf abrechnungsweg und mappt diese operative_status-Werte auf die reduzierte main_phase
  // 'reparatur'. Der Cursor wird beim Werkstatt-Picker / reparatur_termine-Lifecycle gesetzt.
  'ersterfassung': ['sv-gesucht', 'sv-zugewiesen', 'sv-termin', 'reparatur-werkstatt-suche', 'reparatur-angefragt', 'storniert'],
  'onboarding': ['ersterfassung', 'reparatur-werkstatt-suche', 'storniert'],
  // Selbstzahler-Reparatur-Achse (parallel zur SV-/Regulierungs-Achse; endet in abgeschlossen):
  'reparatur-werkstatt-suche': ['reparatur-angefragt', 'storniert'],
  'reparatur-angefragt': ['reparatur-laeuft', 'reparatur-erledigt', 'storniert'],
  'reparatur-laeuft': ['reparatur-erledigt', 'storniert'],
  'reparatur-erledigt': ['abgeschlossen', 'storniert'],
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
  // Status-Achsen-Konsolidierung B4-slice-1b: die zwei NICHT-terminalen Endzustand-Outcomes
  // (endzustand-actions: markClaimAsInKommunikationVs / markClaimAsAbgelehnt(final=false))
  // schreiben ab jetzt operative_status DIREKT — sie sind damit CURSOR-Werte und brauchen
  // eigene Ausgaenge. Ohne sie waere der Claim ein Dead-End: transitionFallStatus WIRFT bei
  // unbekanntem Key (:120) und der LexDrive-fall_geschlossen-Guard (process-event.ts:725,
  // via istGueltigerFallUebergang) lehnte JEDEN Abschluss ab — und zwar genau im Normalfall
  // "KB setzt VS-Kommunikation -> LexDrive schliesst den Fall".
  //
  // Die Mengen sind behavior-preserving: sie sind die Vereinigung der Ausgaenge der Cursor-
  // Werte, die diese Outcomes semantisch ERSETZEN (mapFallStatusToClaimStatus: regulierung +
  // regulierung-laeuft -> in_kommunikation_vs; vs-abgelehnt -> abgelehnt). Ein Claim kann nach
  // dem Flip also nichts weniger als vorher. 'abgelehnt' ist bewusst nicht terminal
  // (nachforderbar/eskalierbar) -> behaelt Zahlung/Klage/Nachbesichtigung/Abschluss.
  'in_kommunikation_vs': ['zahlung-eingegangen', 'nachbesichtigung-laeuft', 'vs-abgelehnt', 'vs-kuerzt', 'klage', 'abgeschlossen', 'storniert'],
  'abgelehnt': ['zahlung-eingegangen', 'nachbesichtigung-laeuft', 'vs-kuerzt', 'klage', 'abgeschlossen', 'storniert'],
  'vs-kuerzt': ['nachbesichtigung-laeuft', 'regulierung-laeuft', 'vs-abgelehnt', 'klage', 'storniert'],
  'nachbesichtigung-laeuft': ['regulierung-laeuft', 'vs-abgelehnt', 'klage', 'storniert'],
  'vs-abgelehnt': ['klage', 'storniert'],
  'klage': ['abgeschlossen', 'storniert'],
  // B4-slice-2a-i: seit der Klage-Terminal-Konvergenz traegt der Cursor 'klage_rechtsstreit'
  // (statt des groben 'klage') — er ist damit ein CURSOR-Wert und braucht dieselben Ausgaenge
  // wie 'klage' (sonst Dead-End: transitionFallStatus wirft bei unbekanntem Cursor, vgl.
  // slice-1b in_kommunikation_vs). 'klage' bleibt als Ziel/Key erhalten (Alt-Daten, Robustheit).
  'klage_rechtsstreit': ['abgeschlossen', 'storniert'],
  'zahlung-eingegangen': ['abgeschlossen'],
  'abgeschlossen': [],
  'storniert': [],
}

/**
 * Pure Vorab-Check: ist der Uebergang from->to laut FALL_STATUS_TRANSITIONS gueltig?
 * Fuer Pre-Checks (z.B. den fall_geschlossen-All-or-Nothing-Guard in process-event.ts),
 * ohne die volle transitionFallStatus-DB-Logik auszufuehren. from=null/unbekannt -> false.
 */
export function istGueltigerFallUebergang(
  from: string | null | undefined,
  to: string,
): boolean {
  if (!from) return false
  return (FALL_STATUS_TRANSITIONS[from] ?? []).includes(to)
}

/**
 * C1-Funnel: Terminal-Close-Ziele, die — wie 'storniert' — aus JEDEM aktiven Zustand
 * erreichbar sind (Nicht-Matrix-Terminals). Sie funneln die frueheren Direkt-Writer
 * (kanzlei-wunsch/versendeKanzleiPaket + close-nur-gutachter-termin), die keine
 * Source-State-Guard hatten — Verhaltens-erhaltend: kein aktiver Claim wird abgelehnt.
 * Beide sind bereits in CLOSED_OPERATIVE_STATUS + CLAIMS_TERMINAL_STATES (Clobber-Guard).
 */
export const BROADLY_REACHABLE_TERMINALS: ReadonlySet<string> = new Set([
  'an_externe_kanzlei_uebergeben',
  'termin_durchgefuehrt',
])

/** Terminal-Close aus `current` erlaubt? True wenn Cursor gesetzt + noch nicht geschlossen. */
export function istTerminalUebergangErlaubt(current: string | null): boolean {
  return !!current && !CLOSED_OPERATIVE_STATUS.has(current)
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

  // AAR-939: claim-native — Cursor + Validierung kommen aus claims.operative_status (SSoT)
  // ueber den faelle_claim_bridge-Anker. KEIN faelle-Read mehr (D2-Gate: claim-first-Faelle
  // haben keine faelle-Row; die Bridge ist der fall_id->claim_id-Lookup fuer ALLE Faelle —
  // verifiziert 0 faelle ohne Bridge-Row).
  const { data: bridge, error: fetchErr } = await db
    .from('faelle_claim_bridge')
    // T3-S4: claims.status raus — der Terminal-Clobber-Guard laeuft jetzt auf operative_status
    // (resolveCursorOperativeStatus), claims.status wird nicht mehr geschrieben.
    .select('claim_id, claims:claims!fk_bridge_claim(operative_status)')
    .eq('fall_id', fallId)
    .maybeSingle()

  if (fetchErr || !bridge) throw new Error(`Fall ${fallId} nicht gefunden`)

  const claimId = (bridge as { claim_id?: string | null }).claim_id ?? null

  const claimRel = (bridge as {
    claims?:
      | { operative_status?: string | null }
      | { operative_status?: string | null }[]
      | null
  }).claims
  const claimRow = (Array.isArray(claimRel) ? claimRel[0] : claimRel) ?? null
  // AAR-939: Transition-Cursor = claims.operative_status (vollstaendiger SSoT seit #2884:
  // alle Creator setzen ihn bei Anlage + Backfill). KEIN faelle.status-Fallback mehr —
  // entkoppelt die Engine von faelle (D2-Gate). NULL = Cursor nicht lesbar -> harter Bruch.
  const currentStatus = claimRow?.operative_status as string | null
  if (!currentStatus) {
    throw new Error(
      `Fall ${fallId} (claim ${claimId ?? 'null'}): operative_status fehlt, Cursor nicht lesbar`,
    )
  }

  // Validate transition. BROADLY_REACHABLE_TERMINALS (an_externe_kanzlei_uebergeben /
  // termin_durchgefuehrt) sind — wie storniert — aus jedem aktiven Zustand erreichbar
  // (Funnel der frueheren Direkt-Writer ohne Source-Guard).
  const allowed = FALL_STATUS_TRANSITIONS[currentStatus]
  const istBreitTerminal =
    BROADLY_REACHABLE_TERMINALS.has(newStatus) && istTerminalUebergangErlaubt(currentStatus)
  if (!istBreitTerminal && (!allowed || !allowed.includes(newStatus))) {
    throw new Error(
      `Ungueltiger Status-Uebergang: ${currentStatus} → ${newStatus}. Erlaubt: ${allowed?.join(', ') ?? 'keine'}`,
    )
  }

  const now = new Date().toISOString()
  // CMM-74 b'' A3: faelle.status-Write GESTOPPT (der Engine war der letzte Writer).
  // Der Operativ-Cursor lebt jetzt auf claims.operative_status (A1-Senke, s.u.); alle
  // Code-Reader + die 3 faelle.status-exponierenden Views sind darauf repointet (A2).
  // status_changed_at (claims-routed), claims.status (b'-Mapping) + operative_status
  // bleiben. faelle.status friert ab hier ein -> entkoppelt die Engine von faelle (Drop-Runway).
  const update: Record<string, unknown> = {
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
    // Reparatur-Funnel (17.07.): ein Abschluss-Grund (z.B. 'reparatur_erledigt' beim
    // Werkstatt-Close via closeReparaturClaimViaEngine) wird — analog zu 'klage' — auf
    // geschlossen_grund persistiert. Andere abgeschlossen-Caller (Cron fall-abschluss)
    // uebergeben keinen grund -> Verhalten unveraendert.
    if (metadata?.grund) update.geschlossen_grund = metadata.grund
  }
  // C1-Funnel: die 2 breit-erreichbaren Terminal-Closes setzen den Close-Marker
  // abgeschlossen_am (routet via CLAIM_OWNED_DUPLICATE_COLUMNS auf claims — wie 'abgeschlossen').
  // Die endzustand_*-Audit-Felder (nur close-nur-gutachter) setzt der Caller separat: sie sind
  // claims-only, NICHT im faelle-Split-Set -> wuerden hier im ungeschriebenen faelleUpdate landen.
  if (newStatus === 'an_externe_kanzlei_uebergeben' || newStatus === 'termin_durchgefuehrt') {
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

  // CMM-44 SP-I2 PR2: anschlussschreiben_am lebt jetzt auf kanzlei_faelle (1:1).
  // ZUERST peelen (vor SP-H-Peel), damit es nicht in faelle/claims landet.
  // Write via upsertKanzleiFall nach den faelle/claims/auftraege-Writes (s.u.).
  // claimId kommt aus dem bridge-Anker oben (AAR-939, kein faelle-Read mehr).
  const { rest: spi2Rest, kfUpdate } = peelKanzleiFaelleColumns(update)

  // CMM-44 SP-H PR2: storniert_am/storno_grund sind auf die auftraege-Sub-Tabelle
  // gewandert (1:N pro Claim — aktueller Auftrag). ZUERST peelen, damit sie nicht
  // im faelle- oder claims-Update landen; danach separat auf den aktuellen Auftrag
  // schreiben (s.u. nach dem faelle/claims-Write).
  const { rest, auftraegeUpdate } = peelAuftraegeColumns(spi2Rest)

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

  // T3-S4: claims.status-Write RETIRED (das fruehere mapFallStatusToClaimStatus-Dual-Write ist
  // weg — operative_status ist die einzige Achse). resolveCursorOperativeStatus traegt weiterhin
  // die Klage-Feinterminal-Konvergenz (klage -> 'klage_rechtsstreit') + den Terminal-Clobber-
  // Guard (abgeschlossen ueberschreibt einen bestehenden feinen Terminal wie klage_rechtsstreit/
  // storniert NICHT — frueher lief dieser Guard ueber claims.status, jetzt ueber den gelesenen
  // operative-Cursor). Nur bei verknuepftem Claim — Legacy-Faelle ohne claim_id unveraendert.
  if (claimId) {
    claimsUpdate.operative_status = resolveCursorOperativeStatus(newStatus, currentStatus)
  }

  // AAR-939: KEIN faelle-Write mehr. Nach peelKanzlei + peelAuftraege + split bleibt in
  // faelleUpdate nur noch { updated_at } (alle Status-Felder routen bereits nach
  // kanzlei_faelle [regulierung_*/vs_reaktion_*/vs_kuerzung_grund/anschlussschreiben_am],
  // auftraege [storniert_*] bzw. claims [status_changed_at/abgeschlossen_am/
  // kanzlei_uebergeben_am/geschlossen_grund + vs_ablehnungs_grund]). Der faelle.updated_at-
  // Bump entfaellt ersatzlos (redundant: claims.updated_at hier + claim_recency unten).
  if (claimId && Object.keys(claimsUpdate).length > 0) {
    claimsUpdate.updated_at = now
    const { error: claimUpdateErr } = await db
      .from('claims')
      .update(claimsUpdate)
      .eq('id', claimId)
    if (claimUpdateErr) throw new Error(claimUpdateErr.message)
  }

  // CMM-66: Recency-Bump auf claim_recency (leak-freie SSoT) — ein Status-Uebergang
  // ist echte Aktivitaet und feuert so die claim_recency-Realtime-Subscription
  // (FallRealtimeRefresh/SvFallakteView, u.a. der SV-Live-Refresh-Leg). Der claims-
  // Write oben bumpt zwar claims.updated_at (claims-Leg fuer Kunde/Admin), aber der
  // SV liest claims nicht -> dieser Bump deckt ihn ab. Non-critical (kein throw).
  if (claimId) {
    const { error: recencyErr } = await db.rpc('touch_claim_recency', { p_claim_id: claimId })
    if (recencyErr)
      console.error('[CMM-66] touch_claim_recency (transition) fehlgeschlagen:', recencyErr.message)
  }

  // CMM-44 SP-J Bucket A: Zahlungseingang -> claim_payments (1:N, aktuelle Row
  // create-or-update). status='erhalten' weil ein bestaetigter Eingang. Claim-
  // lose Legacy-Faelle (kein claim_id) koennen keine claim_payments-Row haben;
  // die zahlung_*-Daten werden dort nicht erfasst (pre-launch 0-cov, faelle-
  // Spalte stirbt in Phase 6).
  if (newStatus === 'zahlung-eingegangen' && claimId) {
    // Payment-Ledger Phase 1: VS-Zahlungseingang -> partei='vs'-Ledger-Zeile (Seam).
    const cpFields: ClaimPaymentFields = { zahlungseingang_am: now, status: 'erhalten' }
    if (metadata?.betrag != null) cpFields.erhaltener_betrag = metadata.betrag
    const cpResult = await upsertClaimPayment(db, claimId, 'vs', cpFields, metadata?.user_id ?? null)
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

  // CMM-44 SP-I2 PR2: kanzlei_faelle-Spalten (z.B. anschlussschreiben_am) nach
  // den faelle/claims/auftraege-Writes schreiben. Nicht-fatal (warn + skip).
  if (Object.keys(kfUpdate).length > 0) {
    const kfRes = await upsertKanzleiFall(db, claimId, kfUpdate)
    if (!kfRes.ok) console.warn(`[CMM-44 SP-I2] state-machine kanzlei_faelle upsert skip: ${kfRes.error}`)
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
  // C1a (Fundament): claim_id ergänzt (Event-Log claim-nativ — phase_transitions.claim_id ist die
  // getrackte Spalte, uuid nullable) + await statt fire-and-forget: der Insert wird abgewartet, der
  // Fehler bleibt aber non-critical (Log-Verlust wird geloggt, bricht den Übergang NICHT).
  try {
    const { error: ptErr } = await db.from('phase_transitions').insert({
      fall_id: fallId,
      claim_id: claimId ?? null,
      from_phase: currentStatus,
      to_phase: newStatus,
      trigger_type: 'auto',
      transitioned_by: metadata?.user_id ?? null,
      actor_rolle: null,
      grund: metadata?.grund ?? null,
      payload: { via: 'transitionFallStatus', metadata: metadata ?? null },
    })
    if (ptErr) console.error('[AAR-586] phase_transitions insert failed (non-critical):', ptErr.message)
  } catch (err) {
    console.error('[C1a] phase_transitions insert threw (non-critical):', err instanceof Error ? err.message : err)
  }

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
    // Filmcheck-Audit 29.06.2026: QC-SLA — Uhr startet am filmcheck-Eintritt, stoppt
    // am Kanzlei-Handoff. checkAndEscalateBreaches (Cron) erzeugt bei Breach generisch
    // einen kritischen Eskalations-Task -> stuck-in-filmcheck wird endlich sichtbar.
    if (newStatus === 'filmcheck') {
      await startSla(fallId, 'qc_filmcheck')
    }
    if (newStatus === 'kanzlei-uebergeben') {
      await completeSla(fallId, 'qc_filmcheck')
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
        .from('faelle_claim_bridge')
        .select('claim_id, claims:claims!fk_bridge_claim(hat_mietwagen, hat_nutzungsausfall)')
        .eq('fall_id', fallId)
        .maybeSingle()
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
          const { error: mietwagenTaskFehler } = await db.from('tasks').insert({
            fall_id: fallId,
            typ: 'kb',
            task_code: 'mietwagen-klaeren',
            titel: 'Nutzungsausfall/Mietwagen klären',
            beschreibung:
              'Fahrzeug fahrbereit? Wenn nein: Kanzlei informieren für Versicherungsanfrage Mietwagen. Reparaturnachweis einfordern sobald Reparatur abgeschlossen.',
            status: 'offen',
            // tasks_prioritaet_check: 'hoch' existiert nicht (normal|dringend|kritisch) -> dringend.
            // Vorher scheiterte der mietwagen-klaeren-Task-Insert still (Prod-Log 16.07.).
            prioritaet: 'dringend',
            empfaenger_rolle: 'kundenbetreuer',
            empfaenger_user_id: kundenbetreuerId,
            zugewiesen_an: kundenbetreuerId,
            auto_erstellt: true,
            trigger_event: `status:${newStatus}`,
            phase: 'besichtigung',
          })
          // Die Status-Transition darf an einer Zusatz-Aufgabe NICHT scheitern — aber der
          // Fehlschlag muss sichtbar sein. Genau hier ist es am 16.07. schon einmal still
          // passiert (siehe prioritaet-Kommentar oben): der Task fehlte, niemand erfuhr es.
          if (mietwagenTaskFehler) {
            console.error(
              `[state-machine] mietwagen-klaeren-Task fuer ${fallId} nicht angelegt:`,
              mietwagenTaskFehler.message,
            )
          }
        }
      }
    } catch (err) {
      console.error('[AAR-313] Mietwagen/Nutzungsausfall Auto-Task fehlgeschlagen:', err)
    }
  }
}
