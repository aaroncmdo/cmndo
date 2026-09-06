#!/usr/bin/env node
// Übersetzt die Content-Markdowns (Ratgeber, Fachtexte, Decoder) in die fünf Zielsprachen.
//
// WARUM ES DAS BRAUCHT: `translate.mjs` deckt die JSON-Messages ab — dort sind alle 2116
// Keys in allen sechs Sprachen vollständig. Die Markdown-INHALTE hat es nie angefasst.
// Gemessen 06.09.2026: von 95 deutschen Texten sind **3** übersetzt, je Sprache. Die
// übrigen 92 fallen über `localizeAsset()` auf den deutschen Body zurück (`translated:
// false`, Caller zeigt den MdxLanguageBanner) — ein türkischer Besucher liest also
// deutschen Fließtext unter türkischer Navigation.
//
// Dieselbe Klasse wie der Kommentar in translate.mjs beschreibt ("ZWEI Message-Baeume"),
// nur eine Ebene weiter: es gibt ZWEI Inhaltsarten, und nur eine war abgedeckt.
//
//   node scripts/i18n/translate-content.mjs                      alle Sprachen, fehlende
//   node scripts/i18n/translate-content.mjs en tr                nur diese Sprachen
//   node scripts/i18n/translate-content.mjs --nur=ratgeber       nur passende Dateien
//   node scripts/i18n/translate-content.mjs --force              auch vorhandene neu
//   node scripts/i18n/translate-content.mjs --trocken            nur zeigen, was liefe
//
// Setzt ANTHROPIC_API_KEY voraus (claimondo-marketing/.env.local).

import Anthropic from '@anthropic-ai/sdk'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WURZEL = path.resolve(__dirname, '../..')
const CONTENT = path.join(WURZEL, 'claimondo-marketing/content/claimondo')
const GLOSSAR = path.join(__dirname, 'glossary.md')

const SPRACHEN = ['en', 'tr', 'pl', 'ru', 'ar']
const SPRACHNAMEN = {
  en: 'English',
  tr: 'Turkish (Türkçe)',
  pl: 'Polish (Polski)',
  ru: 'Russian (Русский)',
  ar: 'Arabic (العربية)',
}

// Dasselbe Modell wie die JSON-Pipeline — erprobt auf diesen Texten und diesem Glossar.
const MODELL = process.env.I18N_MODELL ?? 'claude-sonnet-4-6'
// Die längste Datei hat 5.402 Wörter (~8.600 Token); die Übersetzung ist ähnlich lang.
// 8.000 wie in der JSON-Pipeline wäre dort zu knapp — dann käme ein abgeschnittener Text
// zurück, und ohne stop_reason-Prüfung würde er als vollständige Übersetzung gespeichert.
const MAX_TOKENS = 16000

const args = process.argv.slice(2)
const force = args.includes('--force')
const trocken = args.includes('--trocken')
const nurArg = args.find((a) => a.startsWith('--nur='))
const nurMuster = nurArg ? nurArg.slice('--nur='.length) : null
const zielSprachen = args.filter((a) => SPRACHEN.includes(a))
const ziele = zielSprachen.length ? zielSprachen : SPRACHEN

/** Frontmatter und Body trennen. Bewusst simpel: die Dateien beginnen alle mit `---`. */
function trenne(inhalt) {
  const m = inhalt.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { frontmatter: '', body: inhalt }
  return { frontmatter: m[1], body: m[2] }
}

/** Alle deutschen Content-Dateien, relativ zu CONTENT. */
function deutscheDateien() {
  const out = []
  const gehe = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === '_translations') continue
        gehe(p)
      } else if (e.name.endsWith('.md')) {
        out.push(path.relative(CONTENT, p).split(path.sep).join('/'))
      }
    }
  }
  gehe(CONTENT)
  return out.sort()
}

const glossar = fs.readFileSync(GLOSSAR, 'utf8')

function anweisung(sprache) {
  return `Du übersetzt juristische Verbraucher-Inhalte einer deutschen Kfz-Schadenplattform nach ${SPRACHNAMEN[sprache]}.

${glossar}

REGELN FÜR DIESE MARKDOWN-DATEIEN:

1. ANREDE: durchgehend die höfliche Form der Zielsprache (Englisch: neutrales "you";
   Türkisch: siz; Polnisch: großgeschriebenes Ty/Twój; Russisch: Вы; Arabisch: respektvolle
   Standardanrede). NIEMALS die vertrauliche Form. Die deutschen Originale siezen.

2. ROLLENTRENNUNG (rechtlich bindend): Claimondo koordiniert, kommuniziert und rechnet ab.
   Verhandeln, durchsetzen, klagen, Geld zurückholen tut ausschließlich "unsere
   Partnerkanzlei" (übersetze das als "our partner law firm" o. ä.). Wenn im Original
   "unsere Partnerkanzlei" das Subjekt ist, MUSS es das in der Übersetzung bleiben.
   Mache niemals Claimondo oder "wir" zum Subjekt eines Rechtsdurchsetzungs-Verbs.

3. DEUTSCHE RECHTSBEGRIFFE bleiben deutsch, mit kurzer Erklärung in Klammern beim ersten
   Vorkommen: Nutzungsausfall, Wertminderung, Restwert, Wiederbeschaffungswert,
   Sicherungsabtretung, Gutachten, Sachverständiger, Werkstattbindung, Kaskoversicherung.
   Paragraphen bleiben exakt: "§ 249 BGB", "BGH VI ZR 38/22", "§ 115 VVG".

4. MARKDOWN-STRUKTUR exakt erhalten: Überschriften-Ebenen, Listen, Tabellen, Fettungen,
   Zeilenumbrüche, Links. Anker in der Form {#anker} am Ende einer Überschrift bleiben
   UNVERÄNDERT stehen — interne Sprungmarken hängen daran.
   Interne Links (/haftpflicht/…, /decoder/…) NICHT übersetzen.

5. ZAHLEN, Beträge, Fristen und Prozentangaben exakt übernehmen. Keine Umrechnung.

6. Gib NUR den übersetzten Markdown-Body zurück, ohne Vorrede, ohne Code-Zaun.`
}

const client = new Anthropic()

async function uebersetze(body, sprache) {
  const antwort = await client.messages.create({
    model: MODELL,
    max_tokens: MAX_TOKENS,
    system: anweisung(sprache),
    messages: [{ role: 'user', content: body }],
  })
  // ⚠ AGENTS.md: stop_reason VOR dem Auslesen prüfen. Reißt die Antwort das Limit, kommt
  // ein abgeschnittener Text zurück — ohne Fehler. Der landete sonst als "Übersetzung"
  // in der Datei, und niemand sähe es, weil eine halbe Seite Türkisch aussieht wie eine
  // ganze.
  if (antwort.stop_reason === 'max_tokens') {
    return { ok: false, fehler: `abgeschnitten (max_tokens ${MAX_TOKENS})` }
  }
  const text = antwort.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
  if (!text) return { ok: false, fehler: 'leere Antwort' }
  return { ok: true, text, ein: antwort.usage.input_tokens, aus: antwort.usage.output_tokens }
}

const dateien = deutscheDateien().filter((d) => !nurMuster || d.includes(nurMuster))

// Aufgabenliste ueber ALLE Sprachen, damit die Parallelitaet gleichmaessig laeuft und
// nicht am Ende einer Sprache leerlaeuft.
const aufgaben = []
for (const sprache of ziele) {
  for (const rel of dateien) {
    const ziel = path.join(CONTENT, '_translations', sprache, rel)
    if (!force && fs.existsSync(ziel)) continue
    aufgaben.push({ sprache, rel, ziel })
  }
}
const uebersprungen = ziele.length * dateien.length - aufgaben.length

// Vier gleichzeitig: 460 Dateien in gut einer halben Stunde statt zweieinhalb, und weit
// unter jedem Rate-Limit. Hoeher zu gehen bringt wenig — die Laufzeit haengt an den
// wenigen grossen Dateien, nicht an der Anzahl.
const PARALLEL = Number(process.env.I18N_PARALLEL ?? 4)

console.log(
  `[content-i18n] ${dateien.length} Dateien x ${ziele.length} Sprachen = ${aufgaben.length} zu uebersetzen ` +
  `(${uebersprungen} vorhanden) - Modell ${MODELL}${force ? ' (force)' : ''}${trocken ? ' - TROCKENLAUF' : ''}`,
)

let gemacht = 0
let fehler = 0
let tokenEin = 0
let tokenAus = 0
let naechste = 0

async function arbeiter() {
  while (naechste < aufgaben.length) {
    const { sprache, rel, ziel } = aufgaben[naechste++]
    const { frontmatter, body } = trenne(fs.readFileSync(path.join(CONTENT, rel), 'utf8'))
    if (trocken) {
      console.log(`  [${sprache}] ${rel} (${body.split(/\s+/).length} Woerter)`)
      gemacht++
      continue
    }
    try {
      const r = await uebersetze(body, sprache)
      if (!r.ok) {
        console.error(`  x [${sprache}] ${rel}: ${r.fehler}`)
        fehler++
        continue
      }
      fs.mkdirSync(path.dirname(ziel), { recursive: true })
      // Frontmatter unveraendert uebernehmen: publish_status, url, cluster, Keywords und die
      // insurer_phrases sind Struktur- und SEO-Daten, keine Fliesstexte. `meta_title` faellt
      // bewusst weg - localizeAsset() nimmt dann die uebersetzte H1 statt eines deutschen
      // Kurztitels (so machen es die drei bestehenden Uebersetzungen).
      const fmOhneTitel = frontmatter.split('\n').filter((z) => !/^meta_title:/.test(z)).join('\n')
      fs.writeFileSync(ziel, `---\n${fmOhneTitel}\n---\n\n${r.text}\n`, 'utf8')
      tokenEin += r.ein
      tokenAus += r.aus
      gemacht++
      console.log(`  ok [${sprache}] ${rel}  ${r.ein}->${r.aus} Token  (${gemacht}/${aufgaben.length})`)
    } catch (e) {
      console.error(`  x [${sprache}] ${rel}: ${String(e).slice(0, 130)}`)
      fehler++
    }
  }
}

await Promise.all(Array.from({ length: Math.min(PARALLEL, aufgaben.length || 1) }, () => arbeiter()))

console.log(
  `\n[content-i18n] ${gemacht} uebersetzt - ${uebersprungen} vorhanden - ${fehler} Fehler - ` +
  `${(tokenEin / 1000).toFixed(0)}k ein / ${(tokenAus / 1000).toFixed(0)}k aus`,
)
if (fehler) process.exit(1)
