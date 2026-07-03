import { createServiceClient } from '@/lib/supabase/server'

// Public Opt-out-Seite für Win-back-Reaktivierungs-Mails (UWG-Abmeldung).
// GET setzt winback_opt_out=true idempotent für den Lead mit diesem reminder_token.
// Kein Auth (Lead ist nicht eingeloggt) — Token ist das Geheimnis.

export const dynamic = 'force-dynamic'

export default async function AbmeldenPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  let ok = false

  if (token && token.length >= 8) {
    const db = createServiceClient()
    const { error } = await db
      .from('leads')
      .update({ winback_opt_out: true })
      .eq('reminder_token', token)
    ok = !error
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-claimondo-bg px-4">
      <div className="w-full max-w-md rounded-ios-lg border border-claimondo-border bg-white p-8 text-center shadow-sm">
        {ok ? (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success-strong">
              ✓
            </div>
            <h1 className="text-heading-sm font-semibold text-claimondo-navy">Sie sind abgemeldet</h1>
            <p className="mt-2 text-body-sm text-claimondo-ondo">
              Wir schicken Ihnen keine Erinnerungen zu Ihrer Schadenmeldung mehr. Falls Sie Ihren
              Schaden doch noch regulieren möchten, können Sie sich jederzeit wieder bei uns melden.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-heading-sm font-semibold text-claimondo-navy">Abmeldung nicht möglich</h1>
            <p className="mt-2 text-body-sm text-claimondo-ondo">
              Dieser Abmelde-Link ist ungültig oder abgelaufen. Bitte kontaktieren Sie uns unter{' '}
              <a href="mailto:kontakt@claimondo.de" className="text-claimondo-navy underline">
                kontakt@claimondo.de
              </a>
              , falls Sie keine E-Mails mehr erhalten möchten.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
