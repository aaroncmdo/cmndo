// AAR-377: Prompt-Template + Input-Mapper für das SV-Briefing.
//
// Der Generator in `briefing.ts` lädt Fall + Lead, mapped mit `buildBriefingInput`
// auf das strukturierte Objekt, das im Prompt-User-Part als JSON serialisiert
// wird. Der System-Prompt ist statisch (cache-fähig).
//
// Heuristik Auslandskennzeichen: gegner_kennzeichen matcht nicht den
// deutschen Regex `^[A-ZÄÖÜ]{1,3}[- ]?[A-Z]{1,2}[- ]?\d{1,4}[EH]?$`.

export type BriefingInput = {
  // Schaden
  schadenhergang: string | null
  unfallhergang: string | null
  schadenart: string | null
  schadenfall_typ: string | null
  unfall_konstellation: string | null
  schadens_beschreibung: string | null
  // Kunde
  halter_vorname: string | null
  halter_nachname: string | null
  sprache: string | null
  // Fahrzeug
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  fahrzeug_baujahr: number | null
  kilometerstand: number | null
  erstzulassung: string | null
  kennzeichen: string | null
  // Gegner
  gegner_name: string | null
  gegner_versicherung: string | null
  gegner_kennzeichen: string | null
  gegner_bekannt: boolean | null
  gegner_kennzeichen_auslaendisch: boolean
  // Flags
  personenschaden_flag: boolean | null
  mietwagen_flag: boolean | null
  leasing_flag: boolean | null
  gewerbe_flag: boolean | null
  halter_ungleich_fahrer_flag: boolean | null
  hat_vorschaeden: boolean | null
  vorschaeden_beschreibung: string | null
  polizei_vor_ort: boolean | null
  polizei_bericht_vorhanden: boolean | null
  polizei_aktenzeichen: string | null
  // Dispatch-Erkenntnisse
  notizen: string | null
  interne_notizen: string | null
  zeugen_vorhanden: boolean | null
  // Vorschaden-Bericht
  cardentity_report: unknown
}

/**
 * Heuristik: Kennzeichen das nicht dem deutschen Muster entspricht, gilt
 * als ausländisch. Muster: 1-3 Buchstaben, optionales Trennzeichen, 1-2
 * Buchstaben, 1-4 Ziffern, optionaler E/H-Suffix für E-Auto/Historisch.
 */
export function isAuslaendischesKennzeichen(kennzeichen: string | null): boolean {
  if (!kennzeichen) return false
  const cleaned = kennzeichen.trim().toUpperCase()
  if (!cleaned) return false
  const deRegex = /^[A-ZÄÖÜ]{1,3}[- ]?[A-Z]{1,2}[- ]?\d{1,4}[EH]?$/
  return !deRegex.test(cleaned)
}

/**
 * Mapped Fall- und Lead-Rows zu einem strukturierten Briefing-Input.
 * Fall-Felder haben Vorrang (Lead-Daten wurden beim Convert übernommen, aber
 * ein nachträglich editiertes Fall-Feld ist autoritativ).
 */
export function buildBriefingInput(
  fall: Record<string, unknown>,
  lead: Record<string, unknown> | null,
): BriefingInput {
  const f = fall
  const l = lead ?? {}

  const pick = <T = unknown>(key: string): T | null => {
    const v = f[key] ?? l[key] ?? null
    return (v as T | null) ?? null
  }

  const gegnerKennzeichen = pick<string>('gegner_kennzeichen')

  return {
    schadenhergang: pick<string>('schadenhergang'),
    unfallhergang: pick<string>('unfallhergang'),
    schadenart: pick<string>('schadenart'),
    schadenfall_typ: pick<string>('schadenfall_typ'),
    unfall_konstellation: pick<string>('unfall_konstellation'),
    schadens_beschreibung: pick<string>('schadens_beschreibung'),
    halter_vorname: pick<string>('halter_vorname'),
    halter_nachname: pick<string>('halter_nachname'),
    sprache: pick<string>('sprache'),
    fahrzeug_hersteller: pick<string>('fahrzeug_hersteller'),
    fahrzeug_modell: pick<string>('fahrzeug_modell'),
    fahrzeug_baujahr: pick<number>('fahrzeug_baujahr'),
    kilometerstand: pick<number>('kilometerstand'),
    erstzulassung: pick<string>('erstzulassung'),
    kennzeichen: pick<string>('kennzeichen'),
    gegner_name: pick<string>('gegner_name'),
    gegner_versicherung: pick<string>('gegner_versicherung'),
    gegner_kennzeichen: gegnerKennzeichen,
    gegner_bekannt: pick<boolean>('gegner_bekannt'),
    gegner_kennzeichen_auslaendisch: isAuslaendischesKennzeichen(gegnerKennzeichen),
    personenschaden_flag: pick<boolean>('personenschaden_flag'),
    mietwagen_flag: pick<boolean>('mietwagen_flag'),
    leasing_flag: pick<boolean>('leasing_flag'),
    gewerbe_flag: pick<boolean>('gewerbe_flag'),
    halter_ungleich_fahrer_flag: pick<boolean>('halter_ungleich_fahrer_flag'),
    hat_vorschaeden: pick<boolean>('hat_vorschaeden'),
    vorschaeden_beschreibung: pick<string>('vorschaeden_beschreibung'),
    polizei_vor_ort: pick<boolean>('polizei_vor_ort'),
    polizei_bericht_vorhanden: pick<boolean>('polizei_bericht_vorhanden'),
    polizei_aktenzeichen: pick<string>('polizei_aktenzeichen'),
    notizen: pick<string>('notizen') ?? (l.notiz as string | null) ?? null,
    interne_notizen: pick<string>('interne_notizen'),
    zeugen_vorhanden: pick<boolean>('zeugen_vorhanden'),
    cardentity_report: pick('cardentity_report'),
  }
}

/**
 * Statischer System-Prompt — wird via Anthropic Prompt-Caching wiederverwendet.
 * Änderungen an diesem String machen den Cache ungültig.
 */
export function buildSvBriefingSystem(): string {
  return [
    'Du bist Claimondo-Assistent. Du schreibst kurze, präzise Briefings für Kfz-Sachverständige, die gleich zu einem Vor-Ort-Termin beim Geschädigten fahren.',
    '',
    'Ziel: Der Sachverständige soll in 30 Sekunden wissen, was passiert ist, worauf er besonders achten muss und was vor Ort noch zu klären ist.',
    '',
    'Ton: Direkt, sachlich, praktisch. Keine Floskeln. Kein „Guten Tag". Keine Erklärung des Offensichtlichen.',
    '',
    'Struktur (genau 3-5 Sätze, keine Aufzählungen, Fließtext):',
    '1. Was ist passiert (Schadenshergang kompakt, 1 Satz).',
    '2. Fahrzeug und Halter, wenn relevant.',
    '3. Kritische Punkte zum Beachten: Vorschaden, Fahrerflucht, Auslandskennzeichen, Personenschaden, Leasing, Halter ≠ Fahrer, Polizei.',
    '4. Was vor Ort noch zu klären ist: offene Dokumente, Hinweise aus der Dispatch-Phase.',
    '',
    'Sprache: Deutsch mit korrekten Umlauten (ä/ö/ü/ß). Keine ASCII-Ersatzformen.',
    'Max. 5 Sätze. Keine Markdown-Überschriften, keine Bullets, keine Emojis.',
  ].join('\n')
}

/**
 * Dynamischer User-Prompt — enthält die Fall-Daten als JSON. Wird NICHT
 * gecached (Cache-Boundary liegt am Ende des System-Prompts).
 */
export function buildSvBriefingUser(input: BriefingInput): string {
  const fallDaten = JSON.stringify(input, null, 2)
  return [
    'Erstelle das Briefing für folgenden Fall.',
    '',
    'Fall-Daten:',
    fallDaten,
  ].join('\n')
}
