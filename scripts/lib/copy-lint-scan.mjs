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

// ---------------------------------------------------------------------------------------------
// 5. Anrede — die Seite siezt. Ueberall.
//
// Aaron 06.09.2026: "das soll auf Sie bleiben. Weil wenn das auch Du ist, haben wir meistens die
// Schwierigkeit, dass sich einheitlich ist. Also es soll die einheitliche Ansprache."
//
// Vorgeschichte: 942 Du-Formen in 65 Content-Markdowns, waehrend Formulare, CTAs und
// Bestaetigungen durchgehend siezten. Wer ueber "Ihre Telefonnummer" in einen Ratgeber mit
// "dein Auto" kam, las zwei Absender. Umgestellt in #5899 — dieser Detektor haelt es so.
//
// ⚠ NUR DEUTSCH. "du" ist auch Franzoesisch ("chef du service") und in tuerkischen Texten
// haeufig; die 5 Fremdsprach-Locales haben eigene Hoeflichkeitsformen und werden vom
// Aufrufer (check-copy-lint.mjs) ohnehin nur fuer de.json geprueft.
//
// ⚠ NICHT geflaggt werden: Code-Bezeichner (`const dir = …`), Kommentare (strippt der
// Aufrufer), Dateipfade und die Wortteile in "Individuum", "Reduktion" — die Wortgrenze
// allein reicht dafuer nicht, deshalb die Ausschluesse unten.

const ANREDE_DU = /\b(du|dir|dich|dein|deine|deinem|deinen|deiner|deines)\b/gi

// Stellen, an denen dieselbe Buchstabenfolge kein deutsches Duzen ist.
const ANREDE_AUSNAHMEN = [
  /\bchef\s+du\b/i,          // franzoesisch
  /\bdu\s+jour\b/i,          // franzoesisch
  /\bcode\s+du\b/i,
  /\bdir\s*[=:)\]]/,         // Code: dir = …, dir: …, dir)
  /\b(const|let|var|function|import|export)\s+\w*dir\b/,
  /\bdirname\b|\breaddir\b|\bmkdir\b|\brmdir\b|\bdir\/|\/dir\b/i,
  // Kfz-Kennzeichen und Ortsteile: "DU Beeckerwerth" ist Duisburg, kein Duzen.
  /(DU|DD|DO|DA|HD|KA)\s+[A-ZÄÖÜ][a-zäöüß]/,
]

/**
 * Deutsche Du-Anrede in einem nutzersichtbaren Text.
 * @returns {string[]} die gefundenen Formen (leer = siezt)
 */
// ⚠ ZWEI STELLEN, an denen "du" KEINE Anrede an den Leser ist. Beide gemeldet von der
// Abnahme-Session am 06.09., beide in src/** (dort scannt dieser Detektor heute nicht —
// die Ausnahmen stehen trotzdem schon hier, damit sie nicht fehlen, sobald jemand die
// Wurzeln erweitert):
//
//   1. PROMPTS AN DAS MODELL. "Du schreibst einen Wissens-Artikel" (lib/wissen/generate.ts)
//      ist eine Anweisung, keine Kundenansprache. "Sie schreiben" waere sinnentstellend.
//
//   2. ERKENNUNGSMUSTER FUER NUTZEREINGABEN. In lib/faq-bot/off-topic-guard.ts steht
//      "bist du eine ki" als Muster, das eine Frage ERKENNEN soll — nicht als Ausgabe.
//      Wer das auf Sie umstellt, macht den Guard fuer genau die Frage blind, die er
//      abfangen soll. Ein stiller Ausfall: die Antwort daneben siezt korrekt weiter,
//      also faellt nichts auf.
const ANREDE_KONTEXT_AUSNAHMEN = [
  // Prompt-Rollen und -Anweisungen an ein Modell
  /\b(prompt|system[_ ]?(prompt|message)|anweisung|instruction)\b/i,
  /\bDu (bist|schreibst|antwortest|formulierst|erstellst|erhaeltst|erhältst) /,
  // Erkennungsmuster: Listen von Nutzer-Eingaben, gegen die geprueft wird
  /\b(muster|pattern|keywords?|erkennung|matche?[sn]?|includes|test\()\b/i,
]

export function scanAnrede(text) {
  if (!text) return []
  for (const aus of ANREDE_AUSNAHMEN) if (aus.test(text)) return []
  for (const aus of ANREDE_KONTEXT_AUSNAHMEN) if (aus.test(text)) return []
  return [...new Set((text.match(ANREDE_DU) || []).map((w) => w.toLowerCase()))]
}
