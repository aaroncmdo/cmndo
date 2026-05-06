/**
 * Generiert einen Passwort-Reset-Link via Supabase Admin-API für eine
 * angegebene Email-Adresse. Aaron kann den Link dann manuell teilen
 * (z.B. via WhatsApp).
 *
 * Aufruf: npx tsx src/scripts/password-reset-link.ts <email>
 *
 * Laedt .env.local automatisch (gleicher Mechanismus wie seed-test-data.ts).
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
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY muessen gesetzt sein.')
  process.exit(1)
}

const email = process.argv[2]
if (!email) {
  console.error('Aufruf: npx tsx src/scripts/password-reset-link.ts <email>')
  process.exit(1)
}

async function main() {
  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await db.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: {
      redirectTo: `${APP_URL}/passwort-zuruecksetzen`,
    },
  })

  if (error) {
    console.error('Fehler:', error.message)
    process.exit(1)
  }

  console.log('\n✓ Reset-Link generiert\n')
  console.log(`Email:   ${email}`)
  console.log(`Link:    ${data.properties?.action_link ?? '(fehlt)'}`)
  console.log(`Gueltig: 1 Stunde\n`)
  console.log('Diesen Link an den User schicken — beim Klick kann er ein neues Passwort setzen.\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
