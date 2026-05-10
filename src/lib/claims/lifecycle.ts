// CMM-32: Zentraler Claim-Resolver.
// Aggregiert die drei Sub-Entity-Lifecycles (Lead / Auftraege / Kanzlei-Fall)
// zu einer Claim-Sicht mit Hauptphase + aktueller Subphase.
//
// Hauptphasen:
//   erfassung    — Lead aktiv (kein abgeschlossenes Erstgutachten + kein kanzlei_fall)
//   begutachtung — aktiver Auftrag (status != abgeschlossen)
//   regulierung  — kanzlei_fall existiert + nicht ausgezahlt
//                  (Nachbesichtigung/Stellungnahme als Side-Quest sichtbar,
//                   aber Hauptphase bleibt regulierung)
//   abschluss    — kanzlei_fall.status = auszahlung + ausgezahlt_am gesetzt
//                  + alle aufträge abgeschlossen
//
// Subphasen werden inline gerendert (Stepper auf Kunde-Seite).

import type { AuftragRow } from '@/lib/auftrag/queries'
import type { KanzleiFallRow } from '@/lib/kanzlei-fall/queries'

export type ClaimMainPhase = 'erfassung' | 'begutachtung' | 'regulierung' | 'abschluss'

export type ClaimSubPhase =
  // Lead
  | 'sa_offen'
  | 'vollmacht_offen'
  | 'onboarding_offen'
  // Auftrag (lebt typisch unter begutachtung)
  | 'termin'
  | 'besichtigung'
  | 'gutachten'
  // Regulierung
  | 'versicherungskontakt'
  | 'auszahlung'
  // Abschluss
  | 'abgeschlossen'

export type ClaimLifecycle = {
  mainPhase: ClaimMainPhase
  subPhase: ClaimSubPhase
  /** Sichtbare Side-Quests (Nachbesichtigung/Stellungnahme während Regulierung). */
  aktiveSideQuests: AuftragRow[]
  /** Aktiver Auftrag (für Anzeige der Termin/ETA-Details). */
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
  versicherungskontakt: 'Versicherungskontakt',
  auszahlung: 'Auszahlung',
  abgeschlossen: 'Abgeschlossen',
}

/** Innerhalb welcher Hauptphase lebt diese Subphase? */
export function mainPhaseOf(sub: ClaimSubPhase): ClaimMainPhase {
  if (sub === 'sa_offen' || sub === 'vollmacht_offen' || sub === 'onboarding_offen') return 'erfassung'
  if (sub === 'termin' || sub === 'besichtigung' || sub === 'gutachten') return 'begutachtung'
  if (sub === 'versicherungskontakt' || sub === 'auszahlung') return 'regulierung'
  return 'abschluss'
}

export function getClaimLifecycle(input: ClaimLifecycleInput): ClaimLifecycle {
  const { lead, auftraege, kanzleiFall } = input

  const erstgutachten = auftraege.find((a) => a.typ === 'erstgutachten') ?? null
  const sideQuests = auftraege.filter(
    (a) => (a.typ === 'nachbesichtigung' || a.typ === 'stellungnahme') && a.status !== 'abgeschlossen',
  )

  // ── Abschluss ───────────────────────────────────────────────────────────
  if (
    kanzleiFall?.status === 'auszahlung' &&
    kanzleiFall.ausgezahlt_am &&
    auftraege.every((a) => a.status === 'abgeschlossen')
  ) {
    return {
      mainPhase: 'abschluss',
      subPhase: 'abgeschlossen',
      aktiveSideQuests: [],
      aktiverAuftrag: null,
    }
  }

  // ── Regulierung ─────────────────────────────────────────────────────────
  // Sobald Kanzlei-Fall existiert ist die Hauptphase regulierung.
  // Side-Quests (Nachbesichtigung/Stellungnahme) laufen parallel sichtbar,
  // ändern aber nicht die Hauptphase.
  if (kanzleiFall) {
    const sub: ClaimSubPhase =
      kanzleiFall.status === 'auszahlung' ? 'auszahlung' : 'versicherungskontakt'
    return {
      mainPhase: 'regulierung',
      subPhase: sub,
      aktiveSideQuests: sideQuests,
      aktiverAuftrag: sideQuests[0] ?? null,
    }
  }

  // ── Begutachtung ────────────────────────────────────────────────────────
  // Aktiver Erstgutachten-Auftrag = Begutachtung läuft.
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

  // ── Erfassung ───────────────────────────────────────────────────────────
  // Lead nicht durch + kein Auftrag.
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
