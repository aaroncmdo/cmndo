#!/usr/bin/env node
// CMM-44 SP-I2 PR1 — deterministische View-Repoint-DDL-Generierung.
// Input: die rohen pg_get_viewdef()-Texte (verbatim aus der Live-DB, 2026-05-23),
// Transform: identisch zu den Plan-Step-6 replace()-Ketten (server-seitiges Muster).
// v_faelle_mit_aktuellem_termin wurde server-seitig (MCP) generiert + hier 1:1 hinterlegt;
// v_claim_full + faelle_sv_view: replace() reproduziert (Pooler-544 blockte Server-Gen),
// Dry-Run gegen Live-DB validiert das Ergebnis.
import fs from 'node:fs'

const RAW = JSON.parse(fs.readFileSync(new URL('./_spi2-raw-viewdefs.json', import.meta.url), 'utf8'))

// v_faelle_mit_aktuellem_termin: DDL wurde server-seitig (MCP execute_sql, replace()-Kette
// exakt wie Plan Step 6, unterschrift zuerst -> COALESCE+alias) generiert und verbatim als
// Artefakt hinterlegt (_spi2-term-ddl.sql). KEIN neuer kf-Join (kf existiert via SP-I1).
function genTerm() {
  return fs.readFileSync(new URL('./_spi2-term-ddl.sql', import.meta.url), 'utf8').trimEnd()
}

// --- v_claim_full: nur anschlussschreiben_am f.->kf. + NEUER kf-Join (kf fehlt) ---
function genFull(vd) {
  let s = vd
  s = s.replaceAll('f.anschlussschreiben_am', 'kf.anschlussschreiben_am')
  s = s.replace(
    'LEFT JOIN gutachten g ON g.claim_id = c.id',
    'LEFT JOIN gutachten g ON g.claim_id = c.id\n     LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id',
  )
  return 'CREATE OR REPLACE VIEW public.v_claim_full AS ' + s
}

// --- faelle_sv_view: kf.mandatsnummer + kf.lexdrive_case_id ans Ende der SELECT-Liste anhaengen + NEUER kf-Join (kf fehlt) ---
function genSvView(vd) {
  let s = vd
  // letzte SELECT-Spalte vor FROM ist "    c.claim_nummer\n   FROM faelle f"
  s = s.replace(
    '    c.claim_nummer\n   FROM faelle f',
    '    c.claim_nummer,\n    kf.mandatsnummer,\n    kf.lexdrive_case_id\n   FROM faelle f',
  )
  s = s.replace(
    'LEFT JOIN gutachten g ON g.claim_id = c.id',
    'LEFT JOIN gutachten g ON g.claim_id = c.id\n     LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id',
  )
  return 'CREATE OR REPLACE VIEW public.faelle_sv_view AS ' + s
}

function assertContains(label, ddl, needles) {
  for (const n of needles) {
    if (!ddl.includes(n)) { console.error(`FAIL [${label}] missing: ${n}`); process.exit(1) }
  }
}
function assertCount(label, ddl, needle, expected) {
  const n = ddl.split(needle).length - 1
  if (n !== expected) { console.error(`FAIL [${label}] count(${needle})=${n} expected ${expected}`); process.exit(1) }
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function assertAbsent(label, ddl, needles) {
  // "f.<col>" darf NICHT als eigenstaendiger faelle-Alias-Zugriff vorkommen.
  // Negativer Lookbehind auf "k" schliesst "kf.<col>" (= korrekt repointet) aus.
  for (const n of needles) {
    const re = new RegExp('(?<![a-z])' + escapeRe(n))
    if (re.test(ddl)) { console.error(`FAIL [${label}] still present: ${n}`); process.exit(1) }
  }
}

const term = genTerm()
const full = genFull(RAW.v_claim_full)
const sv = genSvView(RAW.faelle_sv_view)

// --- Sanity-Checks (replizieren die Plan-Verify-Punkte) ---
assertContains('term', term, [
  'COALESCE(kf.anschlussschreiben_unterschrift, false) AS anschlussschreiben_unterschrift',
  'kf.anschlussschreiben_am', 'kf.anschlussschreiben_url', 'kf.anschlussschreiben_sendedatum',
  'kf.anschlussschreiben_ocr_am', 'kf.as_geforderte_summe', 'kf.as_frist', 'kf.as_vs_reaktion_text',
  'kf.as_salesforce_id', 'kf.as_zuletzt_synced_am', 'kf.mandatsnummer',
])
assertAbsent('term', term, [
  'f.anschlussschreiben_am', 'f.anschlussschreiben_url', 'f.anschlussschreiben_sendedatum',
  'f.anschlussschreiben_unterschrift', 'f.anschlussschreiben_ocr_am', 'f.as_geforderte_summe',
  'f.as_frist', 'f.as_vs_reaktion_text', 'f.as_salesforce_id', 'f.as_zuletzt_synced_am', 'f.mandatsnummer',
])
// Genau EIN kf-Join (kein doppelter) in term:
assertCount('term', term, 'LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id', 1)

assertContains('full', full, ['kf.anschlussschreiben_am', 'LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id'])
assertAbsent('full', full, ['f.anschlussschreiben_am'])
assertCount('full', full, 'LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id', 1)

assertContains('sv', sv, ['kf.mandatsnummer', 'kf.lexdrive_case_id', 'LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id'])
assertCount('sv', sv, 'LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id', 1)

// pg_get_viewdef-Body endet bereits mit ';' -> auf genau ein abschliessendes ';' normalisieren.
const oneSemi = (s) => s.replace(/[;\s]+$/, '') + ';\n'
const outDir = new URL('./_spi2-out/', import.meta.url)
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(new URL('term.sql', outDir), oneSemi(term))
fs.writeFileSync(new URL('full.sql', outDir), oneSemi(full))
fs.writeFileSync(new URL('sv.sql', outDir), oneSemi(sv))
console.log('OK — 3 view DDLs written to scripts/_spi2-out/{term,full,sv}.sql, all sanity-checks passed')
