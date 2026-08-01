// CMM-32 / CMM-44 MP-3: Zentraler Claim-Resolver.
// Aggregiert die Sub-Entity-Lifecycles (Lead / Auftraege / Kanzleifall) + den
// terminalen claims.status zu einer Claim-Sicht mit Hauptphase + Subphase.
//
// Hauptphasen:
//   erfassung    — Lead aktiv (kein abgeschlossenes Erstgutachten + kein kanzlei_fall)
//   begutachtung — aktiver Auftrag (status != abgeschlossen) ODER Kanzlei-Uebergabe
//                  laeuft (kanzlei_fall existiert, aber lexdrive_case_id noch null —
//                  B-10-Interim "Kanzlei-Uebergabe laeuft", begutachtung-Tail)
//   regulierung  — kanzlei_fall in Regulierung, DATA-DRIVEN (Aaron 03.07.): KB-nativer
//                  VS-Kontakt (kf.vs_kontakt_am) / Auszahlung (kf.status='auszahlung' /
//                  ausgezahlt_am) ODER LexDrive-Uebernahme (lexdrive_case_id). Das alte
//                  B-10-lexdrive-Gate ist aufgehoben — unsere DB treibt die Phase (die
//                  LexDrive-API kommt spaeter). Nachbesichtigung/Stellungnahme als Side-Quest.
//   abschluss    — claims.status terminal (B-11/B-12 / MP-8: KB/Kanzlei-gesetzt, NICHT
//                  aus Auszahlung auto-abgeleitet). Substates erfolgreich_reguliert /
//                  storniert / klage_rechtsstreit / verjaehrt / abgelehnt_final /
//                  an_externe_kanzlei.
//
// CMM-44 MP-8: Regulierung wird zusaetzlich Status-getrieben betreten
// (in_kommunikation_vs / einfache abgelehnt), nicht nur ueber lexdrive_case_id.
// Prioritaet: abschluss > regulierung(lexdrive) > regulierung(status) >
// Kanzlei-Uebergabe-Interim > begutachtung > erfassung. MUSS bitgleich zur
// SQL-Spiegel-View v_claim_phase sein (Parity-Gate).

import type { AuftragRow } from '@/lib/auftrag/queries'
import type { KanzleiFallRow } from '@/lib/kanzlei-fall/queries'

export type ClaimMainPhase = 'erfassung' | 'begutachtung' | 'regulierung' | 'abschluss'

export type ClaimSubPhase =
  // Lead (erfassung)
  | 'sa_offen'
  | 'vollmacht_offen'
  | 'onboarding_offen'
  // Auftrag (begutachtung)
  | 'termin'
  | 'besichtigung'
  | 'gutachten'
  // CMM-74 b2 (v_claim_phase-Parity): operative Begutachtungs-Sub-States aus auftraege.erstgutachten
  | 'filmcheck'
  | 'qc-pruefung'
  // CMM-44 MP-3: Kanzlei-Uebergabe-Interim (begutachtung-Tail, kf da / lexdrive null, B-10)
  | 'kanzlei_uebergabe'
  // Regulierung
  | 'versicherungskontakt'
  | 'auszahlung'
  // CMM-44 MP-8: einfache VS-Ablehnung (nicht-terminal, nachforderbar)
  | 'nachforderung'
  // CMM-74 b2 (v_claim_phase-Parity): operative Regulierungs-Sub-States (kanzlei_faelle / nachbesichtigung)
  | 'vs-kuerzt'
  | 'anschlussschreiben'
  | 'nachbesichtigung-laeuft'
  // Abschluss (CMM-44 MP-3 / B-5/B-11 / MP-8: terminale claims.status-Substates)
  | 'erfolgreich_reguliert'
  | 'storniert'
  | 'klage_rechtsstreit'
  | 'verjaehrt'
  | 'abgelehnt_final'
  | 'an_externe_kanzlei'
  // AAR-939: nur_gutachter/embed-B Terminal — Termin durchgeführt (SV macht das
  // Gutachten off-platform → kein Upload/QC/Regulierungs-Tail)
  | 'termin_durchgefuehrt'
  // WS6 Slice 2a: Selbstzahler-/Kasko-Reparatur-Lane (ops-Cockpit-Sicht)
  | 'reparatur_werkstattwahl'
  | 'reparatur_terminfindung'
  | 'reparatur_laeuft'
  | 'reparatur_fertig'

export type ClaimLifecycle = {
  mainPhase: ClaimMainPhase
  subPhase: ClaimSubPhase
  /** Sichtbare Side-Quests (Nachbesichtigung/Stellungnahme waehrend Regulierung). */
  aktiveSideQuests: AuftragRow[]
  /** Aktiver Auftrag (fuer Anzeige der Termin/ETA-Details). */
  aktiverAuftrag: AuftragRow | null
  /** AAR-939: claims.service_typ — vom Loader (getClaimLifecycleForClaim)
   *  angehaengt, damit Stepper/Pipeline-Renderer die Regulierungs-Phase fuer
   *  nur_gutachter ausblenden (kein Kanzlei-/Regulierungs-Tail). Optional:
   *  nur Loader-Pfade setzen ihn, sonst undefined -> alle 4 Phasen sichtbar.
   *  Beeinflusst NICHT die mainPhase/subPhase-Ableitung (Parity zu v_claim_phase
   *  bleibt) — rein eine Render-Sichtbarkeits-Metadatum. */
  serviceTyp?: string | null
}

export type ClaimLifecycleInput = {
  /** Lead-Felder die den Erfassungs-Status beschreiben. */
  lead: {
    sa_unterschrieben: boolean | null
    vollmacht_signiert_am: string | null
    onboarding_complete: boolean | null
  } | null
  auftraege: AuftragRow[]
  kanzleiFall: KanzleiFallRow | null
  /** Unified Stepper: claims.operative_status — kanonische Phasen-Quelle (T3-S5: einzige Achse). */
  operativeStatus?: string | null
  /** WS6/Kasko-Fix: claims.abrechnungsweg. Direct-Reparatur-Wege (kasko/selbstzahler) haben
   *  KEINE SA/Vollmacht-Strecke — die Erfassungs-Sub kommt dann aus der Reparatur-Lane
   *  (reparaturSubphase) statt aus leadSubphase. Optional: nur Loader-Pfade setzen sie. */
  abrechnungsweg?: string | null
  /** claims.reparatur_werkstatt_id — Werkstatt gewaehlt => mind. reparatur_terminfindung. */
  reparaturWerkstattId?: string | null
  /** Juengster reparatur_termine.status (angefragt|bestaetigt|erledigt|…), wie v_claim_phase rt. */
  reparaturTerminStatus?: string | null
}

const MAIN_PHASE_INDEX: Record<ClaimMainPhase, number> = {
  erfassung: 0,
  begutachtung: 1,
  regulierung: 2,
  abschluss: 3,
}

export const MAIN_PHASE_LABEL: Record<ClaimMainPhase, string> = {
  erfassung: 'Erfassung',
  begutachtung: 'Begutachtung',
  regulierung: 'Regulierung',
  abschluss: 'Abschluss',
}

export const SUBPHASE_LABEL: Record<ClaimSubPhase, string> = {
  sa_offen: 'SA-Unterschrift offen',
  vollmacht_offen: 'Vollmacht offen',
  onboarding_offen: 'Onboarding offen',
  termin: 'Termin',
  besichtigung: 'Besichtigung',
  gutachten: 'Gutachten',
  filmcheck: 'Filmcheck',
  'qc-pruefung': 'QC-Prüfung',
  kanzlei_uebergabe: 'Kanzlei-Übergabe läuft',
  versicherungskontakt: 'Versicherungskontakt',
  auszahlung: 'Auszahlung',
  nachforderung: 'VS-Ablehnung — Nachforderung',
  'vs-kuerzt': 'VS-Kürzung',
  anschlussschreiben: 'Anschlussschreiben',
  'nachbesichtigung-laeuft': 'Nachbesichtigung läuft',
  erfolgreich_reguliert: 'Erfolgreich reguliert',
  storniert: 'Storniert',
  klage_rechtsstreit: 'Klage / Rechtsstreit',
  verjaehrt: 'Verjährt',
  abgelehnt_final: 'Abgelehnt (final)',
  an_externe_kanzlei: 'An externe Kanzlei übergeben',
  termin_durchgefuehrt: 'Termin durchgeführt',
  // WS6 Slice 2a: Reparatur-Lane
  reparatur_werkstattwahl: 'Werkstatt wählen',
  reparatur_terminfindung: 'Reparaturtermin wird vereinbart',
  reparatur_laeuft: 'Reparatur läuft',
  reparatur_fertig: 'Reparatur abgeschlossen — Abschluss ausstehend',
}

// B4-slice-2a-ii: ABSCHLUSS_SUBSTATE + REGULIERUNG_STATUS_SUBSTATE (die claims.status→Sub-Phase-
// Maps) sind ENTFERNT — die Phasen-Ableitung liest claims.status nicht mehr (weder terminal noch
// non-terminal). operative_status trägt jetzt JEDEN Terminal (endzustand B2 + state-machine-
// Konvergenz Klage + closeNurGutachter termin_durchgefuehrt) und die Non-Terminals (slice-1b) —
// OPERATIVE_PHASE unten ist die einzige Read-Quelle. claims.status = Read-tot (Drop/Derive = T3).

// Unified Stepper: operative_status (claims-Engine-Cursor) -> (main, sub). Kanonische
// Phasen-Quelle. Erfassung-Sub kommt aus Lead-Feldern, Abschluss-Sub aus claims.status,
// Begutachtung-Sub wird via Auftrag (filmcheck_ok/gutachten_url) verfeinert.
const OPERATIVE_PHASE: Record<string, { main: ClaimMainPhase; sub: ClaimSubPhase }> = {
  ersterfassung: { main: 'erfassung', sub: 'sa_offen' },
  onboarding: { main: 'erfassung', sub: 'onboarding_offen' },
  'sv-gesucht': { main: 'erfassung', sub: 'vollmacht_offen' },
  'sv-zugewiesen': { main: 'begutachtung', sub: 'termin' },
  'sv-termin': { main: 'begutachtung', sub: 'termin' },
  besichtigung: { main: 'begutachtung', sub: 'besichtigung' },
  'begutachtung-laeuft': { main: 'begutachtung', sub: 'gutachten' },
  'gutachten-eingegangen': { main: 'begutachtung', sub: 'gutachten' },
  filmcheck: { main: 'begutachtung', sub: 'filmcheck' },
  'qc-pruefung': { main: 'begutachtung', sub: 'qc-pruefung' },
  'kanzlei-uebergeben': { main: 'begutachtung', sub: 'kanzlei_uebergabe' },
  anschlussschreiben: { main: 'regulierung', sub: 'anschlussschreiben' },
  regulierung: { main: 'regulierung', sub: 'versicherungskontakt' },
  'regulierung-laeuft': { main: 'regulierung', sub: 'versicherungskontakt' },
  // B4-Slice-1: Non-Terminal-Outcomes (endzustand markClaimAsInKommunikationVs/Abgelehnt) auch
  // operative_status-nativ ableiten (bit-gleich zur v_claim_phase-o_sub-Ergaenzung). Damit bleibt
  // die Phase korrekt, wenn operative_status diese Werte traegt (write-flip) UND wenn status
  // spaeter derived/gedroppt wird (B4-slice-2) — nicht mehr auf den milestone(status)-Fallback angewiesen.
  in_kommunikation_vs: { main: 'regulierung', sub: 'versicherungskontakt' },
  abgelehnt: { main: 'regulierung', sub: 'nachforderung' },
  'vs-kuerzt': { main: 'regulierung', sub: 'vs-kuerzt' },
  'nachbesichtigung-laeuft': { main: 'regulierung', sub: 'nachbesichtigung-laeuft' },
  'vs-abgelehnt': { main: 'regulierung', sub: 'nachforderung' },
  klage: { main: 'regulierung', sub: 'nachforderung' },
  'zahlung-eingegangen': { main: 'regulierung', sub: 'auszahlung' },
  abgeschlossen: { main: 'abschluss', sub: 'erfolgreich_reguliert' },
  storniert: { main: 'abschluss', sub: 'storniert' },
  // B4-slice-2a-i-b: der nur_gutachter-Terminal traegt seit dieser Slice operative_status DIREKT
  // (closeNurGutachterTerminAlsDurchgefuehrt).
  termin_durchgefuehrt: { main: 'abschluss', sub: 'termin_durchgefuehrt' },
  // B4-slice-2a-ii: die FEINEN Terminals, die endzustand (B2) direkt in operative_status schreibt.
  // Seit dieser Slice ist OPERATIVE_PHASE die EINZIGE Read-Quelle fuer die Abschluss-Sub-Phase
  // (der fruehere claims.status-Read via ABSCHLUSS_SUBSTATE ist entfernt) -> claims.status Read-tot.
  reguliert_vollstaendig: { main: 'abschluss', sub: 'erfolgreich_reguliert' },
  klage_rechtsstreit: { main: 'abschluss', sub: 'klage_rechtsstreit' },
  verjaehrt: { main: 'abschluss', sub: 'verjaehrt' },
  abgelehnt_final: { main: 'abschluss', sub: 'abgelehnt_final' },
  an_externe_kanzlei_uebergeben: { main: 'abschluss', sub: 'an_externe_kanzlei' },
  // WS6/Kasko-Fix (17.07.): die 4 Reparatur-Cursor (CHECK + state-machine-Transitions +
  // v_claim_phase-Selbstzahler-CASE) waren hier NICHT gemappt -> opPhase=undefined ->
  // kompletter milestone-Fallback (dieselbe Luecken-Klasse wie der kasko-abrechnungsweg-Bug,
  // eine Ebene tiefer). main='erfassung' wie alle reparatur_-Subs (mainPhaseOf).
  'reparatur-werkstatt-suche': { main: 'erfassung', sub: 'reparatur_werkstattwahl' },
  'reparatur-angefragt': { main: 'erfassung', sub: 'reparatur_terminfindung' },
  'reparatur-laeuft': { main: 'erfassung', sub: 'reparatur_laeuft' },
  'reparatur-erledigt': { main: 'erfassung', sub: 'reparatur_fertig' },
}

/**
 * Bare operative_status -> Lifecycle-Phase (nur die Cursor-Ableitung, OHNE Sub-Entities).
 * Fuer Konsumenten, die NUR den operative_status haben (z.B. die public case-status-API) und
 * daher getClaimLifecycle (braucht lead/auftraege/kanzleiFall) nicht aufrufen koennen. Nutzt
 * DIESELBE OPERATIVE_PHASE-Map wie getClaimLifecycle -> keine Taxonomie-Duplikation, bleibt
 * bit-gleich zur Cursor-Phasen-Ableitung. null = unbekannter/nicht gemappter Status.
 */
export function phaseForOperativeStatus(
  operativeStatus: string | null | undefined,
): { main: ClaimMainPhase; sub: ClaimSubPhase } | null {
  if (!operativeStatus) return null
  return OPERATIVE_PHASE[operativeStatus] ?? null
}

function leadSubphase(lead: ClaimLifecycleInput['lead']): ClaimSubPhase {
  if (lead?.vollmacht_signiert_am) return 'onboarding_offen'
  if (lead?.sa_unterschrieben) return 'vollmacht_offen'
  return 'sa_offen'
}

// WS6/Kasko-Fix (17.07.): Direct-Reparatur-Wege — eigene Versicherung (kasko) oder Kunde
// (selbstzahler) zahlt die Reparatur. Kein Gegner-VS-Prozess, keine SA/Vollmacht by design →
// die leadSubphase-Kaskade zeigte dauerhaft irrefuehrend "SA-Unterschrift offen".
const DIRECT_REPARATUR_WEGE: ReadonlySet<string> = new Set(['kasko', 'selbstzahler'])

function istDirectReparatur(input: ClaimLifecycleInput): boolean {
  return !!input.abrechnungsweg && DIRECT_REPARATUR_WEGE.has(input.abrechnungsweg)
}

/** Reparatur-Lane-Leiter — spiegelt die rt-Kaskade des v_claim_phase-Selbstzahler-Zweigs
 *  (rt=erledigt → fertig; rt=bestaetigt → laeuft; rt=angefragt ODER Werkstatt gewaehlt →
 *  terminfindung; sonst Werkstattwahl). */
function reparaturSubphase(input: ClaimLifecycleInput): ClaimSubPhase {
  if (input.reparaturTerminStatus === 'erledigt') return 'reparatur_fertig'
  if (input.reparaturTerminStatus === 'bestaetigt') return 'reparatur_laeuft'
  if (input.reparaturTerminStatus === 'angefragt' || input.reparaturWerkstattId) return 'reparatur_terminfindung'
  return 'reparatur_werkstattwahl'
}

/** Erfassungs-Sub-Weiche: Direct-Reparatur → Reparatur-Lane, sonst SA/Vollmacht-Kaskade.
 *  An BEIDEN Kandidaten-Quellen (operative + milestone) — sonst kann die SA-Kaskade bei
 *  SUB_ORDER-Gleichstand (z.B. vollmacht_offen=1 vs reparatur_werkstattwahl=1) zurueckgewinnen. */
function erfassungsSubphase(input: ClaimLifecycleInput): ClaimSubPhase {
  return istDirectReparatur(input) ? reparaturSubphase(input) : leadSubphase(input.lead)
}

/** Innerhalb welcher Hauptphase lebt diese Subphase? */
export function mainPhaseOf(sub: ClaimSubPhase): ClaimMainPhase {
  if (sub === 'sa_offen' || sub === 'vollmacht_offen' || sub === 'onboarding_offen') return 'erfassung'
  if (sub === 'termin' || sub === 'besichtigung' || sub === 'gutachten' || sub === 'kanzlei_uebergabe' || sub === 'filmcheck' || sub === 'qc-pruefung') return 'begutachtung'
  if (sub === 'versicherungskontakt' || sub === 'auszahlung' || sub === 'nachforderung' || sub === 'vs-kuerzt' || sub === 'anschlussschreiben' || sub === 'nachbesichtigung-laeuft') return 'regulierung'
  // WS6 Slice 2a: Reparatur-Lane — alle Sub-Phasen leben in erfassung (SQL-konsistent:
  // operative_status=ersterfassung -> main_phase=erfassung, bis der Claim abgeschlossen wird).
  if (sub === 'reparatur_werkstattwahl' || sub === 'reparatur_terminfindung' || sub === 'reparatur_laeuft' || sub === 'reparatur_fertig') return 'erfassung'
  return 'abschluss'
}

// Unified Stepper — globale Sub-Phasen-Progress-Ordnung (monoton ueber die Hauptphasen:
// erfassung < begutachtung < regulierung < abschluss). "Furthest signal wins": die Phase mit
// dem hoechsten SUB_ORDER gewinnt. So liftet operative_status einen haengenden Milestone
// (sv-termin ohne Auftrag -> begutachtung) UND ein bereits gesetzter Milestone (kanzlei_fall)
// wird NIE von einem zurueckgebliebenen operative_status unter seinen Stand gedrueckt.
// Terminal-Subs = 15 (hoechste), claims.status-getrieben via Milestone-Kaskade.
const SUB_ORDER: Record<ClaimSubPhase, number> = {
  sa_offen: 0,
  vollmacht_offen: 1,
  onboarding_offen: 2,
  termin: 3,
  besichtigung: 4,
  gutachten: 5,
  filmcheck: 6,
  'qc-pruefung': 7,
  kanzlei_uebergabe: 8,
  anschlussschreiben: 9,
  versicherungskontakt: 10,
  'vs-kuerzt': 11,
  'nachbesichtigung-laeuft': 12,
  nachforderung: 13,
  auszahlung: 14,
  erfolgreich_reguliert: 15,
  storniert: 15,
  klage_rechtsstreit: 15,
  verjaehrt: 15,
  abgelehnt_final: 15,
  an_externe_kanzlei: 15,
  termin_durchgefuehrt: 15,
  // WS6 Slice 2a: Reparatur-Lane — eigene monotone Progression (1→4)
  reparatur_werkstattwahl: 1,
  reparatur_terminfindung: 2,
  reparatur_laeuft: 3,
  reparatur_fertig: 15,
}

// Milestone-Kaskade (CMM-44 MP-3/MP-8 / CMM-74 b2): Phase aus den Sub-Entity-Feldern
// (claims.status terminal > Nachbesichtigung > vs-kuerzt > Anschlussschreiben > lexdrive >
// Status-Regulierung > Kanzlei-Uebergabe-Interim > Erstgutachten > Lead). Bleibt als EIN
// Kandidat von getClaimLifecycle erhalten — bit-gleich zur SQL-View (Parity-Gate).
function milestoneLifecycle(input: ClaimLifecycleInput): ClaimLifecycle {
  // T3-S5: claimStatus ist aus dem Contract entfernt (claims.status gedroppt) — die Phase
  // kommt vollstaendig aus operativeStatus + Sub-Entities.
  const { lead, auftraege, kanzleiFall } = input

  const erstgutachten = auftraege.find((a) => a.typ === 'erstgutachten') ?? null
  const sideQuests = auftraege.filter(
    (a) => (a.typ === 'nachbesichtigung' || a.typ === 'stellungnahme') && a.status !== 'abgeschlossen',
  )

  // ── Abschluss ── B4-slice-2a-ii: der terminale claims.status-Read ist ENTFERNT. Die
  // Abschluss-Sub-Phase (erfolgreich_reguliert/klage_rechtsstreit/verjaehrt/abgelehnt_final/
  // an_externe_kanzlei/termin_durchgefuehrt/storniert) wird jetzt AUSSCHLIESSLICH aus
  // operative_status abgeleitet (OPERATIVE_PHASE, operativeLifecycle) — beide Terminal-Writer
  // (endzustand B2 + state-machine-Konvergenz Klage/#4358 + closeNurGutachter/#4370) tragen den
  // feinen Terminal in operative_status. getClaimLifecycle nimmt den WEITESTEN Kandidaten (SUB_ORDER
  // 15 = terminal), der operative Kandidat gewinnt also ueber die milestone-Kaskade. Bit-gleich zur
  // v_claim_phase (m_sub-status-Terminals ebenfalls gedroppt). claims.status = Read-tot -> derivable/drop (T3).

  // ── CMM-74 b2 (v_claim_phase-Parity) ── operative Regulierungs-Sub-Phasen, die VOR
  // dem lexdrive-Eintritt greifen. Reihenfolge bitgleich zur View: nb.active > vs-kuerzt >
  // anschlussschreiben(pre-lexdrive). Vor diesen steht nur der terminal-Abschluss (oben).
  const aktiveNachbesichtigung = auftraege.find(
    (a) => a.typ === 'nachbesichtigung' && a.status !== 'abgeschlossen',
  )
  if (aktiveNachbesichtigung) {
    return {
      mainPhase: 'regulierung',
      subPhase: 'nachbesichtigung-laeuft',
      aktiveSideQuests: sideQuests,
      aktiverAuftrag: aktiveNachbesichtigung,
    }
  }
  // ── Auszahlung (Aaron 03.07., DATA-DRIVEN) ── KB-nativ (kanzleiAuszahlungEingegangen
  // setzt kf.status='auszahlung'/ausgezahlt_am) ODER LexDrive. KEIN lexdrive_case_id-Gate
  // mehr — unsere DB treibt die Phase. Weiteste Regulierungs-Sub-Phase → zuerst geprüft.
  if (kanzleiFall?.status === 'auszahlung' || kanzleiFall?.ausgezahlt_am) {
    return { mainPhase: 'regulierung', subPhase: 'auszahlung', aktiveSideQuests: sideQuests, aktiverAuftrag: sideQuests[0] ?? null }
  }
  if (kanzleiFall?.vs_reaktion_typ === 'gekuerzt') {
    return { mainPhase: 'regulierung', subPhase: 'vs-kuerzt', aktiveSideQuests: sideQuests, aktiverAuftrag: null }
  }
  if (kanzleiFall?.anschlussschreiben_am && !kanzleiFall?.lexdrive_case_id) {
    return { mainPhase: 'regulierung', subPhase: 'anschlussschreiben', aktiveSideQuests: sideQuests, aktiverAuftrag: null }
  }

  // ── Regulierung/versicherungskontakt (Aaron 03.07., DATA-DRIVEN) ── LexDrive-Uebernahme
  // (lexdrive_case_id) ODER KB-nativer VS-Kontakt (kanzleiVsKontaktErfasst → kf.vs_kontakt_am).
  // Das alte B-10-lexdrive-Gate ist aufgehoben: die Regulierung wird von UNSEREN DB-Daten
  // getrieben, nicht von der (noch nicht angebundenen) LexDrive-API.
  if (kanzleiFall?.lexdrive_case_id || kanzleiFall?.vs_kontakt_am) {
    return {
      mainPhase: 'regulierung',
      subPhase: 'versicherungskontakt',
      aktiveSideQuests: sideQuests,
      aktiverAuftrag: sideQuests[0] ?? null,
    }
  }

  // ── Regulierung (operativ-getrieben) ── B4-slice-2a-ii: der frühere claims.status-Read
  // (REGULIERUNG_STATUS_SUBSTATE: in_kommunikation_vs/abgelehnt) ist ENTFERNT. Diese Non-Terminal-
  // Outcomes trägt seit slice-1b operative_status → OPERATIVE_PHASE liefert versicherungskontakt/
  // nachforderung über den operativen Kandidaten (getClaimLifecycle). Kein status-Fallback mehr.

  // ── Kanzlei-Uebergabe-Interim ── B-10: kanzlei_faelle existiert, aber noch kein
  // lexdrive_case_id → "Kanzlei-Uebergabe laeuft" (begutachtung-Tail), nicht regulierung.
  if (kanzleiFall) {
    return {
      mainPhase: 'begutachtung',
      subPhase: 'kanzlei_uebergabe',
      aktiveSideQuests: sideQuests,
      aktiverAuftrag: sideQuests[0] ?? null,
    }
  }

  // ── Begutachtung ── aktiver Erstgutachten-Auftrag.
  if (erstgutachten && erstgutachten.status !== 'abgeschlossen') {
    let sub: ClaimSubPhase =
      erstgutachten.status === 'termin'
        ? 'termin'
        : erstgutachten.status === 'besichtigung'
          ? 'besichtigung'
          : 'gutachten'
    // CMM-74 b2 (v_claim_phase-Parity): innerhalb 'gutachten' verfeinern —
    // filmcheck_ok=true → QC-Pruefung; sonst mit hochgeladenem Gutachten → Filmcheck.
    if (erstgutachten.status === 'gutachten') {
      if (erstgutachten.filmcheck_ok === true) sub = 'qc-pruefung'
      else if (erstgutachten.gutachten_url) sub = 'filmcheck'
    }
    return {
      mainPhase: 'begutachtung',
      subPhase: sub,
      aktiveSideQuests: [],
      aktiverAuftrag: erstgutachten,
    }
  }

  // ── Erfassung (Direct-Reparatur) ── WS6/Kasko-Fix: kasko/selbstzahler haben keine
  // SA/Vollmacht-Strecke — Reparatur-Lane statt Lead-Kaskade (auch im milestone-Kandidaten,
  // damit die SA-Kaskade nicht per SUB_ORDER-Gleichstand zurueckgewinnt).
  if (istDirectReparatur(input)) {
    return {
      mainPhase: 'erfassung',
      subPhase: reparaturSubphase(input),
      aktiveSideQuests: [],
      aktiverAuftrag: null,
    }
  }

  // ── Erfassung ── Lead nicht durch + kein Auftrag.
  if (lead) {
    let sub: ClaimSubPhase = 'sa_offen'
    if (lead.sa_unterschrieben) sub = 'vollmacht_offen'
    if (lead.vollmacht_signiert_am) sub = 'onboarding_offen'
    return {
      mainPhase: 'erfassung',
      subPhase: sub,
      aktiveSideQuests: [],
      aktiverAuftrag: null,
    }
  }

  // Fallback (sollte nicht passieren) — landet auf erfassung.
  return {
    mainPhase: 'erfassung',
    subPhase: 'sa_offen',
    aktiveSideQuests: [],
    aktiverAuftrag: null,
  }
}

// Unified Stepper: operative_status -> Lifecycle-Kandidat. Erfassung-Sub aus Lead-Feldern,
// Abschluss-Sub aus claims.status (sonst erfolgreich_reguliert), Begutachtung-'gutachten'
// via Auftrag (filmcheck_ok/gutachten_url) verfeinert.
function operativeLifecycle(
  input: ClaimLifecycleInput,
  opPhase: { main: ClaimMainPhase; sub: ClaimSubPhase },
): ClaimLifecycle {
  const { lead, auftraege } = input
  const erstgutachten = auftraege.find((a) => a.typ === 'erstgutachten') ?? null
  const sideQuests = auftraege.filter(
    (a) => (a.typ === 'nachbesichtigung' || a.typ === 'stellungnahme') && a.status !== 'abgeschlossen',
  )
  // B4-slice-2a-ii: `resolved` bleibt opPhase.sub — die Abschluss-Sub-Phase kommt jetzt aus
  // operative_status (OPERATIVE_PHASE trägt den feinen Terminal), NICHT mehr aus claims.status.
  let resolved: ClaimSubPhase = opPhase.sub
  if (opPhase.main === 'erfassung' && !opPhase.sub.startsWith('reparatur_')) {
    // WS6/Kasko-Fix: Direct-Reparatur-Wege bekommen die Reparatur-Lane statt der SA-Kaskade.
    // Traegt der Cursor bereits eine SPEZIFISCHE reparatur_-Sub (reparatur-laeuft etc.), bleibt
    // sie stehen — die Signal-Leiter darf einen weiteren Cursor nicht downgraden (z.B.
    // 'reparatur-laeuft' ohne rt-Row -> Leiter saehe nur 'werkstattwahl'). Den Hochweg
    // uebernimmt der SUB_ORDER-max-Vergleich in getClaimLifecycle.
    resolved = erfassungsSubphase(input)
  } else if (opPhase.main === 'begutachtung' && opPhase.sub === 'gutachten' && erstgutachten) {
    if (erstgutachten.filmcheck_ok === true) resolved = 'qc-pruefung'
    else if (erstgutachten.gutachten_url) resolved = 'filmcheck'
  }
  return {
    mainPhase: opPhase.main,
    subPhase: resolved,
    aktiveSideQuests: sideQuests,
    aktiverAuftrag: opPhase.main === 'begutachtung' ? erstgutachten : (sideQuests[0] ?? null),
  }
}

// Unified Stepper (Aaron, "ein Stepper am Claim"): EINE kanonische Phase aus DB-Feldern je
// nach Befuellung. Nimmt den WEITESTEN von zwei Kandidaten — operative_status (Engine-Cursor)
// und Milestone-Kaskade (Sub-Entity-Felder) — gemessen am globalen SUB_ORDER. Behebt sowohl
// haengende Milestones (operative liftet, ~56 "Erfassung-Haenger") als auch zurueckgebliebene
// operative_status (Milestone liftet, z.B. kanzlei_fall ohne Cursor-Advance). Terminal
// (claims.status) steckt in der Milestone-Kaskade (Sub-Order 15) + strikte > Regel -> terminal
// gewinnt. Output-Taxonomie unveraendert -> Konsumenten + SQL-Spiegel v_claim_phase bit-gleich.
export function getClaimLifecycle(input: ClaimLifecycleInput): ClaimLifecycle {
  const milestone = milestoneLifecycle(input)
  const opPhase = input.operativeStatus ? OPERATIVE_PHASE[input.operativeStatus] : undefined
  if (!opPhase) return milestone
  const operative = operativeLifecycle(input, opPhase)
  return SUB_ORDER[operative.subPhase] > SUB_ORDER[milestone.subPhase] ? operative : milestone
}

export function getMainPhaseIndex(p: ClaimMainPhase): number {
  return MAIN_PHASE_INDEX[p]
}

/** AAR-939: Sichtbare Hauptphasen je service_typ. nur_gutachter-Claims (embed-B
 *  + nativ) durchlaufen NIE die Regulierung (keine Kanzlei, kein lexdrive_case_id /
 *  VS-Status) -> Stepper/Pipeline blenden sie aus: Erfassung -> Begutachtung ->
 *  Abschluss. Logik-frei: getClaimLifecycle setzt mainPhase fuer nur_gutachter
 *  ohnehin nie auf 'regulierung' (nur ein UI-Sicht-Filter, keine Phasen-Aenderung). */
export function getVisibleMainPhases(
  serviceTyp: string | null | undefined,
): ClaimMainPhase[] {
  const all: ClaimMainPhase[] = ['erfassung', 'begutachtung', 'regulierung', 'abschluss']
  if (serviceTyp === 'nur_gutachter') return all.filter((p) => p !== 'regulierung')
  return all
}

// CMM-44 MP-4c: Listen/Kanban-Reader lesen v_claim_phase (main_phase/sub_phase) als
// rohen string. Diese Guards casten sicher in die getypten Werte (mit Fallback),
// damit buildClaimPhasePipeline/SUBPHASE_LABEL nie auf einem ungueltigen Key landen.
const MAIN_PHASES: ReadonlySet<ClaimMainPhase> = new Set([
  'erfassung',
  'begutachtung',
  'regulierung',
  'abschluss',
])

export function toClaimMainPhase(value: string | null | undefined): ClaimMainPhase {
  return value && MAIN_PHASES.has(value as ClaimMainPhase) ? (value as ClaimMainPhase) : 'erfassung'
}

// WS6/Kasko-Fix: v_claim_phase spricht fuer die Reparatur-Lane ein eigenes sub-Vokabular
// (Selbstzahler-CASE) — ohne Alias fiele jeder View-sub-Konsument auf 'sa_offen' zurueck
// (gleiche Anzeige-Luecke wie der kasko-Bug, ueber den View-Pfad).
const VIEW_SUBPHASE_ALIAS: Record<string, ClaimSubPhase> = {
  'reparatur-werkstatt-suche': 'reparatur_werkstattwahl',
  'reparatur-angefragt': 'reparatur_terminfindung',
  'reparatur-laeuft': 'reparatur_laeuft',
  'reparatur-erledigt': 'reparatur_fertig',
}

export function toClaimSubPhase(value: string | null | undefined): ClaimSubPhase {
  if (value && value in VIEW_SUBPHASE_ALIAS) return VIEW_SUBPHASE_ALIAS[value]
  return value && value in SUBPHASE_LABEL ? (value as ClaimSubPhase) : 'sa_offen'
}

/** Vollstaendige Liste aller ClaimSubPhase-Werte — single source of truth fuer
 *  Exhaustiveness-Tests (z.B. claimWorkflowMeta-Completeness). */
export const ALL_CLAIM_SUB_PHASES = [
  'sa_offen',
  'vollmacht_offen',
  'onboarding_offen',
  'termin',
  'besichtigung',
  'gutachten',
  'filmcheck',
  'qc-pruefung',
  'kanzlei_uebergabe',
  'versicherungskontakt',
  'auszahlung',
  'nachforderung',
  'vs-kuerzt',
  'anschlussschreiben',
  'nachbesichtigung-laeuft',
  'erfolgreich_reguliert',
  'storniert',
  'klage_rechtsstreit',
  'verjaehrt',
  'abgelehnt_final',
  'an_externe_kanzlei',
  'termin_durchgefuehrt',
  // WS6 Slice 2a: Reparatur-Lane
  'reparatur_werkstattwahl',
  'reparatur_terminfindung',
  'reparatur_laeuft',
  'reparatur_fertig',
] as const satisfies readonly ClaimSubPhase[]
