// CMM-32 / CMM-44 MP-3: Zentraler Claim-Resolver.
// Aggregiert die Sub-Entity-Lifecycles (Lead / Auftraege / Kanzleifall) + den
// terminalen claims.status zu einer Claim-Sicht mit Hauptphase + Subphase.
//
// Hauptphasen:
//   erfassung    — Lead aktiv (kein abgeschlossenes Erstgutachten + kein kanzlei_fall)
//   begutachtung — aktiver Auftrag (status != abgeschlossen) ODER Kanzlei-Uebergabe
//                  laeuft (kanzlei_fall existiert, aber lexdrive_case_id noch null —
//                  B-10-Interim "Kanzlei-Uebergabe laeuft", begutachtung-Tail)
//   regulierung  — kanzlei_fall MIT lexdrive_case_id (B-10: Eintritt erst wenn die
//                  LexDrive-Kanzlei den Fall uebernommen hat; KB-manuell bis LexDrive-
//                  Anbindung). Nachbesichtigung/Stellungnahme als Side-Quest sichtbar.
//   abschluss    — claims.status terminal (B-11/B-12: KB/Kanzlei-gesetzt, NICHT aus
//                  Auszahlung auto-abgeleitet). Substates erfolgreich_reguliert /
//                  storniert / klage_rechtsstreit / verjaehrt.
//
// Prioritaet: abschluss > regulierung > Kanzlei-Uebergabe-Interim > begutachtung >
// erfassung. MUSS bitgleich zur SQL-Spiegel-View v_claim_phase sein (Parity-Gate).

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
  // CMM-44 MP-3: Kanzlei-Uebergabe-Interim (begutachtung-Tail, kf da / lexdrive null, B-10)
  | 'kanzlei_uebergabe'
  // Regulierung
  | 'versicherungskontakt'
  | 'auszahlung'
  // Abschluss (CMM-44 MP-3 / B-5/B-11: terminale claims.status-Substates)
  | 'erfolgreich_reguliert'
  | 'storniert'
  | 'klage_rechtsstreit'
  | 'verjaehrt'

export type ClaimLifecycle = {
  mainPhase: ClaimMainPhase
  subPhase: ClaimSubPhase
  /** Sichtbare Side-Quests (Nachbesichtigung/Stellungnahme waehrend Regulierung). */
  aktiveSideQuests: AuftragRow[]
  /** Aktiver Auftrag (fuer Anzeige der Termin/ETA-Details). */
  aktiverAuftrag: AuftragRow | null
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
  /** CMM-44 MP-3 (B-11): claims.status — Quelle der terminalen abschluss-Substates. */
  claimStatus?: string | null
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
  kanzlei_uebergabe: 'Kanzlei-Übergabe läuft',
  versicherungskontakt: 'Versicherungskontakt',
  auszahlung: 'Auszahlung',
  erfolgreich_reguliert: 'Erfolgreich reguliert',
  storniert: 'Storniert',
  klage_rechtsstreit: 'Klage / Rechtsstreit',
  verjaehrt: 'Verjährt',
}

/** CMM-44 MP-3 (B-11): terminale claims.status-Werte → abschluss-Substate.
 *  Das Vokabular wird KB/Kanzlei-seitig gesetzt (Writer = MP-7/MP-8); bis dahin
 *  ist abschluss leer. `storniert` ist bereits heute ein gueltiger claims.status. */
const ABSCHLUSS_SUBSTATE: Record<string, ClaimSubPhase> = {
  reguliert_vollstaendig: 'erfolgreich_reguliert',
  storniert: 'storniert',
  klage_rechtsstreit: 'klage_rechtsstreit',
  verjaehrt: 'verjaehrt',
}

/** Innerhalb welcher Hauptphase lebt diese Subphase? */
export function mainPhaseOf(sub: ClaimSubPhase): ClaimMainPhase {
  if (sub === 'sa_offen' || sub === 'vollmacht_offen' || sub === 'onboarding_offen') return 'erfassung'
  if (sub === 'termin' || sub === 'besichtigung' || sub === 'gutachten' || sub === 'kanzlei_uebergabe') return 'begutachtung'
  if (sub === 'versicherungskontakt' || sub === 'auszahlung') return 'regulierung'
  return 'abschluss'
}

export function getClaimLifecycle(input: ClaimLifecycleInput): ClaimLifecycle {
  const { lead, auftraege, kanzleiFall, claimStatus } = input

  const erstgutachten = auftraege.find((a) => a.typ === 'erstgutachten') ?? null
  const sideQuests = auftraege.filter(
    (a) => (a.typ === 'nachbesichtigung' || a.typ === 'stellungnahme') && a.status !== 'abgeschlossen',
  )

  // ── Abschluss ── B-11/B-12: ausschliesslich aus terminalem claims.status
  // (KB/Kanzlei-Urteil). Auszahlung ist regulierung-intern und kippt NICHT selbst
  // in abschluss. Terminal ueberschreibt alle anderen Phasen.
  const terminal = claimStatus ? ABSCHLUSS_SUBSTATE[claimStatus] : undefined
  if (terminal) {
    return { mainPhase: 'abschluss', subPhase: terminal, aktiveSideQuests: [], aktiverAuftrag: null }
  }

  // ── Regulierung ── B-10: Eintritt erst wenn lexdrive_case_id gesetzt ist
  // (LexDrive-Kanzlei hat uebernommen). Bloße kanzlei_faelle-Existenz reicht NICHT.
  if (kanzleiFall?.lexdrive_case_id) {
    const sub: ClaimSubPhase = kanzleiFall.status === 'auszahlung' ? 'auszahlung' : 'versicherungskontakt'
    return {
      mainPhase: 'regulierung',
      subPhase: sub,
      aktiveSideQuests: sideQuests,
      aktiverAuftrag: sideQuests[0] ?? null,
    }
  }

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
    const subMap: Record<AuftragRow['status'], ClaimSubPhase> = {
      termin: 'termin',
      besichtigung: 'besichtigung',
      gutachten: 'gutachten',
      abgeschlossen: 'gutachten',
    }
    return {
      mainPhase: 'begutachtung',
      subPhase: subMap[erstgutachten.status],
      aktiveSideQuests: [],
      aktiverAuftrag: erstgutachten,
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

export function getMainPhaseIndex(p: ClaimMainPhase): number {
  return MAIN_PHASE_INDEX[p]
}
