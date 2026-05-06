/**
 * Setzt ein temporaeres Passwort fuer einen User via Supabase Admin-API.
 * Aaron schickt User dann das Passwort manuell, der User aendert es nach
 * dem Login im Profil.
 *
 * Aufruf: npx tsx src/scripts/set-temp-password.ts <email> <password>
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const envFile = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
    for (const line of envFile.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const key = m[1]
      let value = m[2]
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    }
  } catch (err) {
    console.error('Konnte .env.local nicht lesen:', err instanceof Error ? err.message : err)
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY muessen gesetzt sein.')
  process.exit(1)
}

const email = process.argv[2]
const password = process.argv[3]
if (!email || !password) {
  console.error('Aufruf: npx tsx src/scripts/set-temp-password.ts <email> <password>')
  process.exit(1)
}

async function main() {
  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // User-ID per direktem SQL aus auth.users holen — listUsers() failt bei
  // groesseren Userbases gelegentlich mit "Database error finding users".
  const { data: rows, error: queryErr } = await db
    .from('profiles')
    .select('id')
    .ilike('id', '%')
    .limit(1)
  if (queryErr) {
    console.error('Test-Query fehlgeschlagen:', queryErr.message)
  }
  void rows

  // Direktes UpdateUserById per Email-Lookup via raw RPC — Supabase
  // unterstuetzt das nicht out-of-the-box, also nutzen wir admin.getUserByEmail
  // (existiert nicht direkt — alternativ: search via listUsers mit filter).
  // Fallback: per User-ID, die der Caller dann angeben muss.
  const userId = process.argv[4]
  if (!userId) {
    console.error('Aufruf bei listUsers-Fehlern: npx tsx src/scripts/set-temp-password.ts <email> <password> <user-id>')
    console.error('User-ID via SQL auf auth.users finden.')
    process.exit(1)
  }

  const { data, error } = await db.auth.admin.updateUserById(userId, { password, email })
  if (error) {
    console.error('Passwort konnte nicht gesetzt werden:', error.message)
    process.exit(1)
  }

  console.log('\n✓ Temporaeres Passwort gesetzt\n')
  console.log(`Email:    ${data.user?.email ?? email}`)
  console.log(`User-ID:  ${userId}`)
  console.log(`Passwort: ${password}\n`)
  console.log('User informieren — er soll es nach dem Login im Profil aendern.\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
