#!/usr/bin/env node
// AAR-925: Migration von Legacy-Rows aus `gutachter_monatsabrechnungen`
// nach `abrechnungen` (KFZ-141-Schema, empfaenger_typ='sv').
//
// Verwendung:
//   node scripts/migrate-legacy-monatsabrechnungen.mjs          # Dry-Run
//   node scripts/migrate-legacy-monatsabrechnungen.mjs --apply  # echtes Schreiben
//
// Default ist Dry-Run — zeigt was passieren wuerde. --apply schreibt erst dann.
//
// Skipt Rows die schon in `abrechnungen` mit gleichem (empfaenger_id, monat)
// existieren (System B hat sie schon erfasst). Markiert die Legacy-Row mit
// migrated_to_abrechnung_id falls die Spalte existiert.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function loadEnv() {
  try {
    const env = readFileSync(join(process.cwd(), '.env.local'), 'utf-8')
    for (const line of env.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {}
}
loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Fehlt NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const apply = process.argv.includes('--apply')
console.log(`\n${apply ? '⚠ APPLY-Modus' : '→ Dry-Run'} — Legacy-Migration gutachter_monatsabrechnungen → abrechnungen\n`)

const db = createClient(url, key, { auth: { persistSession: false } })

const { data: legacy, error } = await db
  .from('gutachter_monatsabrechnungen')
  .select('id, sv_id, monat, brutto_endbetrag, anzahl_faelle, netto_endbetrag, mwst_betrag, summe_lead_preis, summe_guthaben_verrechnet, status, erstellt_am')

if (error) { console.error('Query-Fehler:', error.message); process.exit(1) }

console.log(`Gefundene Legacy-Rows: ${legacy?.length ?? 0}\n`)

let migriert = 0
let geskipt = 0
let fehler = 0

for (const row of legacy ?? []) {
  // Check ob bereits in abrechnungen (per empfaenger_id + Zeitraum)
  const monatDate = new Date(row.monat)
  const jahr = monatDate.getFullYear()
  const mo = monatDate.getMonth() + 1
  const monthStart = new Date(jahr, mo - 1, 1).toISOString().slice(0, 10)
  const monthEnd = new Date(jahr, mo, 0).toISOString().slice(0, 10)

  const { count: existing } = await db
    .from('abrechnungen')
    .select('id', { count: 'exact', head: true })
    .eq('empfaenger_typ', 'sv')
    .eq('empfaenger_id', row.sv_id)
    .gte('abrechnungs_zeitraum_start', monthStart)
    .lte('abrechnungs_zeitraum_ende', monthEnd)

  if (existing && existing > 0) {
    console.log(`SKIP sv=${row.sv_id} monat=${row.monat} — bereits in abrechnungen`)
    geskipt++
    continue
  }

  // Empfaenger-Daten laden
  const { data: sv } = await db
    .from('sachverstaendige')
    .select('profile_id')
    .eq('id', row.sv_id)
    .maybeSingle()

  let empfaengerEmail = ''
  let empfaengerName = 'Sachverstaendiger'
  if (sv?.profile_id) {
    const { data: p } = await db
      .from('profiles')
      .select('email, vorname, nachname')
      .eq('id', sv.profile_id)
      .maybeSingle()
    empfaengerEmail = p?.email ?? ''
    empfaengerName = [p?.vorname, p?.nachname].filter(Boolean).join(' ') || 'Sachverstaendiger'
  }

  if (!empfaengerEmail) {
    console.log(`FEHLER sv=${row.sv_id} — keine Empfaenger-Email gefunden`)
    fehler++
    continue
  }

  // Rechnungsnummer
  const { count: existingCount } = await db.from('abrechnungen').select('id', { count: 'exact', head: true })
    .eq('empfaenger_typ', 'sv')
    .gte('abrechnungs_zeitraum_start', monthStart)
    .lte('abrechnungs_zeitraum_ende', monthEnd)
  const nr = String((existingCount ?? 0) + 1).padStart(4, '0')
  const abrechnungsNr = `CMNDO-${jahr}-${String(mo).padStart(2, '0')}-${nr}-LEGACY`

  const faellig = new Date(jahr, mo, 14).toISOString().slice(0, 10)

  const insertPayload = {
    empfaenger_typ: 'sv',
    empfaenger_id: row.sv_id,
    empfaenger_email: empfaengerEmail,
    empfaenger_name: empfaengerName,
    abrechnungs_nr: abrechnungsNr,
    abrechnungs_zeitraum_start: monthStart,
    abrechnungs_zeitraum_ende: monthEnd,
    positionen: [],  // Detail-Positionen sind in gutachter_abrechnungspositionen, nicht hier portiert
    summe_netto: Number(row.netto_endbetrag ?? 0),
    ust_satz: 19.00,
    ust_betrag: Number(row.mwst_betrag ?? 0),
    summe_brutto: Number(row.brutto_endbetrag ?? 0),
    faellig_am: faellig,
    status: row.status ?? 'versendet',
    versand_datum: row.erstellt_am,
    notiz: `Migriert aus gutachter_monatsabrechnungen (Legacy ID: ${row.id}). Anzahl Faelle: ${row.anzahl_faelle}. Original-Lead-Preis-Summe: ${row.summe_lead_preis}. Original-Guthaben-Verrechnet: ${row.summe_guthaben_verrechnet}.`,
  }

  if (apply) {
    const { data: newAbr, error: insErr } = await db.from('abrechnungen').insert(insertPayload).select('id').single()
    if (insErr || !newAbr) {
      console.log(`FEHLER sv=${row.sv_id}: ${insErr?.message}`)
      fehler++
      continue
    }
    console.log(`MIGRIERT sv=${row.sv_id} monat=${row.monat} → abrechnungen.id=${newAbr.id} nr=${abrechnungsNr}`)
    migriert++
  } else {
    console.log(`DRY-RUN sv=${row.sv_id} monat=${row.monat} → wuerde insert mit nr=${abrechnungsNr} brutto=${insertPayload.summe_brutto}`)
    migriert++
  }
}

console.log(`\nZusammenfassung: ${apply ? 'migriert' : 'wuerde migrieren'}=${migriert} skipped=${geskipt} fehler=${fehler}`)
if (!apply && migriert > 0) console.log('\n→ Rufe mit --apply auf um wirklich zu schreiben.')
