// Die EINE Weiche des kanonischen FlowLinks — reine, client-safe Logik (keine Server-/DB-Imports),
// analog zu werkstatt/abrechnungsweg.ts. Bisher war der Flow terminzustands-gesteuert: `needsBooking`
// fragte nur "gibt es schon einen Termin?" und NIE "welcher Abrechnungsweg ist das?". Kasko/Selbstzahler
// fielen nur zufaellig heraus — ueber den Quali-Short-Circuit, der aber NICHT greift, wenn die
// schuldfrage schon gesetzt hereinkommt (dann entfaellt der Quali-Step). Ergebnis: ein Kasko-Kunde sah
// den Gutachter-Finder. Diese Funktion macht die Verzweigung DB-getrieben und deckungsgleich mit dem
// Kunde-Portal (das istWerkstattReparaturWeg bereits nutzt).
//
// Alles haengt an der schuldfrage:
//   'gegner'             -> Haftpflicht: Gutachter + Werkstatt, volle Unfall-Feststellung
//   'unklar'             -> Teilschuld: NUR Rueckruf beim Dispatch (Haftung erst klaeren)
//   'eigenverantwortung' -> Kasko/Selbstzahler: KEIN Gutachter, Werkstatt anbieten, nur Schaden-Feststellung

import {
  resolveAbrechnungsweg,
  istWerkstattReparaturWeg,
  type Abrechnungsweg,
} from '@/lib/werkstatt/abrechnungsweg'

/** Welche Feststellungs-Felder der Kunde sieht. */
export type FeststellungZweig =
  /** Haftpflicht/Teilschuld: volle Unfall-Aufnahme (Hergang, Ort/Zeit, Polizei, Zeugen, Gegner). */
  | 'unfall'
  /** Kasko/Selbstzahler: kein Unfallgegner -> nur Schaden + Fahrzeug (fuer die Werkstatt-Vermittlung). */
  | 'schaden'

export type FlowWeichen = {
  abrechnungsweg: Abrechnungsweg | null
  /** Gutachter-Finder / Termin-Step zeigen? */
  brauchtGutachter: boolean
  /** Werkstatt-Finder zeigen? */
  brauchtWerkstatt: boolean
  /** Teilschuld -> Rueckruf beim Dispatch statt Gutachter-Buchung. */
  brauchtRueckruf: boolean
  feststellungZweig: FeststellungZweig
}

export type FlowWeichenInput = {
  /** leads.schuldfrage: 'gegner' | 'unklar' | 'eigenverantwortung' */
  schuldfrage: string | null
  /** leads.eigene_versicherung ('ja'|'nein') — vom Caller bereits nach boolean normalisiert. */
  ueberEigeneVersicherung: boolean | null
  /** leads.freie_werkstattwahl — nur bei Kasko relevant (gebunden => kein freier Weg). */
  freieWerkstattwahl: boolean | null
  /** leads.service_typ: 'komplett' | 'nur_gutachter' */
  serviceTyp: string | null
  /** Ist bereits ein SV/Termin zugeordnet? (terminMitSv || terminPending) */
  hatSvTermin: boolean
  /** Haengt bereits eine Werkstatt am Lead? (reparatur_werkstatt_id || werkstatt_id) */
  hatWerkstatt: boolean
}

/**
 * Leitet alle FlowLink-Weichen aus den Lead-Feldern ab.
 *
 * Anzeige-Regel (durchgaengig fuer beide Vermittlungen): ist der SV bzw. die Werkstatt bereits
 * zugeordnet, wird sie ANGEZEIGT statt gesucht — der jeweilige Finder verschwindet.
 *
 * Ist die schuldfrage (oder bei Eigenverschulden die Versicherungsfrage) noch offen, erzwingt die
 * Weiche NICHTS: dann laeuft der Kunde durch den Quali-Step, der die Frage nachholt. Das ist wichtig,
 * weil `schuldfrage='eigenverantwortung'` OHNE `eigene_versicherung` den Lead sonst still toetet.
 */
export function resolveFlowWeichen(input: FlowWeichenInput): FlowWeichen {
  const {
    schuldfrage,
    ueberEigeneVersicherung,
    freieWerkstattwahl,
    serviceTyp,
    hatSvTermin,
    hatWerkstatt,
  } = input

  const abrechnungsweg = resolveAbrechnungsweg({ schuldfrage, ueberEigeneVersicherung })

  const istTeilschuld = schuldfrage === 'unklar'
  const istEigenverantwortung = schuldfrage === 'eigenverantwortung'
  const istNurGutachter = serviceTyp === 'nur_gutachter'
  const istHaftpflicht = abrechnungsweg === 'haftpflicht'
  // Kanonische Weiche — dieselbe, die das Kunde-Portal nutzt (GeldZone/StatusZone):
  // Selbstzahler immer; Kasko nur bei freier Werkstattwahl (gebunden => im Quali disqualifiziert).
  const istReparaturWeg = istWerkstattReparaturWeg(abrechnungsweg, freieWerkstattwahl)

  return {
    abrechnungsweg,
    // Ein SV-Gutachten gibt es nur auf dem Haftpflicht-Weg. Kasko/Selbstzahler reparieren direkt,
    // Teilschuld wird erst telefonisch geklaert.
    brauchtGutachter: !hatSvTermin && !istTeilschuld && istHaftpflicht,
    // Werkstatt: auf dem Reparatur-Weg sofort, bei Haftpflicht nach dem Gutachten.
    // Nie bei 'nur_gutachter' (reiner Gutachten-Auftrag) und nie bei ungeklaerter Teilschuld.
    brauchtWerkstatt:
      !hatWerkstatt && !istTeilschuld && !istNurGutachter && (istReparaturWeg || istHaftpflicht),
    brauchtRueckruf: istTeilschuld,
    // Eigenverschulden hat keinen Unfallgegner -> Polizei/Zeugen/Gegner-Felder entfallen; wir fragen
    // nur noch, was kaputt ist und welches Fahrzeug es ist (das braucht die Werkstatt-Vermittlung).
    feststellungZweig: istEigenverantwortung ? 'schaden' : 'unfall',
  }
}
