#!/usr/bin/env node
// i18n-Übersetzungs-Pipeline mit Anthropic Claude.
//
// Liest src/i18n/messages/de.json (Single Source of Truth), vergleicht mit
// en/tr/pl/ru/ar.json und übersetzt nur fehlende oder geänderte Keys.
//
// Use:
//   node scripts/i18n/translate.mjs              → alle Sprachen
//   node scripts/i18n/translate.mjs en tr        → nur diese Sprachen
//   node scripts/i18n/translate.mjs --force      → komplett neu übersetzen
//   node scripts/i18n/translate.mjs --section=ueber_uns  → nur ein Top-Level-Key
//
// Setzt voraus: ANTHROPIC_API_KEY in Env (.env.local oder export).

import Anthropic from '@anthropic-ai/sdk'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MESSAGES_DIR = path.resolve(__dirname, '../../src/i18n/messages')
const GLOSSARY_PATH = path.resolve(__dirname, 'glossary.md')

const ALL_TARGETS = ['en', 'tr', 'pl', 'ru', 'ar']
const LANG_NAMES = {
  en: 'English',
  tr: 'Turkish (Türkçe)',
  pl: 'Polish (Polski)',
  ru: 'Russian (Русский)',
  ar: 'Arabic (العربية)',
}

const args = process.argv.slice(2)
const force = args.includes('--force')
const sectionArg = args.find((a) => a.startsWith('--section='))
const onlySection = sectionArg ? sectionArg.split('=')[1] : null
const targets = args.filter((a) => !a.startsWith('--') && ALL_TARGETS.includes(a))
const targetLocales = targets.length > 0 ? targets : ALL_TARGETS

console.log(`[i18n] targets: ${targetLocales.join(', ')}${force ? ' (force)' : ''}${onlySection ? ` section=${onlySection}` : ''}`)

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[i18n] ANTHROPIC_API_KEY nicht in Env — abbrechen')
  process.exit(1)
}

const client = new Anthropic()
const glossary = fs.readFileSync(GLOSSARY_PATH, 'utf8')

function loadJson(locale) {
  return JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), 'utf8'))
}

function saveJson(locale, data) {
  fs.writeFileSync(
    path.join(MESSAGES_DIR, `${locale}.json`),
    JSON.stringify(data, null, 2) + '\n',
    'utf8',
  )
}

// Walk de + targetLocale parallel und sammle Pfade zu Strings die übersetzt
// werden müssen. Pfad ist Array wie ['ueber_uns', 'hero', 'headline'].
function collectMissing(deNode, targetNode, currentPath = [], onlyTopLevel = null) {
  const missing = []
  if (typeof deNode === 'string') {
    // String-Wert. Übersetzungsbedarf wenn fehlt oder Force ODER bei Force
    // ODER wenn TargetNode === DeNode (also DE-Fallback statt echter Übersetzung)
    if (
      typeof targetNode !== 'string' ||
      force ||
      targetNode === deNode
    ) {
      missing.push({ path: [...currentPath], value: deNode })
    }
    return missing
  }
  if (typeof deNode !== 'object' || deNode === null) return missing
  for (const key of Object.keys(deNode)) {
    if (currentPath.length === 0 && onlyTopLevel && key !== onlyTopLevel) continue
    const child = targetNode && typeof targetNode === 'object' ? targetNode[key] : undefined
    missing.push(...collectMissing(deNode[key], child, [...currentPath, key], onlyTopLevel))
  }
  return missing
}

function setByPath(obj, pathArr, value) {
  let cur = obj
  for (let i = 0; i < pathArr.length - 1; i++) {
    if (typeof cur[pathArr[i]] !== 'object' || cur[pathArr[i]] === null) {
      cur[pathArr[i]] = {}
    }
    cur = cur[pathArr[i]]
  }
  cur[pathArr[pathArr.length - 1]] = value
}

async function translateBatch(items, targetLocale) {
  // items: [{path:['a','b'], value: 'deutscher text'}, ...]
  const langName = LANG_NAMES[targetLocale]

  const inputJson = items.reduce((acc, item, i) => {
    acc[`k${i}`] = item.value
    return acc
  }, {})

  // Delimiter-basiertes Output-Format umgeht JSON-Escaping-Probleme komplett.
  // Format pro Eintrag: <<<k0>>>translation<<<END>>>
  const sourceBlock = items
    .map((item, i) => `<<<k${i}>>>${item.value}<<<END>>>`)
    .join('\n')

  const userPrompt = `Translate the following German UI strings into ${langName}.

OUTPUT FORMAT — MUST follow exactly:
For each input line "<<<kN>>>source<<<END>>>" produce ONE output line "<<<kN>>>translation<<<END>>>".
- Use the same kN markers in the same order
- No commentary, no markdown fences, no blank lines before/after
- Quotation marks INSIDE translations: use the target language's typographic quotes (« » for RU, „ " (U+201E + U+201D) for PL, " " (U+201C + U+201D) for EN/TR, « » for AR), NEVER raw ASCII "
- Em-dashes (—), §-references, BGH-Aktenzeichen, brand names: preserve exactly
- Numbers: keep digits, adjust thousand-separator to target locale (DE 2.000 → EN 2,000)

Source (German):
${sourceBlock}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system: [
      {
        type: 'text',
        text: `You are a professional translator for Claimondo, a German Kfz-Schadensregulierungs-Plattform (car-damage-claim platform).

Glossary + Style Guide (read carefully — strictly follow):

${glossary}

Rules:
1. Output is JSON only — no markdown fences, no commentary
2. Keep the same JSON keys
3. Preserve em-dashes, §-references, BGH numbers, brand names exactly
4. Tone: trustworthy, technically precise, direct (NOT marketing-fluff)
5. Keep UI strings short — buttons same length where possible`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  // Delimiter-Parsing: <<<kN>>>translation<<<END>>>
  // Tolerant gegen Whitespace und optionale Fences.
  const cleaned = text.trim().replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '')
  const parsed = {}
  const re = /<<<(k\d+)>>>([\s\S]*?)<<<END>>>/g
  let match
  while ((match = re.exec(cleaned)) !== null) {
    parsed[match[1]] = match[2].trim()
  }

  // Missing-Check
  const missing = items.filter((_, i) => parsed[`k${i}`] === undefined)
  if (missing.length > 0) {
    console.warn(`[i18n][${targetLocale}] ${missing.length}/${items.length} keys missing in response — using DE fallback for those`)
  }

  return items.map((item, i) => ({
    path: item.path,
    value: parsed[`k${i}`] ?? item.value, // Fallback auf DE-Original wenn Marker fehlt
  }))
}

async function translateLocale(locale, deData) {
  console.log(`\n[i18n][${locale}] starte`)
  const targetData = loadJson(locale)
  const missing = collectMissing(deData, targetData, [], onlySection)

  if (missing.length === 0) {
    console.log(`[i18n][${locale}] alle Keys aktuell — kein Update nötig`)
    return
  }

  console.log(`[i18n][${locale}] ${missing.length} Keys werden übersetzt`)

  // Batching: 30 Strings pro Call (hält Token-Counts klein, parallel-fähig)
  const BATCH_SIZE = 30
  const updated = JSON.parse(JSON.stringify(targetData))

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE)
    process.stdout.write(`[i18n][${locale}] Batch ${i / BATCH_SIZE + 1}/${Math.ceil(missing.length / BATCH_SIZE)} (${batch.length} Keys)... `)
    const translated = await translateBatch(batch, locale)
    for (const t of translated) {
      setByPath(updated, t.path, t.value)
    }
    console.log('✓')
  }

  saveJson(locale, updated)
  console.log(`[i18n][${locale}] geschrieben`)
}

async function main() {
  const deData = loadJson('de')

  for (const loc of targetLocales) {
    try {
      await translateLocale(loc, deData)
    } catch (err) {
      console.error(`[i18n][${loc}] Fehler:`, err.message)
      // weiter mit nächster Sprache
    }
  }

  console.log('\n[i18n] fertig')
}

main().catch((err) => {
  console.error('[i18n] fatal:', err)
  process.exit(1)
})
