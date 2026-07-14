// Cold-Mailer S0: oeffentliche Abmelde-Seite fuer Cold-Mails (Pflicht-Abmeldelink
// + Ziel des List-Unsubscribe-Headers). Kein Auth — der HMAC-Token IST die Identitaet.
//
// Pfad BEWUSST NICHT '/abmelden': app.claimondo.de/abmelden/* steht in
// MARKETING_PREFIXES (proxy.ts) und wird per 301 auf claimondo.de geschickt, wo es
// 404t (tote Zone — per curl auf prod verifiziert, trifft heute den Winback-Link).
// Analog zum Praezedenzfall /wochenreport-abmelden (PR #3660).
import { Card } from '@/components/primitives'
import { verifyOptoutToken } from '@/lib/cold-mail/optout-token'
import AbmeldeForm from './AbmeldeForm'

export const dynamic = 'force-dynamic'

export default async function PartnerAbmeldenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let email: string | null = null
  try {
    email = verifyOptoutToken(token)
  } catch {
    // Fehlendes Secret -> wie ungueltiger Link behandeln (nie 500 auf einem
    // Pflicht-Abmeldelink); die Action loggt den echten Grund.
    email = null
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-claimondo-bg px-4">
      <Card p={8} radius="lg" className="w-full max-w-md text-center">
        <h1 className="text-heading-sm font-semibold text-claimondo-navy">Abmelden</h1>
        {email ? (
          <AbmeldeForm token={token} email={email} />
        ) : (
          <p className="mt-4 text-body-sm text-claimondo-ondo">
            Dieser Abmelde-Link ist ungültig oder abgelaufen. Bitte schreiben Sie an{' '}
            <a href="mailto:kontakt@claimondo.de" className="text-claimondo-navy underline">
              kontakt@claimondo.de
            </a>
            , wenn Sie keine Nachrichten mehr erhalten möchten.
          </p>
        )}
      </Card>
    </main>
  )
}
