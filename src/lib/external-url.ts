import type { NextRequest } from 'next/server'

// Hinter dem nginx-Reverse-Proxy ist `request.url` der INTERNE Listen-Origin
// (z.B. http://0.0.0.0:3001). Redirects oder OAuth-redirect_uris, die daraus
// gebaut werden, leaken `0.0.0.0:3001` an den Browser bzw. an Google.
// Die externe Origin kommt aus den X-Forwarded-Headern (nginx setzt sie),
// Fallback auf `host`, erst danach auf `request.url` (lokaler Dev).
//
// Gleiche Logik wie die lokale `externalUrl` in src/lib/supabase/middleware.ts
// (2026-05-12) — hier als Shared-Util, damit OAuth-Routen sie mitnutzen,
// statt erneut `new URL(path, req.url)` zu bauen.
export function externalOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto')
  if (forwardedHost) {
    return `${forwardedProto ?? 'https'}://${forwardedHost}`
  }
  const host = request.headers.get('host')
  if (host) {
    const proto =
      forwardedProto ??
      (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https')
    return `${proto}://${host}`
  }
  return new URL(request.url).origin
}

export function externalUrl(request: NextRequest, path: string): URL {
  return new URL(path, externalOrigin(request))
}
