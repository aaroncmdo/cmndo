// scripts/lib/copy-lint-scan.mjs — pure Detektoren fuer das Copy-Lint-Gate (kein I/O).
//
// Herkunft: Copy-Audit aller Marketingseiten, 04.09.2026
// (docs/2026-09-04-copy-audit-marketingseiten.md). Vier Klassen, die dort real
// gefunden wurden und die kein Build/tsc/anderer Ratchet sieht:
//
//   1. RDG-Rollentrennung — "wir verhandeln/setzen durch/holen zurueck/klagen",
//      "unser Anwalt", "Claimondo setzt ... durch". Claimondo koordiniert;
//      verhandeln tut ausschliesslich "unsere Partnerkanzlei" (Aaron 31.05.2026).
//      Die Verstoesse sassen in TS-Konstanten, Komponenten-Defaults und
//      Seiten-Dateien — nicht in de.json, weshalb der Text-Audit vom 23.08. sie
//      als "durchgehalten" gemeldet hatte.
//   2. ASCII-Umlaute in nutzersichtbaren Strings (AGENTS.md Umlaut-Pflicht).
//   3. Code in Ueberschriften — rohes HTML (`<a name="x"></a>` in 20 Cornerstone-H2),
//      Entities, Template-Platzhalter, i18n-Keys, internes Suchvolumen ("SV/Mo").
//   4. Marke doppelt im Titel ("| Claimondo | Claimondo").
//
// Bewusst schmal und praezise: jedes Muster ist am Bestand nachgemessen, die
// Negativfaelle (Partnerkanzlei-Saetze, "Wir koordinieren", Cookie-"setzen wir ein",
// Domains wie app.claimondo.de) sind als Unit-Tests verankert.

export const RDG_PATTERNS = [
  ['wir_rechtsverb', /\b[Ww]ir\s+(verhandeln|klagen|fordern|erstreiten|erkämpfen|erzwingen|vertreten\s+Sie)\b/],
  ['wir_setzen_durch', /\b[Ww]ir\s+setzen\b[^.!?\n]{0,80}\bdurch\b/],
  // "holen … ein" nur mit Geld-/Versicherungsobjekt — "Angebote aus dem Markt einholen" ist keine Rechtsdurchsetzung.
  ['wir_holen', /\b[Ww]ir\s+holen\b[^.!?\n]{0,80}\bzurück\b|\b[Ww]ir\s+holen\b[^.!?\n]{0,80}\b(\w*[Kk]osten|Kürzung\w*|Erstattung|Geld|Betrag|Anspr\w+|Versicherung|Maximum|Honorar\w*|Schaden\w*)\b[^.!?\n]{0,60}\b(ein|heraus|raus)\b/],
  ['wir_fuehren_verhandlung', /\b[Ww]ir\s+führen\b[^.!?\n]{0,80}\b(Verhandlung|Verhandlungen|Gespräch|Gespräche)\b/],
  ['wir_machen_geltend', /\b[Ww]ir\s+machen\b[^.!?\n]{0,60}\bgeltend\b/],
  ['nachgestellt', /\b(verhandeln|klagen|fordern|erstreiten)\s+wir\b|\bsetzen\s+wir\b[^.!?\n]{0,60}\bdurch\b|\bholen\s+wir\b[^.!?\n]{0,60}\bzurück\b|\bholen\s+wir\b[^.!?\n]{0,60}\b(\w*[Kk]osten|Kürzung\w*|Erstattung|Geld|Betrag|Anspr\w+|Versicherung|Maximum|Honorar\w*)\b[^.!?\n]{0,60}\bein\b/],
  ['unser_anwalt', /\bunser(e|em|en|er)?\s+(Anwalt|Anwälte|Anwälten|Rechtsanwalt|Rechtsanwälte|Rechtsanwälten)\b/i],
  // Verb-Reihung nach Komma: "Wir disponieren …, führen die Verhandlung und setzen … durch" — das
  // Subjekt "Wir" steht weit vorn, die Rechtsverben folgen erst nach dem Komma (B2C-Durchgang 05.09.).
  ['wir_reihung', /\b[Ww]ir\b[^.!?\n]{0,120},\s*[^.!?\n]{0,60}\b(setzen\b[^.!?\n]{0,60}\bdurch|führen\b[^.!?\n]{0,40}\bVerhandlung|verhandeln|klagen|holen\b[^.!?\n]{0,40}\bzurück)\b/],
  ['claimondo_rechtsverb', /\bClaimondo\s+(setzt\b[^.!?\n]{0,80}\bdurch|verhandelt|klagt|fordert|holt\b[^.!?\n]{0,60}\b(zurück|ein|raus))\b/],
]

/** @returns {{code:string, match:string}[]} */
export function scanRdg(text) {
  const hits = []
  for (const [code, re] of RDG_PATTERNS) {
    const m = text.match(re)
    if (m) hits.push({ code, match: m[0] })
  }
  return hits
}

export const UMLAUT_ASCII = /\b(fuer|ueber|koennen|muessen|waehrend|naechste[nrs]?|schaeden|faelle|zurueck|pruefen|pruefung|erklaert|hoehe|groesse|moeglich\w*|verfuegbar\w*|kuerzung(en)?|waehlen|ausserdem|grosse[nrs]?|unfaelle)\b/gi

/** @returns {string[]} eindeutige ASCII-Ersatzwoerter (kleingeschrieben) */
export function scanUmlaute(text) {
  return [...new Set((text.match(UMLAUT_ASCII) || []).map((s) => s.toLowerCase()))]
}

const TLD = /\.(de|io|com|net|org|eu|txt|json|xml|png|jpg|webp|svg|pdf|js|ts|tsx|md|html|css|mjs)$/i

/** true, wenn ein Heading-Text nach Code/Markup/Metadaten aussieht. */
export function scanHeadingCode(headingText) {
  if (!headingText) return false
  if (/<\/?[a-z][a-z0-9-]*(\s[^>]*)?>/i.test(headingText)) return true // rohes Tag
  if (/&(amp|lt|gt|quot|nbsp);/i.test(headingText)) return true // Entity doppelt kodiert
  if (/\{\{[^}]*\}\}|\$\{|\{[a-zA-Z_]+\}/.test(headingText)) return true // Platzhalter
  if (/\bSV\/Mo\b/.test(headingText)) return true // internes Suchvolumen
  const dotted = headingText.match(/\b[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}\b/g) || []
  if (dotted.some((k) => !TLD.test(k))) return true // i18n-Key wie home.hero.title
  return false
}

/** true, wenn der Seitentitel die Marke zweimal traegt. */
export function scanTitleBrandTwice(title) {
  return /\|\s*Claimondo\s*\|\s*Claimondo/i.test(title || '')
}
