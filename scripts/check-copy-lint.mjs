#!/usr/bin/env node
// check-copy-lint.mjs — Copy-Lint ueber die Marketing-Quellen (RDG-Rollentrennung, ASCII-Umlaute,
// Code in Ueberschriften, doppelte Marke im Titel). Reine Quelltext-Pruefung, kein Netz.
//
//   node scripts/check-copy-lint.mjs             -> --warn (exit 0, listet alles)
//   node scripts/check-copy-lint.mjs --ratchet   -> blockt NEUE Verletzer-Files gegen scripts/copy-lint-baseline.json
//   node scripts/check-copy-lint.mjs --update-baseline
//
// Detektoren: scripts/lib/copy-lint-scan.mjs (unit-getestet). Herkunft: Copy-Audit 04.09.2026
// (docs/2026-09-04-copy-audit-marketingseiten.md).
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { scanRdg, scanUmlaute, scanTitleBrandTwice, scanAnrede, scanAnredeImperativ, scanAnredeGemischt } from './lib/copy-lint-scan.mjs'

const ROOT = process.cwd()
const ROOTS = ['claimondo-marketing', 'autounfall-io', 'kfz-gutachter-koeln', 'kfz-gutachter-duesseldorf', 'kfz-gutachter-bonn', 'kfz-gutachter-aachen', 'kfz-gutachter-wuppertal']
const SUBDIRS = ['app', 'components', 'lib', 'content', 'i18n', 'data', 'config']
const EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.mdx'])
const SKIP = /node_modules|[\\/]\.next[\\/]|\.test\.|__tests__|\.generated\.ts$|[\\/]public[\\/]|\.d\.ts$/
const BASELINE = join(ROOT, 'scripts', 'copy-lint-baseline.json')
const mode = process.argv.includes('--ratchet') ? 'ratchet' : process.argv.includes('--update-baseline') ? 'update' : 'warn'

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (SKIP.test(p)) continue
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (EXT.has(extname(p))) out.push(p)
  }
  return out
}

// Nutzersichtbare Strings je Zeile extrahieren: Literale in TS/TSX (Kommentare gestrippt), JSX-Text,
// JSON-Werte, Markdown-Volltext.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length))
}
function userStrings(file, src) {
  const ext = extname(file)
  const lines = []
  if (ext === '.md' || ext === '.mdx') { src.split('\n').forEach((l, i) => { if (!/^\s*(import|export|<[A-Za-z])/.test(l)) lines.push([i + 1, l]) }); return lines }
  if (ext === '.json') { src.split('\n').forEach((l, i) => { const m = l.match(/:\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$/); if (m) lines.push([i + 1, m[1].replace(/\\"/g, '"')]) }); return lines }
  const s = stripComments(src)
  s.split('\n').forEach((l, i) => {
    const parts = []
    for (const m of l.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) { const v = m[1] ?? m[2] ?? m[3]; if (v && v.length > 12 && /\s/.test(v)) parts.push(v) }
    for (const m of l.matchAll(/>([^<>{}]{12,})</g)) parts.push(m[1])
    if (parts.length) lines.push([i + 1, parts.join(' | ')])
  })
  return lines
}

// Einzeldateien mit nutzersichtbaren Texten ausserhalb der Marketing-Builds: die Blatt-Texte der
// Bildserie "Aus der Patsche" leben als String-Literale im Generator (Abnahme 05.09.: sonst sind die
// Blaetter fuer den Ratchet unsichtbar). Python-Literale werden wie TS/JS-Literale extrahiert.
// ⚠ `decoder-data.generated.ts` heisst generiert und ist es NICHT: ihr eigener Kopf sagt
// "Der Generator existiert nicht mehr … Dieses File IST die Quelle". Die SKIP-Regel oben wirft
// `*.generated.ts` aber raus — damit war ausgerechnet nutzersichtbarer Decoder-Text unbewacht.
// Gemessen 19.09.: zwei duzende Stellen darin, eine davon "Prüfe alle Posten, bevor Sie
// zustimmen." — Duzen und Siezen im selben Satz.
const EXTRA_FILES = ['docs/marketing/aus-der-patsche/generator.py', 'autounfall-io/content/decoder-data.generated.ts']
const SCAN_FILES = []
for (const r of ROOTS) for (const sd of SUBDIRS) SCAN_FILES.push(...walk(join(ROOT, r, sd)))
for (const e of EXTRA_FILES) { const p = join(ROOT, e); if (existsSync(p)) SCAN_FILES.push(p) }

// ── Die App (src/**) — NUR die Anrede-Achse ────────────────────────────────────────────────
// Am 06.09. wurden ~850 Du-Stellen im Portal auf Sie umgestellt (#5909/#5917/#5925/#5928).
// Noch am selben Tag kamen aus Release R478 zwei neue Du-Stellen zurueck (#5930) — die
// Umstellung war ein Einmalvorgang, die Drift laeuft weiter. Dieser Detektor existierte
// bereits fuer Marketing (#5899); er brauchte nur die Wurzel.
//
// ⚠ NUR die Anrede-Achse. Die Umlaut-Achse gilt hier NICHT: in `src/**` sind ASCII-Ersaetze
// in Log-Strings, Kommentaren und Bezeichnern ausdruecklich erlaubt (AGENTS.md, "Sprache &
// Zeichensatz" — die Pflicht gilt nur fuer nutzersichtbare Frontend-Texte). Wer sie hier
// mitlaufen liesse, faerbte den Ratchet mit tausenden gewollten Treffern rot.
// RDG und der Titel-Check bleiben ebenfalls Marketing-Themen.
const APP_SUBDIRS = ['app', 'components', 'lib', 'i18n']
const APP_FILES = []
for (const sd of APP_SUBDIRS) APP_FILES.push(...walk(join(ROOT, 'src', sd)))
const NUR_ANREDE = new Set(APP_FILES)
SCAN_FILES.push(...APP_FILES)

// Dateien, deren Texte ALS GANZES Anweisungen an ein Sprachmodell sind. Dort ist jedes "du"
// eine Anweisung ("Du recherchierst …", "wenn du die Ziffern lesen kannst") — ein "Sie" waere
// sinnentstellend. Die Text-Ausnahmen in copy-lint-scan.mjs greifen pro ZEILE und verfehlen
// die Fortsetzungszeilen eines mehrzeiligen Prompts; deshalb hier auf Dateiebene.
//
// ⚠ Bewusst KURZ und einzeln belegt, nicht "alles was nach Prompt aussieht". Beim Aufstellen
// stand `api/support/chat/route.ts` auf der Kandidatenliste — die Datei enthaelt aber neben
// dem Prompt auch ECHTE Nutzerausgaben ("Du hast heute bereits … eingereicht", "ich habe
// deinen Hinweis … gehaengt"). Eine pauschale Ausnahme haette genau die zwei Stellen
// versteckt, die das Gate finden soll. Sie steht deshalb in der Baseline, nicht hier.

// ── Wo die Imperativ-Achse laeuft ──────────────────────────────────────────────────────────
// Marketing komplett (dort ist Siezen unstrittig: autounfall-io steht 79:0, claimondo-marketing
// 1.395:13 fuer Sie). In `src/**` dagegen NUR dort, wo ein Kunde oder Geschaeftspartner hinsieht.
//
// ⚠ Die Einschraenkung ist eine ENTSCHEIDUNG, kein Messfehler: Aaron am 06.09.2026 — „ja die
// sollen beim du bleiben" fuer die internen Oberflaechen. Die Chat-Inbox sagt „Waehle einen Chat
// aus der Liste", das CalDav-Fenster „Waehle den Hauptkalender" — beides richtig so. Liefe die
// Achse flaechig ueber src/**, faerbte sie genau diese Stellen rot und drehte Aarons Entscheidung
// um, in bester Absicht. (Dieselbe Falle wie bei der Baseline, die am 06.09. deshalb durch eine
// Ausnahmeliste ersetzt wurde.)
//
// Das Support-Widget steht hier bewusst DRIN, obwohl Aaron es am 06.09. zu den internen zaehlte:
// seit dem 09.09. duerfen Makler, Werkstatt und Flotte es benutzen (#5936) — 100 der 135
// zugelassenen Nutzer sind seither Partner, keine Kollegen, und die Route siezt ihre fuenf
// Ausgaben seitdem ebenfalls. Sollte Aaron das Widget zurueck aufs Du stellen, gehoert dieser
// Pfad raus und die Route mit ihm — dann aber ALS GANZES, nicht halb.
const IMPERATIV_SRC_APP =
  /^src\/app\/(kunde|kunde-nps|kunde-termin|flow|upload|schaden|schaden-melden|unfallmeldung|start|g|gewinn|beratung|login|auth|passwort-[a-z]+|abmelden|partner-abmelden|wochenreport-abmelden|makler|werkstatt|flotte)\//
const IMPERATIV_SRC_KOMPONENTEN = /^src\/components\/(support|flow|kunde)\//

/** Laeuft die Imperativ-Achse fuer diese Datei? Marketing immer, src nur kundensichtbar. */
function imperativGeprueft(rel, nurAnrede) {
  if (!nurAnrede) return true
  return IMPERATIV_SRC_APP.test(rel) || IMPERATIV_SRC_KOMPONENTEN.test(rel)
}
const ANREDE_DATEI_AUSNAHMEN = [
  // (a) Anweisungen an ein Sprachmodell — "du" ist die Anrede an das MODELL
  /src\/lib\/wissen\/generate\.ts$/,          // "Du recherchierst …" — Artikel-Prompt
  /src\/lib\/lokalinhalt\/generate\.ts$/,     // "Du recherchierst hyperlokale Fakten …"
  /src\/lib\/bkat\/inference\.ts$/,           // "Setze … NUR wenn du die Ziffern lesen kannst"
  /src\/lib\/werkstatt\/copilot-prompt\.ts$/, // Werkstatt-Copilot, reiner Prompt
  /src\/lib\/faq-bot\/off-topic-guard\.ts$/,  // Erkennungsmuster "bist du eine ki" — Umstellen macht den Guard BLIND
  // Der Support-Prompt. Sein "du" ist durchgehend die Anrede an das MODELL ("Du sprichst …",
  // "Bevor du aufrufst …") — die Anweisung, wie es den NUTZER anspricht, lautet seit dem
  // 19.09.2026 "sieze durchgehend" (Aaron). Heute sieht das Gate die Datei ohnehin nicht,
  // weil `userStrings` mehrzeilige Template-Literale nicht erfasst; der Eintrag macht die
  // Absicht fest, bevor jemand den Extraktor erweitert und 11 Fehltreffer erntet.
  /src\/lib\/support\/system-prompt\.ts$/,
  // Werkzeugbeschreibung fuer KI-Agenten, die die oeffentliche API aufrufen: "NACHDEM du dem
  // Nutzer erklaert hast …", "Du vermittelst Gutachter + Termin". Adressat ist der Agent, nicht
  // der Endkunde — der bekommt seinen Text aus dem FlowLink.
  /src\/app\/api\/v1\/openapi\.json\/route\.ts$/,

  // (b) INTERNE Portale — Aaron 06.09.2026 auf die Frage, ob sie mitziehen sollen: "ja die
  // sollen beim du bleiben". Das ist eine ENTSCHEIDUNG, keine Restschuld: hier steht nichts
  // zum Aufraeumen. Wer eine dieser Dateien "nachbessert", dreht Aarons Entscheidung um.
  /src\/app\/admin\/einstellungen\/google\/GoogleSettingsClient\.tsx$/, // "Verbinde dein Google Konto"
  /src\/app\/admin\/marketing\/content-studio\/ContentStudioClient\.tsx$/,
  /src\/app\/admin\/meine-tasks\/MyTasksClient\.tsx$/,
  // ⚠ `src/app/api/support/chat/route.ts` stand hier und ist am 06.09. wieder RAUS.
  // Die Begruendung war falsch: "genutzt von admin 22x, SV 2x, von keinem Kunden" misst, wer es
  // BISHER benutzt hat — nicht, wer es KANN. Nachgesehen: `<SupportButton>` wird gerendert in
  // KundeMobileDrawer, FlotteManagerShell, MaklerShell, WerkstattShell und PortalUserFooter.
  // Kunden und Partner kommen also sehr wohl heran; der Kommentar im Routen-Kopf
  // ("laeuft nur im internen Portal") ist veraltet. Die Datei steht in der Baseline, bis die
  // Zugangsfrage entschieden ist — siehe [[audit-support-widget-kunden-sehen-den-bugtracker]].
]

const findings = [] // {file, line, code, match}
for (const f of SCAN_FILES) {
  const rel = relative(ROOT, f).replace(/\\/g, '/')
  let src
  try { src = readFileSync(f, 'utf8') } catch { continue }
  const isI18n = /i18n\/messages\/[a-z]{2}\.json$/.test(rel)
  // `content/claimondo/_translations/<locale>/…` sind die Fremdsprach-Fassungen. Dort ist
  // "du" polnisch, tuerkisch oder russisch — der Anrede-Detektor wuerde fremde Sprachen
  // als deutsches Duzen melden. RDG und Umlaut gelten dort ebenfalls nicht.
  const isUebersetzung = /content\/claimondo\/_translations\//.test(rel)
  const isGerman = (!isI18n || /\/de\.json$/.test(rel)) && !isUebersetzung
  // src/** laeuft nur auf der Anrede-Achse (Begruendung oben bei APP_SUBDIRS).
  const nurAnrede = NUR_ANREDE.has(f)
  for (const [line, text] of userStrings(f, src)) {
    if (isGerman && !nurAnrede) for (const h of scanRdg(text)) findings.push({ file: rel, line, code: 'rdg:' + h.code, match: h.match })
    if (isGerman && !nurAnrede && !/\.md$/.test(rel)) for (const w of scanUmlaute(text)) findings.push({ file: rel, line, code: 'umlaut', match: w })
    // Anrede: die Seite siezt ueberall (Aaron 06.09.). Nur Deutsch — die 5 uebrigen Locales
    // haben eigene Hoeflichkeitsformen, und "du" ist dort teils ein anderes Wort.
    // ⚠ `.json` ist ausgenommen: das sind DATEN, keine Ansprache. Konkret meldete
    // `stadt-verkehrsmengen.json` die Messstelle "DU Beeckerwerth" — Duisburg, kein Duzen.
    // Die Kennzeichen-Ausnahme in der Liste trifft den Satz nachweislich, greift an dieser
    // Aufrufstelle aber nicht; statt den Einzelfall zu flicken ist die ganze Dateiart raus.
    if (isGerman && !/\.json$/.test(rel) && !ANREDE_DATEI_AUSNAHMEN.some((a) => a.test(rel))) for (const w of scanAnrede(text)) findings.push({ file: rel, line, code: 'anrede-du', match: w })
    // Zweite Achse: Befehlsform ohne Pronomen ("Beschreibe das Problem"). Sie laeuft nur auf
    // kundensichtbaren Flaechen — intern bleibt das Du (Aaron 06.09.), s. imperativGeprueft.
    if (isGerman && !/\.json$/.test(rel) && imperativGeprueft(rel, nurAnrede) && !ANREDE_DATEI_AUSNAHMEN.some((a) => a.test(rel))) for (const w of scanAnredeImperativ(text)) findings.push({ file: rel, line, code: 'anrede-imperativ', match: w })
    // Dritte Anrede-Achse: Sie UND Du im SELBEN Satz. Laeuft BEWUSST auch auf `.json` —
    // der pauschale JSON-Ausschluss zwei Zeilen hoeher ist fuer DATEN-JSONs gedacht
    // ("DU Beeckerwerth") und nimmt dabei `src/i18n/messages/de.json` mit, wo die meisten
    // nutzersichtbaren Texte der App stehen. Eine Mischung ist dort immer ein Fehler,
    // auch auf Flaechen, die bewusst duzen — deshalb ist diese Achse hier sicher.
    if (isGerman && !ANREDE_DATEI_AUSNAHMEN.some((a) => a.test(rel))) for (const w of scanAnredeGemischt(text)) findings.push({ file: rel, line, code: 'anrede-gemischt', match: w })
    if (!nurAnrede && (/title/i.test(text) || /\|\s*Claimondo/.test(text))) if (scanTitleBrandTwice(text)) findings.push({ file: rel, line, code: 'title-brand-twice', match: text.slice(0, 80) })
  }
}

const byFile = {}
for (const f of findings) (byFile[f.file] ??= []).push(f)
const files = Object.keys(byFile).sort()
for (const file of files) { console.log(file); for (const f of byFile[file].slice(0, 12)) console.log(`  L${f.line} [${f.code}] ${f.match}`); if (byFile[file].length > 12) console.log(`  … +${byFile[file].length - 12}`) }
console.log(`\ncopy-lint: ${findings.length} Treffer in ${files.length} Files (RDG: ${findings.filter(f => f.code.startsWith('rdg')).length}, Umlaut: ${findings.filter(f => f.code === 'umlaut').length}, Titel: ${findings.filter(f => f.code === 'title-brand-twice').length}, Anrede-Du: ${findings.filter(f => f.code === 'anrede-du').length}, Anrede-Imperativ: ${findings.filter(f => f.code === 'anrede-imperativ').length}, Anrede-gemischt: ${findings.filter(f => f.code === 'anrede-gemischt').length})`)

if (mode === 'update') { writeFileSync(BASELINE, JSON.stringify({ files }, null, 2) + '\n'); console.log(`Baseline geschrieben: ${files.length} Files`); process.exit(0) }
if (mode === 'ratchet') {
  const base = existsSync(BASELINE) ? new Set(JSON.parse(readFileSync(BASELINE, 'utf8')).files) : new Set()
  const neu = files.filter((f) => !base.has(f))
  const rdgFiles = [...new Set(findings.filter((f) => f.code.startsWith('rdg')).map((f) => f.file))]
  if (rdgFiles.length) { console.error(`\n✗ RDG-Verstoesse (Baseline 0): ${rdgFiles.join(', ')}`); process.exit(1) }
  if (neu.length) { console.error(`\n✗ NEUE Copy-Lint-Verletzer-Files (nicht in Baseline): ${neu.join(', ')}`); process.exit(1) }
  console.log('✓ copy-lint ratchet ok')
}
