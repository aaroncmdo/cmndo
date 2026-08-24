// Sammel-Qualitaetskontrolle fuer eine oder mehrere Charge-Dateien, VOR dem Import.
//
// WOFUER: Bei parallel arbeitenden Subagenten kommen mehrere Dateien gleichzeitig
// zurueck, und jede einzeln durchzusehen skaliert nicht. Dieses Skript prueft in
// einem Lauf, was sonst vier Werkzeuge einzeln pruefen — und meldet AUSDRUECKLICH,
// wenn es nichts zu pruefen gab: eine leere Menge ist ein Befund, kein Ruhezustand.
//
// Run: node --experimental-strip-types scripts/pruefe-charge.mjs <glob-praefix> [--erwarte slug,slug,...]
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { pruefeLokalinhalt, istOrtsspezifischeFaq } from '../src/lib/lokalinhalt/gate.ts'

const praefix = process.argv[2]
if (!praefix) {
  console.error('Bitte ein Datei-Praefix angeben, z.B. charge-10')
  process.exit(1)
}
const ei = process.argv.indexOf('--erwarte')
const erwartet = ei > -1 ? new Set(process.argv[ei + 1].split(',').map((s) => s.trim())) : null

const ORDNER = 'scripts/lokalinhalte'
const dateien = readdirSync(ORDNER).filter((f) => f.startsWith(praefix) && f.endsWith('.json'))
if (dateien.length === 0) {
  console.error(`🔴 KEINE Datei mit Praefix "${praefix}" in ${ORDNER} — nichts geprueft.`)
  process.exit(1)
}

// Stadtnamen aus der Marketing-Liste (dieselbe Quelle wie der Import).
const staedteSrc = readFileSync('claimondo-marketing/lib/kfz-gutachter/staedte.ts', 'utf8')
const namen = new Map()
for (const m of staedteSrc.matchAll(/slug:\s*'([^']+)'[\s\S]{0,400}?name:\s*'([^']+)'/g)) {
  if (!namen.has(m[1])) namen.set(m[1], m[2])
}

// Nur lateinische Schrift + uebliche Satzzeichen. Faengt fremde Schriftsysteme,
// die dem Umlaut-Check des Gates entgehen (ein chinesisches Zeichen rutschte so
// einmal in einen Aachener Ortsteil).
const ZEICHEN_OK = /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}€§–—·"'()/%+.,:;!?-]*$/u

// Die Themen, die der zentrale Basis-Block der Stadtseite bereits beantwortet.
//
// ⚠ DIESE LISTE MUSS ALLE ZWOELF ABDECKEN. Sie hatte anfangs nur acht — es
// fehlten ausgerechnet „Gutachterkosten", „Sachverstaendigen finden",
// „Kuerzungen" und „Sicherungsabtretung", darunter Thema Nummer eins. Der
// Filter meldete deshalb „0 Befunde", waehrend vier Staedte die Schablone
// „Unfall auf der A40 — wer zahlt das Gutachten?" (15-23 Woerter, Ortsname nur
// in der Frage) unbehelligt trugen. Ein Pruefwerkzeug, das nur zwei Drittel
// seiner eigenen Regel kennt, erzeugt genau das falsche Zutrauen.
const VERBOTEN = [
  { name: 'Gutachterkosten', re: /wer zahlt (das|den|die) (gutachten|gutachter|sachverst)|was kostet ein (kfz-)?gutacht/i },
  { name: 'Gutachter finden', re: /wo finde ich (einen|ein)|wie finde ich (einen|ein).{0,30}(gutachter|sachverst)/i },
  { name: 'Kuerzungen', re: /versicherung das gutachten k[üu]e?rzt|k[üu]e?rzt die versicherung/i },
  { name: 'Sicherungsabtretung', re: /sicherungsabtretung/i },
  { name: 'Mietwagen', re: /mietwagen|nutzungsausfall in bar/i },
  { name: 'Kostenvoranschlag', re: /reicht ein kostenvoranschlag|kostenvoranschlag der werkstatt/i },
  { name: 'Gutachterwahl', re: /gutachter.{0,20}selbst w[äa]e?hlen|sachverst[äa]ndigen.{0,20}selbst/i },
  { name: 'Werkstattwahl', re: /werkstatt.{0,20}frei w[äa]e?hlen|freie werkstattwahl/i },
  { name: 'Wertminderung', re: /was ist .{0,15}wertminderung/i },
  { name: 'Gerichtsstand', re: /welches gericht|gericht ist .{0,40}zust[äa]e?ndig/i },
  { name: 'vor-Ort-Frist', re: /wie schnell ist ein|wie lange dauert.{0,30}vor ort/i },
  { name: '130-Prozent', re: /130.{0,3}(%|prozent).{0,10}regel/i },
]

let gesamtStaedte = 0
let gesamtFaqs = 0
let gesamtWoerter = 0
const alleSlugs = new Set()
const dubletten = []
const befunde = []

console.log(`\nCHARGE-QC — ${dateien.length} Datei(en) mit Praefix "${praefix}"\n`)
console.log('Datei                              Staedte  FAQs  Ø Woerter  Befunde')
console.log('─'.repeat(88))

for (const f of dateien) {
  const inhalt = JSON.parse(readFileSync(join(ORDNER, f), 'utf8'))
  const eintraege = Object.entries(inhalt)
  let faqs = 0
  let woerter = 0
  let lokaleBefunde = 0

  for (const [slug, s] of eintraege) {
    if (alleSlugs.has(slug)) dubletten.push(slug)
    alleSlugs.add(slug)

    if (!namen.has(slug)) {
      befunde.push(`🔴 ${slug}: kein solcher Slug in staedte.ts — der Import wuerde ihn ueberspringen`)
      lokaleBefunde++
      continue
    }

    const L = (x) => (Array.isArray(x) ? x : [])
    const ort = {
      stadtName: namen.get(slug),
      bezirke: L(s.stadtbezirke).flatMap((b) => [b?.name, ...L(b?.ortsteile)]).filter(Boolean),
      achsen: [
        ...L(s.hauptachsen?.autobahnen),
        ...L(s.hauptachsen?.bundesstrassen),
        ...L(s.hauptachsen?.knoten),
      ].filter(Boolean),
    }

    // Zeichen + Woerter ueber alle Textwerte
    const texte = []
    const sammle = (o) => {
      for (const v of Object.values(o ?? {})) {
        if (typeof v === 'string') texte.push(v)
        else if (v && typeof v === 'object') sammle(v)
      }
    }
    sammle(s)
    for (const t of texte) {
      woerter += t.split(/\s+/).filter(Boolean).length
      if (!ZEICHEN_OK.test(t)) {
        befunde.push(`🔴 ${slug}: fremdes Schriftzeichen in "${t.slice(0, 50)}"`)
        lokaleBefunde++
      }
    }

    for (const faq of L(s.lokaleFaqs)) {
      faqs++
      const beides = `${faq?.frage ?? ''} ${faq?.antwort ?? ''}`
      for (const v of VERBOTEN) {
        if (v.re.test(beides)) {
          befunde.push(`⚠ ${slug}: Thema "${v.name}" — steht schon im Basis-Block: "${String(faq.frage).slice(0, 46)}"`)
          lokaleBefunde++
        }
      }
      if (!istOrtsspezifischeFaq(faq, ort)) {
        befunde.push(`⚠ ${slug}: Gate verwirft — kein Ortsbezug in der ANTWORT: "${String(faq.frage).slice(0, 46)}"`)
        lokaleBefunde++
      }
    }

    // Das ECHTE Gate, nicht eine Nachbildung.
    const g = pruefeLokalinhalt(s, namen.get(slug))
    if (!g.ok) {
      befunde.push(`🔴 ${slug}: Gate lehnt ab — ${g.gruende.join(' · ').slice(0, 70)}`)
      lokaleBefunde++
    }
    if (L(s.hauptachsen?.autobahnen).length === 0) {
      console.log(`  ℹ ${slug}: ohne Autobahn — pruefen, ob das stimmt`)
    }
  }

  gesamtStaedte += eintraege.length
  gesamtFaqs += faqs
  gesamtWoerter += woerter
  console.log(
    `${f.padEnd(36)}${String(eintraege.length).padStart(5)}${String(faqs).padStart(6)}` +
      `${String(Math.round(woerter / Math.max(1, eintraege.length))).padStart(10)}  ${lokaleBefunde || '—'}`,
  )
}

console.log('─'.repeat(88))
console.log(
  `${'GESAMT'.padEnd(36)}${String(gesamtStaedte).padStart(5)}${String(gesamtFaqs).padStart(6)}` +
    `${String(Math.round(gesamtWoerter / Math.max(1, gesamtStaedte))).padStart(10)}`,
)

if (erwartet) {
  const fehlt = [...erwartet].filter((s) => !alleSlugs.has(s))
  const zuviel = [...alleSlugs].filter((s) => !erwartet.has(s))
  console.log(`\nVOLLSTAENDIGKEIT  ${alleSlugs.size}/${erwartet.size}`)
  if (fehlt.length) console.log(`  🔴 fehlt:  ${fehlt.join(', ')}`)
  if (zuviel.length) console.log(`  🔴 zuviel: ${zuviel.join(', ')}`)
  if (!fehlt.length && !zuviel.length) console.log('  ✓ genau die erwartete Menge')
}
if (dubletten.length) console.log(`\n🔴 DUBLETTEN ueber Dateien hinweg: ${dubletten.join(', ')}`)

console.log(`\nBEFUNDE (${befunde.length})`)
for (const b of befunde.slice(0, 40)) console.log(`  ${b}`)
if (befunde.length > 40) console.log(`  … und ${befunde.length - 40} weitere`)
if (befunde.length === 0) console.log('  ✓ keine')

process.exitCode = befunde.filter((b) => b.startsWith('🔴')).length > 0 ? 1 : 0
