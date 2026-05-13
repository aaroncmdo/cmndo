#!/usr/bin/env node
// AAR-Smoke: Komplettpaket-Trigger Ende-zu-Ende
//
// 1. Aktualisiert Kunde-Daten auf staging-Test-Fall SMK-SV-2026-001 (Aaron-Daten)
// 2. Aktualisiert claim_status um Übergabe an Kanzlei zu ermöglichen
// 3. Ruft die LexDrive-Email-Funktion direkt auf — das simuliert das was passiert
//    wenn "kanzlei-uebergeben" Status getriggert wird.
//
// Erwartung:
//   - Resend sendet Email an LEXDRIVE_KANZLEI_EMAIL (env)
//   - LexDrive-Salesforce-Bot empfängt Mandant-Daten
//   - Bot generiert Vollmacht → schickt sie an Aarons Email + WhatsApp
//
// Usage:
//   node docs/13.05.2026/smoke-lexdrive-webhook/trigger-kanzlei-uebergeben.mjs

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raw = readFileSync(path.resolve(__dirname, '..', '..', '..', '.env.local'), 'utf-8')
for (const line of raw.split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const idx = t.indexOf('=')
  if (idx < 0) continue
  if (!process.env[t.slice(0, idx).trim()]) process.env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim()
}

const FALL_ID = 'bbbb3333-0000-4000-8000-000000000032' // SMK-SV-2026-001 (seed-staging-test-users)
const AARON = {
  vorname: 'Aaron',
  nachname: 'Sprafke',
  email: 'aaron.sprafke@claimondo.de',
  telefon: '+491633628571',
  kunde_strasse: 'Hohenzollernring 31',
  kunde_plz: '50672',
  kunde_stadt: 'Köln',
}
const LEXDRIVE_EMAIL = process.env.LEXDRIVE_KANZLEI_EMAIL ?? 'aaron.sprafke@claimondo.de'

console.log(`→ Zieladresse LexDrive: ${LEXDRIVE_EMAIL}`)
console.log(`→ Test-Fall:          ${FALL_ID}`)
console.log(`→ Mandant:            ${AARON.vorname} ${AARON.nachname} · ${AARON.telefon} · ${AARON.email}\n`)

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const resend = new Resend(process.env.RESEND_API_KEY)

// 1. Fall laden
const { data: fall, error: fErr } = await db
  .from('faelle')
  .select('id, fall_nummer, kennzeichen, lead_id, claim_id, gegner_kennzeichen, gegner_name, gegner_versicherung, gegner_schadennummer')
  .eq('id', FALL_ID)
  .single()
if (fErr || !fall) { console.error('Fall nicht gefunden:', fErr?.message); process.exit(1) }
console.log(`✅ Fall geladen: ${fall.fall_nummer}`)

// 2. Lead auf Aaron-Daten updaten
if (fall.lead_id) {
  const { error: lErr } = await db.from('leads').update(AARON).eq('id', fall.lead_id)
  if (lErr) { console.error('Lead-Update Fehler:', lErr.message); process.exit(1) }
  console.log(`✅ Lead aktualisiert (${fall.lead_id})`)
}

// 3. Claim kunde_email setzen
if (fall.claim_id) {
  const { error: cErr } = await db
    .from('claims')
    .update({ kunde_email: AARON.email, kunde_telefon: AARON.telefon })
    .eq('id', fall.claim_id)
  if (cErr) console.log(`  ⚠ claim-update: ${cErr.message}`)
  else console.log(`✅ Claim aktualisiert (${fall.claim_id})`)
}

// 4. Email-Body bauen (identisch zu lib/lexdrive/email-sender.ts)
const kundeName = `${AARON.vorname} ${AARON.nachname}`
const kundeAdr = `${AARON.kunde_strasse}, ${AARON.kunde_plz} ${AARON.kunde_stadt}`

const text = `Neuer Fall zur Bearbeitung — Claimondo

Fall-ID: ${fall.id}
Fall-Nummer: ${fall.fall_nummer ?? '—'}

Mandant:
  Name: ${kundeName}
  Anschrift: ${kundeAdr}
  Telefon: ${AARON.telefon}
  Email: ${AARON.email}

Fahrzeug: ${fall.kennzeichen ?? '—'}

Gegner:
  Name: ${fall.gegner_name ?? '—'}
  Kennzeichen: ${fall.gegner_kennzeichen ?? '—'}
  VS: ${fall.gegner_versicherung ?? '—'}
  Schaden-Nr: ${fall.gegner_schadennummer ?? '—'}

Anhaenge: 0 (Smoke-Test ohne PDFs — bitte Vollmacht trotzdem ausstellen
für Mandant ${kundeName}, ${AARON.telefon})

Hinweis: Dies ist ein AUTOMATISIERTER SMOKE-TEST aus Claimondo-Staging.
Falls eine Vollmacht ausgestellt wird, bitte an ${AARON.email} senden.

— Claimondo (Aaron Sprafke, Smoke 13.05.2026)
`

// 5. Email senden
console.log('\n→ Sende Email via Resend…\n')
const result = await resend.emails.send({
  from: process.env.RESEND_FROM ?? 'Claimondo <noreply@claimondo.de>',
  to: LEXDRIVE_EMAIL,
  subject: `[SMOKE] Neuer Fall ${fall.fall_nummer} — ${kundeName} (Komplettpaket)`,
  text,
})

if (result.error) {
  console.error('❌ Resend-Fehler:', result.error)
  process.exit(1)
}

console.log(`✅ Email gesendet`)
console.log(`   messageId: ${result.data?.id}`)
console.log(`   to:        ${LEXDRIVE_EMAIL}`)
console.log(`   subject:   [SMOKE] Neuer Fall ${fall.fall_nummer} — ${kundeName} (Komplettpaket)\n`)

// 6. Timeline-Entry
await db.from('timeline').insert({
  fall_id: FALL_ID,
  typ: 'system',
  titel: 'LexDrive-Smoke ausgelöst',
  beschreibung: `Resend ${result.data?.id} an ${LEXDRIVE_EMAIL} mit Aaron-Daten (smoke 13.05.2026)`,
})

console.log('Erwartung:\n')
console.log(`  - LexDrive-Bot verarbeitet Email innerhalb weniger Minuten`)
console.log(`  - Vollmacht-Email kommt an: ${AARON.email}`)
console.log(`  - Optional Webhook-Callback auf /api/webhooks/lexdrive mit event_type='vollmacht_bestaetigt'`)
console.log(`  - Beobachten: webhook_events-Tabelle für ${fall.fall_nummer}\n`)
