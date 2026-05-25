import { NextResponse } from 'next/server'

// Doc 34 Task 0b.4 — Kurz-URL fuer QR-Codes, Visitenkarten, Press-/Social-Posts.
//   /sv?plz=50670   -> /gutachter-finden?plz=50670
//   /sv?stadt=Koeln -> /gutachter-finden?stadt=Koeln
//   /sv             -> /gutachter-finden
// Bewusst als Route-Handler mit NextResponse.redirect(308) statt page.tsx +
// redirect() aus next/navigation (Letzteres triggert den RSC-Redirect-Stub-Bug,
// React #310/#418 — siehe AGENTS / feedback_rsc_redirect_stubs). 308 = permanent
// + method-preserving (konsistent mit next.config `permanent: true`).
export function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const plz = searchParams.get('plz')
  const stadt = searchParams.get('stadt')

  let target = '/gutachter-finden'
  if (plz && /^\d{5}$/.test(plz)) {
    target = `/gutachter-finden?plz=${plz}`
  } else if (stadt) {
    target = `/gutachter-finden?stadt=${encodeURIComponent(stadt)}`
  }

  return NextResponse.redirect(new URL(target, req.url), 308)
}
