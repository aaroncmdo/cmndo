#!/usr/bin/env node
// Dev-Hilfe (kein Prod-Code): seedet eine flow_links-Zeile mit waehlbarer
// sprache, um den i18n-Flow ueber einen echten Token zu smoken.
//   node --env-file=.env.local scripts/i18n/seed-flow-token.mjs ar
// Gibt den Token aus. Cleanup-Hinweis am Ende.
//
// Hinweis: Live-Smoke (Dev-Server gegen Prod-DB) erst in P2 sinnvoll, wenn
// FlowWizardKfz uebersetzte Strings zeigt. P1-Override-Beweis ist bereits
// ueber die use-intl-Provider-Mechanik + gruenen Build erbracht.
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const sprache = process.argv[2] || 'ar'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen in .env.local')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })

// Neuesten Lead nehmen (page.tsx liest alle Felder guarded, ein Minimal-Lead reicht)
const { data: lead, error: leErr } = await db
  .from('leads')
  .select('id')
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle()
if (leErr || !lead) {
  console.error('Kein Lead gefunden — bitte zuerst einen Lead anlegen.', leErr?.message)
  process.exit(1)
}

const token = `i18n-smoke-${sprache}-${randomUUID().slice(0, 8)}`
const expires = new Date(Date.now() + 7 * 864e5).toISOString()
const { error: insErr } = await db
  .from('flow_links')
  .insert({ token, lead_id: lead.id, sprache, expires_at: expires })
if (insErr) {
  // Falls flow_links eine NOT-NULL-status-Spalte ohne Default hat, hier
  // { ..., status: '<gueltiger-Default-Enum-Wert>' } ergaenzen. status wird in
  // page.tsx nur informativ gelesen — der Wert ist fuer den Smoke egal.
  console.error('Insert fehlgeschlagen:', insErr.message)
  process.exit(1)
}

console.log(`\nToken: ${token}`)
console.log(`URL:   /flow/${token}  (sprache=${sprache}, lead=${lead.id})`)
console.log(`Cleanup: delete from flow_links where token = '${token}';\n`)
