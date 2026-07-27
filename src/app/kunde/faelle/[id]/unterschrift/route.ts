import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensureCanonicalFlowLinkForLead } from '@/lib/start-link/ensure-flowlink-for-lead'
import { externalUrl } from '@/lib/external-url'

// K6-Fix (Kunde-Detail-Audit 27.07.): die "Unterschrift ausstehend"-Aufgabe (kunde-zonen `sa_vollmacht`)
// zeigte auf `#zone-status` — eine Zone OHNE Signier-UI = Sackgasse (kein Portal-Nachsignier-Weg).
// SA/Vollmacht wird ausschliesslich im /flow/[token]-Flow signiert (FokusSignaturClient rendert den
// SaSignaturStep genau fuer sa_unterschrieben=false). Dieser Resolver holt/mint den kanonischen
// FlowLink des Falls (idempotent, service-role in ensureCanonicalFlowLinkForLead) und leitet dorthin.
// Route-Handler mit NextResponse.redirect statt page.tsx -> kein RSC-Redirect-Stub-Bug (React
// #310/#418, AGENTS redirect-stub-gate). externalUrl statt new URL(req.url): hinter nginx ist req.url
// der interne 0.0.0.0:3000-Origin.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(externalUrl(req, '/login'), 302)

  // Claim ist RLS-gescoped auf den Kunden -> ein Treffer beweist Ownership; lead_id speist den FlowLink.
  const { data: claim } = await supabase.from('claims').select('lead_id').eq('id', id).maybeSingle()
  if (!claim?.lead_id) return NextResponse.redirect(externalUrl(req, `/kunde/faelle/${id}`), 302)

  const link = await ensureCanonicalFlowLinkForLead(claim.lead_id as string)
  if (!link.ok) return NextResponse.redirect(externalUrl(req, `/kunde/faelle/${id}`), 302)

  return NextResponse.redirect(externalUrl(req, `/flow/${link.token}`), 302)
}
