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

// ── Zweite Anrede-Achse: der Imperativ OHNE Pronomen ──────────────────────────────────────
// ANREDE_DU sucht PRONOMEN. Eine Befehlsform braucht keines: "Beschreibe das Problem" duzt,
// enthaelt aber weder du noch dein. Der Detektor kann sie per Konstruktion nicht sehen.
//
// Gemessen 19.09.2026, nachdem die Luecke ZWEIMAL real zugeschlagen hatte: 10 Stellen, alle
// in siezender Umgebung, zwei davon im selben Satz gemischt —
//   "Pruefe alle Posten, bevor Sie zustimmen."   (autounfall-io, Decoder-Antwort)
//   "…greift in der Regel Ihre Kaskoversicherung. Pruefe vorher, …"
// Der Pronomen-Detektor liest dort das "Sie" und meldet gruen.
//
// ⚠ DIE VERBLISTE IST KURATIERT, NICHT VOLLSTAENDIG. Eine breite Liste erzeugte in der
// Vorab-Messung 6 Fehltreffer auf 8 Stichproben — drei Quellen, alle real:
//   1. LADEZUSTAND:  "Sende…" / "Melde…" auf einem Knopf ist 1. Person, kein Befehl.
//   2. SUBSTANTIV:   "Erschuetterungs-Versuche", "die Suche", "die Fuelle", "die Trage".
//   3. KOMPOSITUM:   "Online-Melde-Pfad" — der Bindestrich IST eine Wortgrenze.
// Deshalb fehlen Sende/Melde/Warte/Starte (1) und Versuche/Suche/Fuelle/Trage/Schau/Buche/
// Lade (2) bewusst; der Lookahead deckt (1) und (3) zusaetzlich ab. Lieber ein paar echte
// Stellen nicht sehen als die Flotte mit Fehltreffern rot faerben.
//
// ⚠ BEKANNTE GRENZE, dokumentiert statt versteckt: nur GROSSgeschriebene Formen, also der
// Satzanfang. "…, und fordere ihn erneut an" (klein, nach Komma) wird nicht erkannt — das
// liesse sich von "ich fordere" nicht sauber trennen. Genau so ein Halbsatz stand im
// 2FA-Bildschirm; gefunden wurde er ueber die GROSSE Form im selben Satz ("Pruefe, …").
const ANREDE_IMPERATIV_VERBEN = [
  'Beschreibe', 'Wähle', 'Klicke', 'Vergiss', 'Beachte', 'Prüfe', 'Öffne',
  'Gib', 'Nimm', 'Mach', 'Lies', 'Bestätige', 'Nutze', 'Verwende',
  'Kontaktiere', 'Erstelle', 'Ändere', 'Speichere',
]
// ⚠ KEIN \b an den Raendern. `\b` ist eine ASCII-Wortgrenze, und Ö/Ä/Ü zaehlen dort nicht als
// Wortzeichen — "Öffne" und "Ändere" waeren damit STUMM geblieben. Beim Selbsttest aufgefallen
// (10/12 statt 12/12): ein Gate, das zwei seiner achtzehn Verben nie sieht, meldet gruen und
// bewacht sie trotzdem nicht. Die Zeichenklassen unten schliessen Umlaute ausdruecklich ein.
// ── Dritte Achse: die APOKOPIERTE Befehlsform ("korrigier" statt "korrigiere") ────────────
// Die Liste oben faengt nur GROSSgeschriebene Vollformen am Satzanfang — eine dokumentierte
// Grenze, weil sich "fordere" (Befehl) und "ich fordere" (1. Person) sonst nicht trennen
// lassen. Genau durch diese Luecke fielen am 21.09.2026 DREI kundensichtbare Stellen, alle
// mitten im Satz, alle mit Sie und Du GEMISCHT:
//
//   "Bitte pruefen Sie und korrigier Ihre Daten."                      (i18n de.json)
//   "…hat Ihren Vorgang vorbereitet. Bitte pruef die Angaben und unterschreib …"
//                                                                      (Signatur-Flow)
//   "…schickt Ihnen die Vollmacht per WhatsApp. Bitte unterschreib sie dort …"  (Vollmacht)
//
// WARUM DIESE ACHSE SICHER IST, wo die Vollform es nicht war: Die verkuerzte Form ist
// EINDEUTIG Imperativ. Es gibt kein "ich korrigier", "ich pruef", "ich unterschreib" —
// die 1. Person Singular traegt das -e zwingend. Deshalb darf hier auch klein und mitten
// im Satz gesucht werden, was bei der Vollform gerade nicht geht.
//
// Vorab gemessen ueber alle gescannten Wurzeln (claimondo-marketing, autounfall-io,
// src/{app,components,lib,i18n}): exakt die drei Stellen oben, KEIN Fehltreffer. Die
// einzige weitere Fundstelle lag in einer Testdatei und faellt bereits durch SKIP.
//
// ⚠ Der Bindestrich gehoert in den Lookahead: "Pruef-Protokoll" ist ein Kompositum, kein
// Befehl — und eine ASCII-Wortgrenze wuerde ihn nicht abfangen (derselbe Grund wie unten).
const ANREDE_IMPERATIV_STAEMME = [
  'korrigier', 'prüf', 'änder', 'beschreib', 'bestätig', 'kontaktier',
  'erstell', 'verwend', 'wähl', 'nutz', 'unterschreib',
]
// ⚠ 'speicher' fehlt mit Absicht: "der Speicher" ist ein Substantiv. In der Vorab-Messung
// schlug es in der Datenschutzerklaerung an — ein Fehltreffer, der die Flotte rot gefaerbt
// haette. Dieselbe Sorgfalt wie bei der Vollform-Liste weiter unten.
const ANREDE_IMPERATIV_KURZ = new RegExp(
  '(?<![A-Za-zÄÖÜäöüß])(' + ANREDE_IMPERATIV_STAEMME.join('|') +
    ')(?![A-Za-zÄÖÜäöüß-])',
  'gi',
)

const ANREDE_IMPERATIV = new RegExp(
  '(?<![A-Za-zÄÖÜäöüß])(' + ANREDE_IMPERATIV_VERBEN.join('|') +
    ')(?![A-Za-zÄÖÜäöüß])(?!\\s*[-–—…]|\\s*\\.\\.\\.|\\s+Sie\\b)',
  'g',
)

const SIE_FORM = /(?<![A-Za-zÄÖÜäöüß])(Sie|Ihre|Ihren|Ihrem|Ihrer|Ihnen|Ihr)(?![A-Za-zÄÖÜäöüß])/

/**
 * GEMISCHTE Anrede: eine Sie-Form und eine duzende Befehlsform im SELBEN Text.
 *
 * Diese Achse existiert, weil die beiden anderen an `src/i18n/messages/de.json` nicht
 * herankommen — der Aufrufer nimmt `.json` pauschal aus (Begruendung dort: eine DATEN-JSON
 * meldete die Messstelle "DU Beeckerwerth" als Duzen). Der Ausschluss ist fuer Daten richtig
 * und fuer die SPRACH-Datei falsch: dort stehen die meisten nutzersichtbaren Texte der App.
 *
 * Warum sie trotzdem sicher auf i18n laufen darf, wo `scanAnrede` es nicht duerfte: In den
 * Messages stehen AUCH interne Portaltexte, und die duzen bewusst (Aaron 06.09.). Ein
 * einzelnes "du" ist dort also kein Befund. Ein Satz, der Sie UND Du mischt, ist dagegen
 * IMMER falsch — unabhaengig davon, fuer welche Flaeche er gedacht ist. Genau diese
 * Schnittmenge prueft diese Funktion, und nur sie.
 *
 * Gemessen 21.09.2026, alle drei kundensichtbar und seit dem 06.09. live:
 *   de.json          "Bitte pruefen Sie und korrigier Ihre Daten."
 *   Signatur-Flow    "…hat Ihren Vorgang vorbereitet. Bitte pruef die Angaben und unterschreib …"
 *   de.json          "…schickt Ihnen die Vollmacht … Bitte unterschreib sie dort …"
 *
 * @returns {string[]} die gefundenen Befehlsformen (leer = keine Mischung)
 */
export function scanAnredeGemischt(text) {
  if (!text) return []
  for (const aus of ANREDE_AUSNAHMEN) if (aus.test(text)) return []
  for (const aus of ANREDE_KONTEXT_AUSNAHMEN) if (aus.test(text)) return []
  if (!SIE_FORM.test(text)) return []
  return [...new Set(text.match(ANREDE_IMPERATIV_KURZ) || [])]
}

/**
 * Duzende Befehlsform ohne Pronomen in einem nutzersichtbaren Text.
 * Ergaenzt scanAnrede um die Achse, die dort per Konstruktion fehlt.
 * @returns {string[]} die gefundenen Formen (leer = keine)
 */
export function scanAnredeImperativ(text) {
  if (!text) return []
  for (const aus of ANREDE_AUSNAHMEN) if (aus.test(text)) return []
  for (const aus of ANREDE_KONTEXT_AUSNAHMEN) if (aus.test(text)) return []
  return [...new Set([
    ...(text.match(ANREDE_IMPERATIV) || []),
    ...(text.match(ANREDE_IMPERATIV_KURZ) || []),
  ])]
}

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
