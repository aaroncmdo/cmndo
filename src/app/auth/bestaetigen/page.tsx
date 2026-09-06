import Link from 'next/link'
import { ShieldCheckIcon, AlertTriangleIcon } from 'lucide-react'
import { BestaetigenForm } from './BestaetigenForm'

// Klick-Bestaetigungs-Seite fuer Magic-Links + Passwort-Reset (Prefetch-Haertung).
//
// Der Mail-Link zeigt hierher (buildWelcomeConfirmLink). Diese Seite loest beim Laden (GET)
// NICHTS ein — sie rendert nur einen Button. Erst der Klick (POST -> Server-Action
// bestaetigeMagicLink) ruft verifyOtp und etabliert die Session. Mail-Scanner/Prefetcher/
// Link-Previews machen nur GET und koennen den Einmal-Token damit nicht mehr verbrennen.
//
// Public-Route (in middleware.ts als /auth/bestaetigen whitelisted) — der Empfaenger ist
// per Definition noch nicht eingeloggt.
export default async function BestaetigenPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>
}) {
  const params = await searchParams
  const tokenHash = params.token_hash ?? ''
  const type = params.type ?? ''
  const next = params.next ?? '/'
  const gueltig = tokenHash.length > 0 && type.length > 0

  const istReset = type === 'recovery'
  const zielText = istReset
    ? 'Danach können Sie Ihr neues Passwort festlegen.'
    : 'Danach werden Sie direkt angemeldet.'

  return (
    <div className="flex min-h-screen items-center justify-center px-5 relative overflow-hidden bg-claimondo-bg">
      {/* Ambient-Gradient Spotlights (analog /passwort-zuruecksetzen) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: [
            'radial-gradient(65% 55% at 85% 0%, rgba(123,163,204,.2), transparent 65%)',
            'radial-gradient(55% 65% at 0% 100%, rgba(69,115,162,.12), transparent 70%)',
          ].join(', '),
        }}
      />
      <div className="w-full max-w-sm relative z-10">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            <span className="text-claimondo-navy">Claim</span>
            <span className="text-claimondo-ondo">ondo</span>
          </h1>
          <p className="mt-2 text-sm text-claimondo-ondo">Sicherheitsbestätigung</p>
        </div>

        <div className="bg-white border border-claimondo-border rounded-ios-lg p-8 shadow-claimondo-md">
          {gueltig ? (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-ios-md bg-claimondo-ondo/10 flex items-center justify-center">
                  <ShieldCheckIcon className="w-5 h-5 text-claimondo-ondo" />
                </div>
                <div>
                  <p className="text-claimondo-navy font-medium text-sm">Fast geschafft</p>
                  <p className="text-claimondo-ondo text-xs">Nur noch ein Klick</p>
                </div>
              </div>
              <p className="text-claimondo-ondo text-sm leading-relaxed mb-6">
                Bitte bestätigen Sie zu Ihrer Sicherheit, dass Sie diesen Link selbst geöffnet haben.
                {' '}{zielText}
              </p>
              <BestaetigenForm tokenHash={tokenHash} type={type} next={next} />
            </>
          ) : (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto rounded-ios-md bg-amber-50 flex items-center justify-center mb-4">
                <AlertTriangleIcon className="w-7 h-7 text-amber-500" />
              </div>
              <p className="text-claimondo-navy font-semibold text-base mb-2">Link unvollständig</p>
              <p className="text-claimondo-ondo text-sm leading-relaxed mb-4">
                Dieser Bestätigungslink ist nicht mehr vollständig. Bitte fordere einen neuen an.
              </p>
              <Link
                href="/passwort-vergessen"
                className="inline-block w-full py-3 rounded-full bg-claimondo-ondo hover:bg-claimondo-shield text-white font-semibold text-sm tracking-[-.01em] shadow-cta-ondo transition-all duration-250 ease-[cubic-bezier(.32,.72,0,1)] text-center"
              >
                Neuen Link anfordern
              </Link>
            </div>
          )}
        </div>

        <p className="text-center text-claimondo-ondo text-xs mt-6">&copy; 2026 Claimondo GmbH</p>
      </div>
    </div>
  )
}
