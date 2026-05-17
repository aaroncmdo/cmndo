#!/usr/bin/env node
// CMM-44 SP-A: findet faelle-Call-Sites die eine der 34 DUP-Spalten beruehren.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const COLS = ['abgeschlossen_am','auslandskennzeichen','brn','fahrerflucht','finanzierung_leasing','finanzierungsgeber_adresse','finanzierungsgeber_name','finanzierungsgeber_vertragsnr','gegner_bekannt','gegner_versicherung_id','gegner_versicherungsnummer','gewerbe_flag','kanzlei_ansprechpartner_email','kanzlei_ansprechpartner_name','kanzlei_ansprechpartner_telefon','kanzlei_uebergeben_am','kunde_email','kunden_konstellation','kundenbetreuer_id','polizei_aktenzeichen','polizei_bericht_vorhanden','polizei_vor_ort','polizeibericht_status','sachschaden_beschreibung','spezifikation','unfall_konstellation','unfallskizze_ablehnung_grund','unfallskizze_bestaetigt','unfallskizze_generiert_am','unfallskizze_svg','unfallskizze_url','vehicle_id','vorsteuerabzugsberechtigt','zeugen_kontakte']

const files = execSync(`grep -rl "from('faelle')" src/ || true`, { encoding: 'utf8' })
  .split('\n').filter(Boolean)

const hits = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const found = COLS.filter((c) => new RegExp(`\\b${c}\\b`).test(src))
  if (found.length) hits.push({ file: f, cols: found })
}
hits.sort((a, b) => a.file.localeCompare(b.file))
const out = hits.map((h) => `${h.file}\n  ${h.cols.join(', ')}`).join('\n')
writeFileSync('scripts/cmm44-spa-callsites.txt', out + `\n\n# ${hits.length} Files\n`)
console.log(`${hits.length} Files mit faelle-Call-Site + DUP-Spalte`)
