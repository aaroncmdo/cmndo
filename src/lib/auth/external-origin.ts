// Zentraler Resolver fuer den EXTERNEN, browser-sichtbaren Origin (Scheme+Host)
// von Redirects aus Route-Handlern.
//
// Hintergrund (Staging-Setup-Bericht 2026-05-12 + FlowLink-Callback-Audit
// 2026-07-06): Hinter dem nginx/PM2-Standalone-Setup (Prod + Staging) enthaelt
// `new URL(request.url).origin` die INTERNE Bind-Adresse — 0.0.0.0:3000 (Prod)
// bzw. 0.0.0.0:3001 (Staging), NICHT app.claimondo.de. Ein Redirect auf diesen
// Origin schickt den Browser auf eine unerreichbare Adresse. Betroffen waren der
// Logout-Endpoint (2026-05-12 gefixt) sowie /api/auth/callback (Magic-Link-Login
// aus dem Kunden-Welcome-Flow) und /api/auth/linkedin/callback (Admin-OAuth), die
// beide den Origin aus request.url ableiteten → Login lief ins Leere.
//
// Loesung: nginx-Forwarded-Header (X-Forwarded-Host/-Proto) respektieren, dann den
// Host-Header, und nur als letzte Reserve (lokaler `npm run dev`) auf request.url
// zurueckfallen. Akzeptiert das breite `Request`-Interface (Web-Request +
// NextRequest), da nur `.headers.get()` + `.url` genutzt werden.

export function resolveExternalOrigin(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto')
  if (forwardedHost) {
    return `${forwardedProto ?? 'https'}://${forwardedHost}`
  }
  // Fallback: 'host'-Header (von jedem HTTP-Client gesetzt). request.url ist nur
  // die letzte Reserve fuer den lokalen Dev-Server.
  const host = request.headers.get('host')
  if (host) {
    const proto =
      forwardedProto ??
      (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https')
    return `${proto}://${host}`
  }
  return new URL(request.url).origin
}
