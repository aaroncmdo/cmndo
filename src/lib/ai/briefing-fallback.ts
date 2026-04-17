// AAR-385: Regel-basierter Fallback für das strukturierte Briefing.
//
// Wird genutzt wenn die Claude API nicht verfügbar ist (Down, Key fehlt,
// Schema-Validation scheitert). Liefert aus den Flags + Basis-Feldern ein
// mageres aber deterministisches Briefing — besser als gar kein Briefing.
//
// Markiert das Ergebnis mit `generated_by: 'fallback'` im Wrapper, damit
// die UI den Unterschied anzeigen kann.

import type { BriefingInput } from './briefing-prompt'
import type { SvBriefingStruktur } from '@/lib/types/field-modus'

export function buildFallbackBriefing(input: BriefingInput): SvBriefingStruktur {
  const hinweise: string[] = []
  const warnungen: string[] = []
  const checkliste: string[] = ['FIN vom Fahrzeugschein abgleichen']

  // Fahrzeug-Infos
  const fahrzeug = [input.fahrzeug_hersteller, input.fahrzeug_modell]
    .filter(Boolean)
    .join(' ')
    .trim()
  const halter = [input.halter_vorname, input.halter_nachname]
    .filter(Boolean)
    .join(' ')
    .trim()

  // Kurzversion aus Schadenhergang oder Schadentyp ableiten
  const hergang =
    input.schadenhergang?.trim() ||
    input.unfallhergang?.trim() ||
    input.schadens_beschreibung?.trim() ||
    null

  let kurzversion: string
  if (hergang) {
    const satz1 = hergang.length > 160 ? hergang.slice(0, 157) + '…' : hergang
    const teile: string[] = [satz1]
    if (fahrzeug) teile.push(`Fahrzeug: ${fahrzeug}.`)
    if (halter) teile.push(`Halter: ${halter}.`)
    kurzversion = teile.join(' ')
  } else if (fahrzeug || halter) {
    kurzversion = [
      'Kein detaillierter Hergang erfasst.',
      fahrzeug ? `Fahrzeug: ${fahrzeug}.` : null,
      halter ? `Halter: ${halter}.` : null,
    ]
      .filter(Boolean)
      .join(' ')
  } else {
    kurzversion =
      'Kein ausreichender Kontext aus Dispatch — bitte vorab Kunde anrufen.'
  }

  // Hinweise
  if (input.polizei_bericht_vorhanden || input.polizei_aktenzeichen) {
    hinweise.push(
      input.polizei_aktenzeichen
        ? `Polizeibericht vorhanden (AZ ${input.polizei_aktenzeichen})`
        : 'Polizeibericht vorhanden',
    )
  }
  if (input.zeugen_vorhanden) {
    hinweise.push('Zeugen-Kontakt beim Kunden verfügbar')
  }
  if (input.gegner_versicherung) {
    hinweise.push(`Gegner-VS: ${input.gegner_versicherung}`)
  }

  // Warnungen
  if (input.leasing_flag) {
    warnungen.push('Leasing-Fahrzeug — Wertminderung nach Leasing-Basis prüfen')
    checkliste.push('Leasingvertrag / Leasingnehmer-Daten aufnehmen')
  }
  if (input.halter_ungleich_fahrer_flag) {
    warnungen.push('Halter ≠ Fahrer')
  }
  if (input.vorschaden_vorhanden || input.hat_vorschaeden) {
    const desc = input.vorschaeden_beschreibung?.trim()
    warnungen.push(
      desc && desc.length < 80
        ? `Vorschaden gemeldet: ${desc}`
        : 'Vorschaden gemeldet — Abgrenzung dokumentieren',
    )
    checkliste.push('Vorschaden-Bereich separat fotografieren')
  }
  if (input.gegner_kennzeichen_auslaendisch) {
    warnungen.push('Gegnerisches Fahrzeug mit Auslandskennzeichen')
  }
  if (input.personenschaden_flag) {
    warnungen.push('Personenschaden — Hinweis auf Unfallbericht für Anwalt')
  }
  if (input.sprache && input.sprache.toLowerCase() !== 'deutsch' && input.sprache.toLowerCase() !== 'de') {
    warnungen.push(`Kommunikation: ${input.sprache}`)
  }

  // Checkliste Basis
  checkliste.push('Fotos Schaden mit Übersicht + Detail')
  if (input.personenschaden_flag) {
    checkliste.push('Verletzungsbereich im Fahrzeug dokumentieren')
  }
  if (input.mietwagen_flag) {
    checkliste.push('Mietwagen-Bedarf klären')
  }

  return {
    kurzversion,
    hinweise,
    warnungen,
    checkliste_vor_ort: checkliste,
  }
}
