import { NextResponse } from 'next/server'
import { externalOrigin } from '@/lib/external-url'

// Legacy-Confirm-Route — jetzt nur noch ein REDIRECT auf die Klick-Bestaetigungs-Seite.
//
// Frueher rief diese Route verifyOtp direkt beim GET auf und etablierte die Session. Das war
// prefetch-anfaellig: Mail-Scanner/Link-Previews/Prefetcher machen GET und verbrannten den
// Einmal-Token, BEVOR der Mensch klickte ("Link abgelaufen" trotz frischer Mail — auf prod
// beobachtet: /verify-303 zehn Sekunden nach dem Versand durch einen automatisierten Client).
//
// Neue Links (buildWelcomeConfirmLink) zeigen direkt auf /auth/bestaetigen. Diese Route bleibt
// nur fuer BEREITS VERSENDETE Mails erhalten und leitet sie auf denselben Klick-Gate — GET
// loest hier nichts mehr aus, verifyOtp passiert erst nach echtem Klick (POST) auf der Seite.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const origin = externalOrigin(request)

  const qs = new URLSearchParams()
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next')
  if (tokenHash) qs.set('token_hash', tokenHash)
  if (type) qs.set('type', type)
  if (next) qs.set('next', next)

  return NextResponse.redirect(`${origin}/auth/bestaetigen?${qs.toString()}`)
}
