import { EINWAENDE, FACHBEGRIFFE, FRISTEN } from './knowledge-base'

export function buildPreCallPrompt(context: {
  kundeName: string
  fallNummer: string
  status: string
  fahrzeug: string
  schadenhoehe: string | null
  terminDatum: string | null
  letzteNachrichten: string[]
  aktivePhase: string
  subProzesse: string[]
}): string {
  const einwandExamples = EINWAENDE.slice(0, 8).map(e => `- "${e.einwand}" → ${e.antwort}`).join('\n')
  const fachbegriffeList = Object.entries(FACHBEGRIFFE).slice(0, 6).map(([k, v]) => `- ${k}: ${v}`).join('\n')

  return `Du bist ein erfahrener Mitarbeiter eines KFZ-Schadenmanagement-Unternehmens (Claimondo).
Dein Kollege ruft gleich diesen Kunden an. Bereite ein kurzes Briefing vor:

1. **Aktueller Stand** des Falls (2 Sätze max)
2. **Anrufziel**: Was ist das wahrscheinliche Ziel dieses Anrufs?
3. **3 mögliche Einwände** des Kunden + jeweils ein Antwort-Vorschlag
4. **2 fachliche Punkte** die dein Kollege parat haben sollte
5. **Empfohlener Closing/Nächster Schritt**

Formatiere als übersichtliche Aufzählung, kurz und knackig. Keine langen Texte.

=== FALL-KONTEXT ===
Kunde: ${context.kundeName}
Fall: ${context.fallNummer}
Status: ${context.status}
Fahrzeug: ${context.fahrzeug}
Schadenhöhe: ${context.schadenhoehe ?? 'noch nicht bekannt'}
Nächster Termin: ${context.terminDatum ?? 'kein Termin'}
Aktuelle Phase: ${context.aktivePhase}
${context.subProzesse.length > 0 ? `Aktive Subprozesse: ${context.subProzesse.join(', ')}` : ''}

=== LETZTE KOMMUNIKATION ===
${context.letzteNachrichten.length > 0 ? context.letzteNachrichten.join('\n') : 'Keine bisherige Kommunikation.'}

=== HÄUFIGE EINWÄNDE (Referenz) ===
${einwandExamples}

=== FACHBEGRIFFE (Referenz) ===
${fachbegriffeList}`
}

export function buildPostCallPrompt(context: {
  fallNummer: string
  transkript: string | null
  dauer: number
  kundeName: string
}): string {
  return `Du bist ein KFZ-Schadenmanagement-Experte. Analysiere diesen abgeschlossenen Anruf:

Fall: ${context.fallNummer}
Kunde: ${context.kundeName}
Dauer: ${context.dauer} Sekunden

${context.transkript ? `=== TRANSKRIPT ===\n${context.transkript}` : 'Kein Transkript verfügbar.'}

Erstelle:
1. **Zusammenfassung** (max 3 Sätze): Was wurde besprochen, was ist das Ergebnis?
2. **Nächste Schritte** (Aufzählung): Was muss als nächstes passieren?
3. **Stimmung**: Zufrieden / Neutral / Unzufrieden / Verärgert

Formatiere als JSON: { "zusammenfassung": "...", "naechste_schritte": "...", "stimmung": "..." }`
}
