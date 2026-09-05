import type { AnspruchPosition, Schuldform } from './types'

// Reine Display-Schicht fuer die Anspruch-Positionen: verzweigt Label/Wert-Art + Summe je Schuldform,
// OHNE die berechneten Positionsbetraege zu veraendern. Single source fuer alle 4 Render-Stellen
// (Summary, beide Totalschaden-Wege, SV-Fallakte-Vorschau). Vollstaendig testbar.

export type PositionsWertArt =
  | 'betrag' // Euro-Spanne anzeigen
  | 'gegner' // "Gegnerversicherung" (gegner-gedeckt)
  | 'nicht_gedeckt' // ausgegraut, "entfaellt" (bei Selbstverschulden nicht ueber die Kasko)

export type PositionsDarstellung = {
  key: string
  label: string
  hinweis?: string
  art: PositionsWertArt
  minEur: number | null
  maxEur: number | null
}

export type DarstellungGesamt = { label: string; minEur: number; maxEur: number }

export type SchuldTon = 'erfolg' | 'neutral' | 'warnung'
export type SchuldBotschaft = { titel: string; beleg: string; ton: SchuldTon }

function istGegnerGedeckt(p: AnspruchPosition): boolean {
  return Boolean(p.gedecktDurchGegner) || p.minEur == null || p.maxEur == null
}

/**
 * Verzweigt die Positionen je Schuldform:
 * - unverschuldet/teilschuld: gegner-gedeckte Posten -> "Gegnerversicherung", Rest -> Betrag.
 * - selbst: NUR der Fahrzeugschaden (Reparatur) gilt als gedeckt (Vollkasko abzgl. SB); alle anderen
 *   Posten werden ausgegraut ('nicht_gedeckt') und zaehlen NICHT zur angezeigten Summe.
 * Die Summe wird aus den 'betrag'-Positionen gebildet; Positionsbetraege bleiben unveraendert.
 */
export function darstellePositionen(
  spanne: { positionen: AnspruchPosition[]; schuld?: Schuldform },
  defaultGesamtLabel: string,
): { positionen: PositionsDarstellung[]; gesamt: DarstellungGesamt } {
  const schuld: Schuldform = spanne.schuld ?? 'unverschuldet'

  const positionen: PositionsDarstellung[] = spanne.positionen.map((p): PositionsDarstellung => {
    if (schuld === 'selbst') {
      // Fahrzeugschaden + Verbringung (Teil der Reparatur) traegt die Vollkasko (abzgl. SB); alles andere nicht.
      if (p.typ === 'reparatur' || p.typ === 'verbringung') {
        return { key: p.typ, label: p.label, hinweis: 'über Ihre Vollkasko, abzüglich Selbstbeteiligung', art: 'betrag', minEur: p.minEur, maxEur: p.maxEur }
      }
      return { key: p.typ, label: p.label, hinweis: 'über die Kasko meist nicht', art: 'nicht_gedeckt', minEur: p.minEur, maxEur: p.maxEur }
    }
    if (istGegnerGedeckt(p)) {
      return { key: p.typ, label: p.label, hinweis: p.hinweis, art: 'gegner', minEur: p.minEur, maxEur: p.maxEur }
    }
    return { key: p.typ, label: p.label, hinweis: p.hinweis, art: 'betrag', minEur: p.minEur, maxEur: p.maxEur }
  })

  const zaehlen = positionen.filter((p) => p.art === 'betrag' && p.minEur != null && p.maxEur != null)
  const minEur = Math.round(zaehlen.reduce((s, p) => s + (p.minEur as number), 0))
  const maxEur = Math.round(zaehlen.reduce((s, p) => s + (p.maxEur as number), 0))
  const label = schuld === 'selbst' ? 'Fahrzeugschaden über Ihre Vollkasko' : defaultGesamtLabel

  return { positionen, gesamt: { label, minEur, maxEur } }
}

/** Kernbotschaft je Schuldform fuer das Kunden-Summary (der Claimondo-Pitch im unverschuldeten Fall). */
export function schuldBotschaft(schuld: Schuldform): SchuldBotschaft {
  if (schuld === 'unverschuldet') {
    return {
      titel: 'Ihre Eigenkosten: 0 €',
      beleg: 'Bei einem unverschuldeten Unfall zahlt die gegnerische Haftpflicht alles, auch Anwalt und Gutachter (§ 249 BGB).',
      ton: 'erfolg',
    }
  }
  if (schuld === 'teilschuld') {
    return {
      titel: 'Anteilige Erstattung',
      beleg: 'Bei Mitverschulden wird anteilig gekürzt. Die genaue Quote klärt Ihr Gutachter oder Anwalt.',
      ton: 'neutral',
    }
  }
  return {
    titel: 'Regulierung über Ihre Kasko',
    // Kasko-WB Phase 2 (D6): vorher widersprach sich der Zweig selbst — die Positionen darueber setzten die
    // Vollkasko voraus, die Botschaft verneinte sie. Beides in einem Satz, sauber getrennt.
    beleg:
      'Mit Vollkasko reguliert Ihre Versicherung den Fahrzeugschaden abzüglich Selbstbeteiligung; ohne tragen Sie den Schaden selbst. Nutzungsausfall, Anwalt und Gutachter übernimmt die Kasko in der Regel nicht.',
    ton: 'warnung',
  }
}

/**
 * Kasko-WB Phase 2 (D6): Das Foto-Tool fragt bewusst NICHT nach Versicherer/Tarif (das tut der FlowLink,
 * Phase 1). Der Hinweis schliesst die Luecke, dass ein gebundener Tarif die Werkstatt vorschreibt.
 */
export const KASKO_WERKSTATTBINDUNG_HINWEIS =
  'Bitte prüfen Sie vor der Reparatur Ihren Versicherungsschein auf einen Werkstattbindungs-Zusatz (z. B. „Werkstattbindung“, „Werkstattbonus“, „SELECT“). Steht dort einer, benennt Ihre Versicherung die Werkstatt.'
