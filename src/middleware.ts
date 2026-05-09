import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSession } from './lib/supabase/middleware'

// Subdomain-Routing: gutachter.claimondo.de → /gutachter-partner/*
// Muss als Early-Return VOR updateSession laufen, damit der Rewrite
// nicht durch den Auth-Guard als unprotected Route durchfällt.
// VPS-Merge 2026-05-09: proxy.ts (updateSession) + middleware.ts (subdomain)
// in eine Datei konsolidiert — Next.js 16 erlaubt nur einen Middleware-Einstieg.
export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? ''

  if (hostname === 'gutachter.claimondo.de') {
    const url = request.nextUrl.clone()
    const pathname = request.nextUrl.pathname
    if (!pathname.startsWith('/gutachter-partner')) {
      url.pathname = `/gutachter-partner${pathname === '/' ? '' : pathname}`
      return NextResponse.rewrite(url)
    }
  }

  return await updateSession(request)
}

export const config = {
  // Matcher aus proxy.ts übernommen (vollständiger Exclusion-Katalog):
  // .glb → Mapbox 3D-Modell; .js/.json → sw.js + manifest.json;
  // .obj/.mtl → Three.js OBJLoader; Rest → Standard Next.js-Artefakte.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb|gltf|obj|mtl|hdr|ktx2|woff|woff2|mp4|webm|js|json|txt|xml)$).*)',
  ],
}
