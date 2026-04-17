// AAR-385: Prompt-Template für das strukturierte SV-Briefing.
//
// Gibt ein 4-teiliges JSON-Objekt zurück (kurzversion, hinweise[],
// warnungen[], checkliste_vor_ort[]) — gespeichert in
// `faelle.sv_briefing_struktur`. Parallel zu AAR-377's flachem Fließtext
// in `sv_briefing_text`. Der Input wird aus dem bereits bestehenden
// `buildBriefingInput` (briefing-prompt.ts) wiederverwendet.

import { z } from 'zod'

export const svBriefingStrukturSchema = z.object({
  kurzversion: z.string().min(1),
  hinweise: z.array(z.string()).default([]),
  warnungen: z.array(z.string()).default([]),
  checkliste_vor_ort: z.array(z.string()).default([]),
})

export type SvBriefingStrukturParsed = z.infer<typeof svBriefingStrukturSchema>

/**
 * System-Prompt ist statisch (cache-fähig). Enthält explizit JSON-Format-
 * Anforderungen, damit Claude reproduzierbar valides JSON liefert.
 */
export function buildSvBriefingStrukturSystem(): string {
  return [
    'Du bist Claimondo-Assistent und schreibst strukturierte Briefings für Kfz-Sachverständige, die zu einem Vor-Ort-Termin beim Geschädigten fahren.',
    '',
    'Ziel: Der Sachverständige soll in 10 Sekunden erkennen, was passiert ist, wo er aufpassen muss und was vor Ort konkret zu prüfen ist.',
    '',
    'Du antwortest AUSSCHLIESSLICH mit einem validen JSON-Objekt. Keine Einleitung, keine Markdown-Code-Fences, kein erklärender Text.',
    '',
    'Schema (alle Felder Pflicht, Arrays dürfen leer sein):',
    '{',
    '  "kurzversion": string,            // 2-3 Sätze Fließtext: Hergang + Fahrzeug + wichtigster Kontext',
    '  "hinweise": string[],             // Positive Infos: vorhandene Dokumente, klare Haftung, Zeugen-Kontakte (0-4 Einträge)',
    '  "warnungen": string[],            // Kritische Punkte: Vorschäden, Leasing, Halter ≠ Fahrer, Auslandskennzeichen, Sprache, Fahrerflucht (0-5 Einträge)',
    '  "checkliste_vor_ort": string[]    // Konkrete Prüf-Aktionen: FIN abgleichen, bestimmte Fotos, Werte aufnehmen (2-6 Einträge)',
    '}',
    '',
    'Regeln:',
    '- Listen-Einträge sind kurze Phrasen, max. 10 Wörter, ohne Satzzeichen am Ende.',
    '- Wenn Fall-Daten zu dünn sind: kurzversion = "Kein ausreichender Kontext aus Dispatch — bitte vorab Kunde anrufen.", Listen leer.',
    '- Deutsch mit korrekten Umlauten (ä/ö/ü/ß). Niemals ASCII-Ersatz (ae/oe/ue/ss).',
    '- Keine Floskeln, keine Anreden, keine Emojis.',
    '- Hinweise und Warnungen dürfen nicht dasselbe wiederholen.',
  ].join('\n')
}

export function buildSvBriefingStrukturUser(inputJson: string): string {
  return [
    'Erstelle das strukturierte Briefing für folgenden Fall.',
    '',
    'Fall-Daten:',
    inputJson,
  ].join('\n')
}
