#!/usr/bin/env node
// Production-Readiness-Audit 26.06.2026 — Doku-Sichtbarkeits-Drift-Bremse.
//
// dokument_katalog.sichtbar_fuer ist die SSoT, welche Rolle welchen Doc-Typ sieht.
// Die Code-Map DOKUMENT_SICHTBAR_FUER (src/lib/dokumente/sichtbarkeit.ts) ist eine
// 2. Filter-Ebene (genutzt in der SV-Fallakte). Drift-Inzident: kunde/sv-uploadbare
// Katalog-Slots (zeugenbericht, diagnosebericht, sachschaden_foto, altes_gutachten,
// altschaden_fotos) fehlten in der Code-Map -> Fallback "nur admin" -> Case-Handler
// (SV/KB/Kanzlei) sahen die hochgeladenen Kunden-Dokumente NICHT.
//
// Dieser Ratchet erzwingt: jeder AKTIVE, von kunde/sv/kb/kanzlei UPLOADBARE
// Katalog-Slot (kein gutachter_verifizierung) MUSS in DOKUMENT_SICHTBAR_FUER sein,
// und die Map-Rollen muessen die katalog.sichtbar_fuer-Rollen (soweit die Map sie
// modelliert) abdecken. Die Code-Map darf MEHR Typen kennen (webhook/intern) —
// nur die Katalog-Abdeckung wird erzwungen.
//
// Verwendung:  node scripts/check-doc-sichtbarkeit.mjs
// ENV: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Katalog-Read).
// CI: Pre-Build-Step in .github/workflows/ci.yml (mit PR-Gate unten).
// Fix bei Drift: fehlenden Slot in DOKUMENT_SICHTBAR_FUER ergaenzen (Rollen =
//   katalog.sichtbar_fuer). Langfristig: getSichtbarFuerRolle aus Katalog ableiten.

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Rollen die die Code-Map (Rolle-Typ) modelliert — Katalog-Rollen ausserhalb
// (z.B. leadbearbeiter) werden beim Superset-Check ignoriert.
const MAP_ROLES = new Set(['admin', 'dispatch', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'])
// Rollen die einen Doc-Typ HOCHLADEN (-> der Doc muss fuer Case-Handler sichtbar sein).
const UPLOAD_ROLES = ['kunde', 'sachverstaendiger', 'kundenbetreuer', 'kanzlei']
const SICHTBARKEIT_FILE = 'src/lib/dokumente/sichtbarkeit.ts'

// ── PR-Gate: nur laufen wenn Katalog-Migration ODER die Code-Map beruehrt wird
// (sonst Skip — schont den geteilten Pool, blockt keine fremden PRs). Push/lokal: immer.
function prTouchesRelevant() {
  const base = process.env.GITHUB_BASE_REF
  if (!base) return true
  try {
    execSync(`git fetch --no-tags --depth=1 origin ${base}`, { stdio: 'ignore' })
    const out = execSync(
      `git diff --name-only origin/${base} HEAD -- supabase "${SICHTBARKEIT_FILE}"`,
      { encoding: 'utf8' },
    )
    return out.trim().length > 0
  } catch {
    return true
  }
}

if (!prTouchesRelevant()) {
  console.log('⏭  PR beruehrt kein supabase/** + keine sichtbarkeit.ts → Doku-Sichtbarkeits-Check uebersprungen.')
  process.exit(0)
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('❌ ENV fehlt: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
const supabase = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

// ── Map-Keys + Rollen aus sichtbarkeit.ts parsen (single-line Eintraege). ──
function parseCodeMap() {
  const src = readFileSync(SICHTBARKEIT_FILE, 'utf8')
  const start = src.indexOf('DOKUMENT_SICHTBAR_FUER')
  if (start === -1) throw new Error('DOKUMENT_SICHTBAR_FUER nicht in sichtbarkeit.ts gefunden')
  const block = src.slice(src.indexOf('{', start), src.indexOf('\n}', start))
  const map = {}
  const lineRe = /^ {2}(?:'([^']+)'|([A-Za-z_][\w]*))\s*:\s*\[([^\]]*)\]/gm
  let m
  while ((m = lineRe.exec(block)) !== null) {
    const key = m[1] ?? m[2]
    const roles = [...m[3].matchAll(/'([^']+)'/g)].map((r) => r[1])
    map[key] = new Set(roles)
  }
  return map
}

// ── Katalog-Read mit Retry (CF-522/Pool-Transients wie bei check:rls-grants). ──
const RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 30_000]
const PER_ATTEMPT_TIMEOUT_MS = 30_000
function isTransient(err) {
  const msg = String(err?.message || err)
  return /fetch failed|ECONNRESET|ETIMEDOUT|ECONNREFUSED|UND_ERR_|abort|aborted/i.test(msg) ||
    /\b(522|524|521|520)\b/.test(msg) || /Connection timed out/i.test(msg)
}
async function loadKatalog() {
  let lastErr = null
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PER_ATTEMPT_TIMEOUT_MS)
    let data = null, error = null
    try {
      ;({ data, error } = await supabase
        .from('dokument_katalog')
        .select('slot_id, sichtbar_fuer, uploadbar_von, kategorie')
        .eq('aktiv', true)
        .neq('kategorie', 'gutachter_verifizierung')
        .abortSignal(controller.signal))
    } catch (e) { error = e } finally { clearTimeout(timer) }
    if (!error) return data
    lastErr = error
    if (!isTransient(error) || attempt === RETRY_DELAYS_MS.length) throw error
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
  }
  throw lastErr
}

const codeMap = parseCodeMap()
let katalog
try {
  katalog = await loadKatalog()
} catch (err) {
  console.error('❌ Katalog-Read fehlgeschlagen:', String(err?.message || err))
  process.exit(1)
}

// Relevante Slots: aktiv + von einer Upload-Rolle hochladbar.
const uploadbare = (katalog ?? []).filter((s) =>
  Array.isArray(s.uploadbar_von) && s.uploadbar_von.some((r) => UPLOAD_ROLES.includes(r)),
)

const fehlend = []
const rollenLuecke = []
for (const slot of uploadbare) {
  const mapRoles = codeMap[slot.slot_id]
  if (!mapRoles) { fehlend.push(slot.slot_id); continue }
  const erwartet = (slot.sichtbar_fuer ?? []).filter((r) => MAP_ROLES.has(r))
  const fehlt = erwartet.filter((r) => !mapRoles.has(r))
  if (fehlt.length > 0) rollenLuecke.push({ slot: slot.slot_id, fehlt })
}

if (fehlend.length === 0 && rollenLuecke.length === 0) {
  console.log(`✓ Doku-Sichtbarkeit konsistent: alle ${uploadbare.length} uploadbaren Katalog-Slots sind in DOKUMENT_SICHTBAR_FUER mit passenden Rollen.`)
  process.exit(0)
}

console.error('❌ Doku-Sichtbarkeits-Drift (Katalog ↔ DOKUMENT_SICHTBAR_FUER):')
if (fehlend.length > 0) {
  console.error(`\n  Slots FEHLEN in der Code-Map (-> admin-only, Case-Handler sehen sie nicht):`)
  for (const s of fehlend) console.error(`    - ${s}`)
}
if (rollenLuecke.length > 0) {
  console.error(`\n  Slots mit fehlenden Rollen (Katalog erlaubt mehr als die Code-Map):`)
  for (const r of rollenLuecke) console.error(`    - ${r.slot}: fehlt ${r.fehlt.join(', ')}`)
}
console.error(`\nFix: in ${SICHTBARKEIT_FILE} ergaenzen (Rollen = dokument_katalog.sichtbar_fuer).`)
process.exit(1)
