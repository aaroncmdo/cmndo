// Server-seitige SVG-Sanitization gegen XSS (OWASP A03 Injection / LLM05).
//
// Die Unfallskizze-SVG wird von Claude aus caller-kontrolliertem Freitext
// (leads.unfallhergang, im /flow-Selbstservice vom Kunden befuellt) generiert.
// LLM-Output ist untrusted: eine Prompt-Injection im Hergang kann das Modell
// dazu bringen, aktives SVG (<script>, on*-Handler, <foreignObject>, javascript:-
// URIs) auszugeben. Das SVG wird anschliessend via dangerouslySetInnerHTML in
// PRIVILEGIERTEN Staff-Sessions (Dispatch/Admin/Kundenbetreuer) gerendert →
// Stored XSS in einer bevorrechtigten Sitzung. Beide Eingangspfade
// (Claude-Generierung + manuelles Editor-Save) muessen sanitized werden.
//
// Eine legitime Unfallskizze braucht nur Formen/Linien/Text
// (rect/circle/line/path/polygon/polyline/text/g/defs/marker/ellipse/...) —
// KEINES der unten entfernten aktiven Konstrukte. Denylist der praktischen
// SVG-XSS-Vektoren (Skript-Ausfuehrung). DOMPurify mit SVG-Profil waere die
// Gold-Standard-Alternative; hier bewusst dependency-frei, weil die Vokabel
// server-generiert + eng ist.
export function sanitizeSvg(svg: string): string {
  let s = svg
  // 1. Skript-faehige Container komplett entfernen (inkl. Inhalt).
  s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, '')
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '')
  s = s.replace(/<style[\s\S]*?<\/style\s*>/gi, '')
  // 2. Verwaiste / self-closing Varianten dieser + weitere aktive Elemente.
  s = s.replace(
    /<\/?\s*(?:script|foreignObject|style|a|iframe|embed|object|handler|listener)\b[^>]*>/gi,
    '',
  )
  // 3. Event-Handler-Attribute (onload, onclick, onbegin, ...).
  s = s.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s/>]+)/gi, '')
  // 4. javascript:/data: in href / xlink:href.
  s = s.replace(
    /\s(?:xlink:href|href)\s*=\s*(?:"\s*(?:javascript|data)\s*:[^"]*"|'\s*(?:javascript|data)\s*:[^']*'|(?:javascript|data)\s*:[^\s/>]+)/gi,
    '',
  )
  return s.trim()
}
