// Werkstatt-QR-Pool — Inbound-Einstieg. Der Kunde scannt einen vorgedruckten
// Pool-QR (/start/werkstatt-qr/<token>). Ist der Token einer Werkstatt
// zugewiesen, delegieren wir an die bestehende Werkstatt-Attribution
// (/start/werkstatt/<werkstatt_id>). Sonst: freundliche "noch nicht aktiviert"-Seite.

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function WerkstattQrStartPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const t = decodeURIComponent(token ?? '').trim().toUpperCase()

  if (t) {
    const db = createAdminClient()
    const { data: pool } = await db
      .from('werkstatt_qr_pool')
      .select('werkstatt_id, status')
      .eq('token', t)
      .maybeSingle()
    const p = pool as { werkstatt_id: string | null; status: string } | null
    if (p && p.status === 'zugewiesen' && p.werkstatt_id) {
      // Delegation an die bestehende Attribution (validiert Werkstatt + montiert Wizard).
      redirect(`/start/werkstatt/${p.werkstatt_id}`)
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center bg-claimondo-bg p-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-heading-md text-claimondo-navy font-bold">
          QR-Code noch nicht aktiviert
        </h1>
        <p className="text-body text-claimondo-ondo">
          Dieser QR-Code ist noch keiner Werkstatt zugewiesen. Bitte wenden Sie sich an
          Ihre Werkstatt — oder melde Ihren Schaden direkt bei Claimondo.
        </p>
        <a
          href="/schaden-melden"
          className="inline-flex items-center justify-center rounded-ios-lg bg-claimondo-navy px-5 py-2.5 font-medium text-white"
        >
          Schaden melden
        </a>
      </div>
    </main>
  )
}
