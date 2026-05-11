/**
 * Smoke-Test fuer den Kanzlei-Mandat-Push.
 *
 * Triggert den echten pushMandatToKanzlei()-Codepfad mit einem real
 * existierenden Fall aus der DB. Verifiziert End-to-End:
 *   1. Salesforce-OAuth via client_credentials (sf-auth.ts)
 *   2. Apex-REST POST /services/apexrest/mandate
 *   3. DB-Update faelle.mandatsnummer
 *   4. Timeline-Eintrag "Mandat an Kanzlei uebergeben"
 *   5. LexDrive-Side-Effect: WhatsApp mit Vollmacht an kunde_telefon
 *
 * Aufruf:
 *   # ENV exportieren (nur die fuer Kanzlei noetigen)
 *   for k in KANZLEI_API_ENABLED KANZLEI_SF_AUTH_URL KANZLEI_SF_API_URL \
 *            KANZLEI_SF_CLIENT_ID KANZLEI_SF_CLIENT_SECRET \
 *            NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do
 *     export $k="$(grep "^$k=" .env.local | cut -d= -f2-)"
 *   done
 *
 *   npx tsx scripts/trigger-mandat-smoke.ts <fallId>
 *
 * VORAUSSETZUNG: Der Fall muss service_typ='komplett' + kunde_telefon haben.
 */
import { pushMandatToKanzlei } from '../src/lib/kanzlei/push-mandat'

const fallId = process.argv[2]
if (!fallId) {
  console.error('Usage: npx tsx scripts/trigger-mandat-smoke.ts <fallId>')
  process.exit(1)
}

;(async () => {
  console.log('[smoke] ENV-Check:')
  console.log('  KANZLEI_API_ENABLED  =', process.env.KANZLEI_API_ENABLED)
  console.log('  KANZLEI_SF_AUTH_URL  =', process.env.KANZLEI_SF_AUTH_URL?.slice(0, 70))
  console.log('  KANZLEI_SF_CLIENT_ID =', process.env.KANZLEI_SF_CLIENT_ID ? 'gesetzt' : 'FEHLT')
  console.log('  CLIENT_SECRET set?  =', !!process.env.KANZLEI_SF_CLIENT_SECRET)
  console.log('  SUPABASE_URL        =', process.env.NEXT_PUBLIC_SUPABASE_URL)
  console.log('  SERVICE_ROLE set?   =', !!process.env.SUPABASE_SERVICE_ROLE_KEY)
  console.log('')
  console.log('[smoke] pushMandatToKanzlei(', fallId, ')...')
  const result = await pushMandatToKanzlei(fallId)
  console.log('[smoke] Result:')
  console.log(JSON.stringify(result, null, 2))
  if (!result.success) process.exit(1)
})().catch((err) => {
  console.error('[smoke] CRASH:', err)
  process.exit(1)
})
