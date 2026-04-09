import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  // Collect cookies that need to be set on the response
  const cookiesToUpdate: { name: string; value: string; options: Record<string, unknown> }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // CRITICAL FIX: Do NOT call request.cookies.set() — it corrupts
          // the cookie store in Next.js 16 proxy and causes TypeError.
          // Instead, collect cookies and apply them only to the response.
          cookiesToUpdate.push(...cookiesToSet.map(c => ({
            name: c.name,
            value: c.value,
            options: c.options ?? {},
          })))
        },
      },
    }
  )

  // CRITICAL: getUser() kann bei korrupten Cookies intern crashen.
  let user = null
  try {
    const result = await supabase.auth.getUser()
    user = result?.data?.user ?? null
  } catch {
    user = null
  }

  // KFZ-148 Lueckenfix (BUG-A.1): x-pathname Header injizieren damit Server
  // Components / Layouts den aktuellen Pfad zuverlaessig lesen koennen
  // (statt sich auf non-standard x-next-url / x-invoke-path zu verlassen).
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', request.nextUrl.pathname)

  // Build response — modified request headers werden via { request: { headers } }
  // an die nachgelagerten Server Components weitergegeben.
  const response = !user && !isPublicPath(request.nextUrl.pathname)
    ? NextResponse.redirect(new URL('/login', request.url))
    : NextResponse.next({ request: { headers: requestHeaders } })

  // Apply collected cookie updates to response
  for (const cookie of cookiesToUpdate) {
    response.cookies.set(cookie.name, cookie.value, cookie.options)
  }

  return response
}

function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true
  const publicPaths = ['/login', '/flow', '/api', '/passwort-aendern', '/sv']
  return publicPaths.some(path => pathname.startsWith(path))
}
