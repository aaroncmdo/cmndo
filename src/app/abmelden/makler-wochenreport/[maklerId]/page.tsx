import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyWochenreportOptOut, wochenreportOptOutUrl } from '@/lib/makler/wochenreport-optout'

// Public Opt-out-/Opt-in-Seite fuer den Makler-Wochenreport (default-on Modell).
// Kein Auth — die HMAC-Signatur ueber die makler_id ist das Geheimnis.
// aktion=anmelden setzt das Abo wieder aktiv (versehentliche Abmeldung), sonst
// wird abgemeldet (abgemeldet_am gesetzt).

export const dynamic = 'force-dynamic'

export default async function MaklerWochenreportAbmeldenPage({
  params,
  searchParams,
}: {
  params: Promise<{ maklerId: string }>
  searchParams: Promise<{ sig?: string; aktion?: string }>
}) {
  const { maklerId } = await params
  const { sig, aktion } = await searchParams

  const gueltig = verifyWochenreportOptOut(maklerId, sig ?? null)
  const wiederAnmelden = aktion === 'anmelden'
  let ok = false

  if (gueltig) {
    const db = createServiceClient()
    const { error } = await db
      .from('makler')
      .update({ wochenreport_abgemeldet_am: wiederAnmelden ? null : new Date().toISOString() })
      .eq('id', maklerId)
    ok = !error
  }

  const resubscribeUrl = gueltig ? wochenreportOptOutUrl(maklerId) : null

  return (
    <main className="flex min-h-screen items-center justify-center bg-claimondo-bg px-4">
      <div className="w-full max-w-md rounded-ios-lg border border-claimondo-border bg-white p-8 text-center shadow-sm">
        {ok && !wiederAnmelden ? (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success-strong">
              ✓
            </div>
            <h1 className="text-heading-sm font-semibold text-claimondo-navy">Sie sind abgemeldet</h1>
            <p className="mt-2 text-body-sm text-claimondo-ondo">
              Sie erhalten den wöchentlichen Report nicht mehr. Ihre übrigen Benachrichtigungen
              bleiben unberührt.
            </p>
            {resubscribeUrl ? (
              <p className="mt-4 text-body-xs text-claimondo-ondo">
                Versehentlich abgemeldet?{' '}
                <Link href={`${resubscribeUrl}&aktion=anmelden`} className="text-claimondo-navy underline">
                  Wieder anmelden
                </Link>
              </p>
            ) : null}
          </>
        ) : ok && wiederAnmelden ? (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success-strong">
              ✓
            </div>
            <h1 className="text-heading-sm font-semibold text-claimondo-navy">Wieder angemeldet</h1>
            <p className="mt-2 text-body-sm text-claimondo-ondo">
              Sie erhalten den wöchentlichen Report wieder. Schön, dass Sie dabei bleiben!
            </p>
          </>
        ) : (
          <>
            <h1 className="text-heading-sm font-semibold text-claimondo-navy">Abmeldung nicht möglich</h1>
            <p className="mt-2 text-body-sm text-claimondo-ondo">
              Dieser Abmelde-Link ist ungültig. Bitte kontaktieren Sie uns unter{' '}
              <a href="mailto:kontakt@claimondo.de" className="text-claimondo-navy underline">
                kontakt@claimondo.de
              </a>
              , falls Sie den Report nicht mehr erhalten möchten.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
