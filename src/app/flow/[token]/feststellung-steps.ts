// AAR-956 15.06. (Aaron): Micro-Step-Aufteilung der Kunden-Feststellung. Statt
// eines langen Scrolls wird jede Config-Phase (Schaden/Unfall/Fahrzeug/Service)
// in kleine Schritte mit 1-3 Feldern zerlegt — eine Frage pro Screen.
//
// Deklarativ + adjustierbar: die FELDER kommen weiterhin aus der Config
// (onboarding_phasen/-felder via ladeFlowPhasen), hier steht NUR die Gruppierung
// + Reihenfolge. Ein 'felder'-Schritt ist sichtbar, sobald >=1 seiner Felder
// sichtbar ist (audience kunde + istFeststellungsFeld + conditional_on erfuellt)
// — sonst faellt er raus (z.B. Gegner-Schritt nur bei schuldfrage='gegner').
// Custom-Schritte rendern Spezial-Komponenten (ZB1-Foto, Polizeibericht).
//
// i18n: Titel/Kapitel sind vorerst Deutsch (deutsches Produkt; non-DE laeuft
// ueber den Sprach-Banner-Fallback). TODO: nach messages/<locale>.json ziehen,
// sobald die Strecke steht.

import type { ConditionalOn, OnboardingFeld } from '@/components/onboarding/types'

export type FeststellungMicroStep =
  | { kind: 'felder'; id: string; kapitel: string; titel: string; sub?: string; feldKeys: string[] }
  | { kind: 'zb1'; id: string; kapitel: string; titel: string; sub?: string }

export const FESTSTELLUNG_STEPS: FeststellungMicroStep[] = [
  // ① Schaden
  { kind: 'felder', id: 'unfalltyp', kapitel: 'Schaden', titel: 'Was ist passiert?', feldKeys: ['schadentyp', 'schadentyp_freitext'] },
  { kind: 'felder', id: 'hergang', kapitel: 'Schaden', titel: 'Wie ist es passiert?', sub: 'Schildere den Hergang so ausführlich wie möglich — Richtung, Tempo, Ampel/Vorfahrt, wer war wo. Daraus erstellen wir die präzise Unfallskizze.', feldKeys: ['unfallhergang', 'schaden_sichtbar'] },
  { kind: 'felder', id: 'folgeschaeden', kapitel: 'Schaden', titel: 'Verletzte oder weitere Schäden?', feldKeys: ['personenschaden_flag', 'sachschaden_flag', 'sachschaden_beschreibung'] },
  // Reparaturwunsch (Abrechnungs-Intent) + Rueckfrage "hast du eine Werkstatt?" (conditional)
  // + Extern-Name (conditional). Felder liegen in onboarding_felder (audience 'beide').
  { kind: 'felder', id: 'reparatur', kapitel: 'Schaden', titel: 'Reparatur oder Auszahlung?', feldKeys: ['reparaturwunsch', 'reparatur_vermittlung_status', 'reparatur_werkstatt_extern'] },
  // ② Unfall
  { kind: 'felder', id: 'wann_wo', kapitel: 'Unfall', titel: 'Wann und wo?', feldKeys: ['unfalldatum', 'unfall_uhrzeit', 'unfallort'] },
  // AAR-956 16.06. (Aaron): "Polizei & Zeugen" — der Polizeibericht-Upload ist hier INLINE
  // (FlowFeststellungStep), kein eigener Schritt mehr; nach Upload läuft die BKAT-Auslese.
  { kind: 'felder', id: 'polizei_zeugen', kapitel: 'Unfall', titel: 'Polizei & Zeugen', feldKeys: ['polizei_vor_ort', 'polizei_aktenzeichen', 'zeugen'] },
  { kind: 'felder', id: 'gegner', kapitel: 'Unfall', titel: 'Daten des Unfallgegners', sub: 'Steht auf dem europäischen Unfallbericht oder der Visitenkarte.', feldKeys: ['gegner_kennzeichen', 'auslandskennzeichen', 'gegner_versicherung', 'gegner_telefon'] },
  // ③ Fahrzeug
  { kind: 'zb1', id: 'fahrzeugschein', kapitel: 'Fahrzeug', titel: 'Fahrzeugschein fotografieren', sub: 'Ein Foto füllt Marke, FIN und Halter automatisch aus.' },
  { kind: 'felder', id: 'dein_fahrzeug', kapitel: 'Fahrzeug', titel: 'Dein Fahrzeug', feldKeys: ['kennzeichen', 'fahrzeug_fahrbereit', 'mietwagen_flag'] },
  { kind: 'felder', id: 'halter', kapitel: 'Fahrzeug', titel: 'Wem gehört das Fahrzeug?', feldKeys: ['ist_fahrzeughalter', 'halter_vorname', 'halter_nachname', 'halter_geburtsdatum', 'halter_strasse', 'halter_plz', 'halter_stadt'] },
  { kind: 'felder', id: 'vorschaeden', kapitel: 'Fahrzeug', titel: 'Vorschäden am Auto?', feldKeys: ['hat_vorschaeden'] },
  // ④ Service-/Kanzlei-Wahl (service_typ + kanzlei_wunsch) wandert in den Signatur-Step
  //    (POS) — Aaron 16.06.: "die Kanzlei nicht am Feststellung-Ende, sondern wo unterschrieben
  //    wird". Gerendert in FlowWizardKfz (SA-Step), Config via serviceFelder-Prop.
]

// Spiegelt WizardClient.meetsCondition: sichtbar wenn keine Bedingung gesetzt ist
// oder der aktuelle Wert des Bedingungsfelds exakt passt (String-Vergleich).
export function meetsCondition(
  cond: ConditionalOn | null | undefined,
  vals: Record<string, unknown>,
): boolean {
  if (!cond) return true
  return String(vals[cond.feld] ?? '') === cond.equals
}

// Aktive Micro-Schritte fuer die gegebene Feld-Config (felderByKey) + Werte:
//  - zb1 immer sichtbar,
//  - felder-Schritt sobald >=1 seiner feldKeys in der Config liegt UND dessen
//    conditional_on erfuellt ist.
// WICHTIG: felderByKey MUSS aus der mount-stabilen Phasen-Config stammen. Leert sie
// sich (RSC-Re-Render nachdem unfallhergang gefuellt wurde, page.tsx feststellungNeeded),
// bleibt nur der immer-sichtbare zb1-Step uebrig → activeSteps.length === 1 → der
// "1/1"-Sprung-Bug (AAR-956 16.06.). Der Cap passiert im Consumer (FlowFeststellungStep:
// phasenStabil); diese Funktion macht ihn testbar.
export function computeActiveFeststellungSteps(
  felderByKey: Map<string, Pick<OnboardingFeld, 'conditional_on'>>,
  values: Record<string, unknown>,
): FeststellungMicroStep[] {
  return FESTSTELLUNG_STEPS.filter((step) => {
    if (step.kind === 'zb1') return true
    return step.feldKeys.some((k) => {
      const f = felderByKey.get(k)
      return f != null && meetsCondition(f.conditional_on, values)
    })
  })
}
