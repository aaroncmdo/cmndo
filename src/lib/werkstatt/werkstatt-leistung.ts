// Leistungs-Kennzahlen einer Werkstatt fuer das Admin-Detail-Dashboard.
// Rein aus den v_werkstatt_auftrag-Zeilen abgeleitet (pure + testbar). Nutzt die
// kanonische Phasen-Ableitung werkstattAuftragPhase (statt Status neu zu raten),
// damit "offen/erledigt/abgelehnt" konsistent mit der Aktivitaets-Tabelle ist.

import { werkstattAuftragPhase, type WerkstattAuftragPhaseInput } from './werkstatt-auftrag-phase'

/** Von der Berechnung gelesene Felder (strukturelles Subset von WerkstattDetailAuftrag). */
export interface WerkstattLeistungInput extends WerkstattAuftragPhaseInput {
  richtung: string | null
  provision_betrag_netto: number | null
  reparatur_bestaetigter_termin: string | null
}

export interface WerkstattLeistung {
  gesamt: number
  /** richtung 'inbound' — Werkstatt hat den Kunden gebracht (QR/eigene Vermittlung). */
  inbound: number
  /** richtung 'vermittelt' — Claimondo hat den Auftrag vermittelt. */
  vermittelt: number
  /** Aktive Auftraege (Phase weder erledigt noch abgelehnt/storniert). */
  offen: number
  erledigt: number
  abgelehnt: number
  /** erledigt / (erledigt + abgelehnt); null wenn noch keiner abgeschlossen ist. */
  abschlussquote: number | null
  /** Auftraege mit Besichtigung in den letzten 90 Tagen. */
  aktivLetzte90Tage: number
  provisionGesamtNetto: number
  /** Median-Tage von Gutachten-fertig bis bestaetigtem Reparatur-Termin; null wenn keine Datenpunkte. */
  reaktionstageMedian: number | null
}

const TAG_MS = 86_400_000

function median(werte: number[]): number | null {
  if (werte.length === 0) return null
  const s = [...werte].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

export function berechneWerkstattLeistung(
  auftraege: WerkstattLeistungInput[],
  jetzt: Date,
): WerkstattLeistung {
  let inbound = 0
  let vermittelt = 0
  let offen = 0
  let erledigt = 0
  let abgelehnt = 0
  let provisionGesamtNetto = 0
  let aktivLetzte90Tage = 0
  const reaktionstage: number[] = []
  const grenze90 = jetzt.getTime() - 90 * TAG_MS

  for (const a of auftraege) {
    if (a.richtung === 'inbound') inbound++
    else if (a.richtung === 'vermittelt') vermittelt++

    const key = werkstattAuftragPhase(a).key
    if (key === 'erledigt') erledigt++
    else if (key === 'abgelehnt') abgelehnt++
    else offen++

    provisionGesamtNetto += a.provision_betrag_netto ?? 0

    if (a.besichtigung_start) {
      const t = new Date(a.besichtigung_start).getTime()
      if (!Number.isNaN(t) && t >= grenze90) aktivLetzte90Tage++
    }

    if (a.gutachten_fertiggestellt_am && a.reparatur_bestaetigter_termin) {
      const von = new Date(a.gutachten_fertiggestellt_am).getTime()
      const bis = new Date(a.reparatur_bestaetigter_termin).getTime()
      if (!Number.isNaN(von) && !Number.isNaN(bis) && bis >= von) {
        reaktionstage.push(Math.round((bis - von) / TAG_MS))
      }
    }
  }

  const abgeschlossen = erledigt + abgelehnt
  return {
    gesamt: auftraege.length,
    inbound,
    vermittelt,
    offen,
    erledigt,
    abgelehnt,
    abschlussquote: abgeschlossen === 0 ? null : erledigt / abgeschlossen,
    aktivLetzte90Tage,
    provisionGesamtNetto,
    reaktionstageMedian: median(reaktionstage),
  }
}
