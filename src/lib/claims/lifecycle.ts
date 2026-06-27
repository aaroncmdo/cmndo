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
  /** CMM-44 MP-3 (B-11): claims.status — Quelle der terminalen abschluss-Substates. */
  claimStatus?: string | null
  /** Unified Stepper: claims.operative_status — kanonische Phasen-Quelle (wenn befuellt). */
  operativeStatus?: string | null
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
}

/** CMM-44 MP-3 (B-11) / MP-8: terminale claims.status-Werte → abschluss-Substate.
 *  Writer = endzustand-actions (MP-8). `storniert` war schon vor MP-8 gueltig. */
const ABSCHLUSS_SUBSTATE: Record<string, ClaimSubPhase> = {
  reguliert_vollstaendig: 'erfolgreich_reguliert',
  storniert: 'storniert',
  klage_rechtsstreit: 'klage_rechtsstreit',
  verjaehrt: 'verjaehrt',
  abgelehnt_final: 'abgelehnt_final',
  an_externe_kanzlei_uebergeben: 'an_externe_kanzlei',
  // AAR-939: nur_gutachter/embed-B — Termin durchgeführt → terminal (kein Regulierungs-Tail)
  termin_durchgefuehrt: 'termin_durchgefuehrt',
}

/** CMM-44 MP-8: nicht-terminale claims.status, die Regulierung signalisieren —
 *  auch ohne uebernommenen Kanzleifall (lexdrive_case_id). in_kommunikation_vs =
 *  KB im VS-Kontakt; abgelehnt = einfache Ablehnung (nachforderbar). */
const REGULIERUNG_STATUS_SUBSTATE: Record<string, ClaimSubPhase> = {
  in_kommunikation_vs: 'versicherungskontakt',
  abgelehnt: 'nachforderung',
}

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
  'vs-kuerzt': { main: 'regulierung', sub: 'vs-kuerzt' },
  'nachbesichtigung-laeuft': { main: 'regulierung', sub: 'nachbesichtigung-laeuft' },
  'vs-abgelehnt': { main: 'regulierung', sub: 'nachforderung' },
  klage: { main: 'regulierung', sub: 'nachforderung' },
  'zahlung-eingegangen': { main: 'regulierung', sub: 'auszahlung' },
  abgeschlossen: { main: 'abschluss', sub: 'erfolgreich_reguliert' },
  storniert: { main: 'abschluss', sub: 'storniert' },
}

function leadSubphase(lead: ClaimLifecycleInput['lead']): ClaimSubPhase {
  if (lead?.vollmacht_signiert_am) return 'onboarding_offen'
  if (lead?.sa_unterschrieben) return 'vollmacht_offen'
  return 'sa_offen'
}

/** Innerhalb welcher Hauptphase lebt diese Subphase? */
export function mainPhaseOf(sub: ClaimSubPhase): ClaimMainPhase {
  if (sub === 'sa_offen' || sub === 'vollmacht_offen' || sub === 'onboarding_offen') return 'erfassung'
  if (sub === 'termin' || sub === 'besichtigung' || sub === 'gutachten' || sub === 'kanzlei_uebergabe' || sub === 'filmcheck' || sub === 'qc-pruefung') return 'begutachtung'
  if (sub === 'versicherungskontakt' || sub === 'auszahlung' || sub === 'nachforderung' || sub === 'vs-kuerzt' || sub === 'anschlussschreiben' || sub === 'nachbesichtigung-laeuft') return 'regulierung'
  return 'abschluss'
}

export function getClaimLifecycle(input: ClaimLifecycleInput): ClaimLifecycle {
  const { lead, auftraege, kanzleiFall, claimStatus, operativeStatus = null } = input

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

  // ── Unified Stepper (operative_status als kanonische Quelle) ──────────────
  // Regel 2: claims.status regulierung-signal hebt auf Regulierung, falls operative_status
  // befuellt aber noch < Regulierung ist (Robustheit). Bei operativeStatus=NULL greift die
  // bestehende Milestone-Kaskade unten an ihrer Original-Prioritaet (lexdrive > status).
  const regSignal = claimStatus ? REGULIERUNG_STATUS_SUBSTATE[claimStatus] : undefined
  const opPhase = operativeStatus ? OPERATIVE_PHASE[operativeStatus] : undefined
  if (regSignal && opPhase && MAIN_PHASE_INDEX[opPhase.main] < MAIN_PHASE_INDEX.regulierung) {
    return { mainPhase: 'regulierung', subPhase: regSignal, aktiveSideQuests: sideQuests, aktiverAuftrag: sideQuests[0] ?? null }
  }
  // Regel 3: operative_status treibt main+sub (Lead-Sub fuer Erfassung, claims.status-Ergebnis
  // fuer Abschluss, Auftrag-Verfeinerung filmcheck/qc innerhalb Begutachtung).
  if (opPhase) {
    let resolved: ClaimSubPhase = opPhase.sub
    if (opPhase.main === 'erfassung') {
      resolved = leadSubphase(lead)
    } else if (opPhase.main === 'abschluss' && operativeStatus !== 'storniert') {
      const term2 = claimStatus ? ABSCHLUSS_SUBSTATE[claimStatus] : undefined
      resolved = term2 ?? 'erfolgreich_reguliert'
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

  // ── Fallback (operative_status NULL/unbekannt): bestehende Milestone-Kaskade ──
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
  if (kanzleiFall?.vs_reaktion_typ === 'gekuerzt') {
    return { mainPhase: 'regulierung', subPhase: 'vs-kuerzt', aktiveSideQuests: sideQuests, aktiverAuftrag: null }
  }
  if (kanzleiFall?.anschlussschreiben_am && !kanzleiFall?.lexdrive_case_id) {
    return { mainPhase: 'regulierung', subPhase: 'anschlussschreiben', aktiveSideQuests: sideQuests, aktiverAuftrag: null }
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

  // ── Regulierung (Status-getrieben) ── CMM-44 MP-8: in_kommunikation_vs /
  // einfache abgelehnt signalisieren Regulierung auch ohne uebernommenen Kanzleifall.
  const regSub = claimStatus ? REGULIERUNG_STATUS_SUBSTATE[claimStatus] : undefined
  if (regSub) {
    return {
      mainPhase: 'regulierung',
      subPhase: regSub,
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

export function toClaimSubPhase(value: string | null | undefined): ClaimSubPhase {
  return value && value in SUBPHASE_LABEL ? (value as ClaimSubPhase) : 'sa_offen'
}
