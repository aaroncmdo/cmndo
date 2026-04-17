import { EINWAENDE, FACHBEGRIFFE } from './knowledge-base'

// AAR-436: Prompt-Templates sind in statisch (cacheable) + dynamisch (per-call)
// gesplittet. Der statische Teil enthält Rolle, Instruktion und
// Referenz-Tabellen (Einwände/Fachbegriffe) — er wird per cache_control als
// ephemeral markiert und ist 5min warm. Der dynamische Teil enthält den
// konkreten Fall-Kontext und wird bei jedem Call neu gesendet.

export type PreCallContext = {
  kundeName: string
  fallNummer: string
  status: string
  fahrzeug: string
  schadenhoehe: string | null
  terminDatum: string | null
  letzteNachrichten: string[]
  aktivePhase: string
  subProzesse: string[]
  // AAR-446: Letzte FAQ-Bot-Analyse aus `fall_summaries` (Child 2 = AAR-445).
  // Optional — wenn der Kunde in den letzten 7 Tagen nicht gechattet hat,
  // bleibt das Feld null und der Analyse-Block wird im Prompt weggelassen.
  letzteAnalyse?: {
    anliegen: string
    zusammenfassung: string
    naechsteSchritte: string
    generatedAt: string
  } | null
}

export function buildPreCallStaticSystem(): string {
  const einwandExamples = EINWAENDE.slice(0, 8).map(e => `- "${e.einwand}" → ${e.antwort}`).join('\n')
  const fachbegriffeList = Object.entries(FACHBEGRIFFE).slice(0, 6).map(([k, v]) => `- ${k}: ${v}`).join('\n')

  return `Du bist ein erfahrener Mitarbeiter eines KFZ-Schadenmanagement-Unternehmens (Claimondo).
Dein Kollege ruft gleich einen Kunden an. Bereite ein kurzes Briefing vor:

1. **Aktueller Stand** des Falls (2 Sätze max)
2. **Anrufziel**: Was ist das wahrscheinliche Ziel dieses Anrufs?
3. **3 mögliche Einwände** des Kunden + jeweils ein Antwort-Vorschlag
4. **2 fachliche Punkte** die dein Kollege parat haben sollte
5. **Empfohlener Closing/Nächster Schritt**

Formatiere als übersichtliche Aufzählung, kurz und knackig. Keine langen Texte.

=== HÄUFIGE EINWÄNDE (Referenz) ===
${einwandExamples}

=== FACHBEGRIFFE (Referenz) ===
${fachbegriffeList}`
}

export function buildPreCallUser(context: PreCallContext): string {
  // AAR-446: Analyse-Block nur wenn letzte Bot-Analyse bekannt ist.
  const analyseBlock = context.letzteAnalyse
    ? `\n=== LETZTE BOT-CHAT-ANALYSE (${formatAnalyseAlter(context.letzteAnalyse.generatedAt)}) ===
Kunden-Anliegen: ${context.letzteAnalyse.anliegen}

Zusammenfassung: ${context.letzteAnalyse.zusammenfassung}

Vorgeschlagene nächste Schritte (aus Bot-Analyse):
${context.letzteAnalyse.naechsteSchritte}\n`
    : ''

  return `=== FALL-KONTEXT ===
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
${analyseBlock}
Erstelle jetzt das Briefing nach dem oben beschriebenen Schema. Wenn eine
Bot-Analyse vorliegt, berücksichtige das Kunden-Anliegen und erwähne es
explizit im Briefing-Punkt „Anrufziel".`
}

// AAR-446: Formatierung-Helper für den Prompt-Block. Die UI nutzt die
// Funktion aus @/lib/format/datum — hier bleibt eine leichte Dopplung, damit
// das Prompt-Modul keine UI-Abhängigkeit bekommt.
function formatAnalyseAlter(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `vor ${h} h`
  const d = Math.floor(h / 24)
  return `vor ${d} Tag${d === 1 ? '' : 'en'}`
}

/**
 * @deprecated AAR-436: Nutze buildPreCallStaticSystem + buildPreCallUser
 * für Prompt-Caching-Support. Diese String-Variante bleibt nur als
 * Fallback für non-cached-Callsites.
 */
export function buildPreCallPrompt(context: PreCallContext): string {
  return buildPreCallStaticSystem() + '\n\n' + buildPreCallUser(context)
}

export type PostCallContext = {
  fallNummer: string
  transkript: string | null
  dauer: number
  kundeName: string
}

export const POST_CALL_STATIC_SYSTEM = `Du bist ein KFZ-Schadenmanagement-Experte. Analysiere abgeschlossene Kunden-Anrufe und erstelle:

1. **Zusammenfassung** (max 3 Sätze): Was wurde besprochen, was ist das Ergebnis?
2. **Nächste Schritte** (Aufzählung): Was muss als nächstes passieren?
3. **Stimmung**: Zufrieden / Neutral / Unzufrieden / Verärgert

Formatiere ausschließlich als JSON: { "zusammenfassung": "...", "naechste_schritte": "...", "stimmung": "..." }

Antworte ohne Markdown-Rahmen, ohne Prosa davor oder danach.`

export function buildPostCallUser(context: PostCallContext): string {
  return `Fall: ${context.fallNummer}
Kunde: ${context.kundeName}
Dauer: ${context.dauer} Sekunden

${context.transkript ? `=== TRANSKRIPT ===\n${context.transkript}` : 'Kein Transkript verfügbar.'}`
}

/**
 * @deprecated AAR-436: Nutze POST_CALL_STATIC_SYSTEM + buildPostCallUser.
 */
export function buildPostCallPrompt(context: PostCallContext): string {
  return POST_CALL_STATIC_SYSTEM + '\n\n' + buildPostCallUser(context)
}
