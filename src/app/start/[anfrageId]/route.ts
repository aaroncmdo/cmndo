// AAR-956 Phase A · Task 4 — anon /start/[anfrageId]-Route.
//
// Der HMAC-gatete Main-App-Einstieg, den die Marketing-Live-Buchung ansteuert
// (commit 09ae79bff, Flag CANONICAL_FLOWLINK_ENABLED). Verwandelt eine Monika-
// Anfrage konversion-first in den EINEN kanonischen FlowLink:
//   1. exp+sig aus der Query → verifyStartSig (HMAC + TTL, fail-closed ohne Secret)
//   2. ok → issueCanonicalFlowLinkForAnfrage (gfa→Lead + flow_links + Versand)
//   3. → 307-Redirect auf /flow/[token] (der eine lead-gekeyte FlowLink)
//
// Anon: KEIN auth-Gate (der HMAC-Param IST das Gate). Kein /anfrage-self_service_token.

import { redirect } from 'next/navigation'
import { verifyStartSig } from '@/lib/start-link/verify-sig'
import { issueCanonicalFlowLinkForAnfrage } from '@/lib/start-link/issue-canonical-flowlink'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ anfrageId: string }> },
) {
  const { anfrageId } = await params
  const sp = new URL(req.url).searchParams
  const exp = sp.get('exp')
  const sig = sp.get('sig')

  const verify = verifyStartSig(anfrageId, exp, sig)
  if (!verify.ok) {
    console.error('[/start] Verify abgelehnt:', verify.reason, '— anfrage', anfrageId)
    redirect('/?startlink=ungueltig')
  }

  const issued = await issueCanonicalFlowLinkForAnfrage(anfrageId)
  if (!issued.ok) {
    console.error('[/start] Issue fehlgeschlagen:', issued.error, '— anfrage', anfrageId)
    redirect('/?startlink=fehler')
  }

  // Der EINE kanonische, lead-gekeyte FlowLink. 307 (redirect()-Default im Route-Handler).
  redirect(`/flow/${issued.token}`)
}
