import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Subdomain-Routing: gutachter.claimondo.de → /gutachter-partner/*
// Alle anderen Domains (claimondo.de, app.claimondo.de) → normal
export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? ''

  if (hostname === 'gutachter.claimondo.de') {
    const url = request.nextUrl.clone()
    const pathname = request.nextUrl.pathname
    if (!pathname.startsWith('/gutachter-partner')) {
      url.pathname = `/gutachter-partner${pathname === '/' ? '' : pathname}`
      return NextResponse.rewrite(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|api/).*)'],
}
