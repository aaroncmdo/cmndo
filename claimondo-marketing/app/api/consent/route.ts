import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Consent-Nachweis (Rechenschaftspflicht) fuer claimondo.de.
 *
 * Warum es diese Route hier ZUSAETZLICH gibt, obwohl sie in der App unter
 * src/app/api/consent/route.ts steht: `components/analytics/ConsentManager.tsx`
 * postet nach jeder Entscheidung an den RELATIVEN Pfad `/api/consent`. Der loest
 * auf der Domain auf, auf der die Seite laeuft — auf claimondo.de gab es die
 * Route aber nie. Gemessen 21.08.2026: `app.claimondo.de/api/consent` -> 200,
 * `claimondo.de/api/consent` -> 404 (GET und POST). Die Einwilligungen der
 * Marketing-Besucher wurden also NICHT protokolliert, waehrend
 * `consent_records` von der App her weiterlief (105 Zeilen) — die Luecke war
 * dadurch von aussen unsichtbar.
 *
 * ⚠ Die WIRKUNG des Consents war nie betroffen: die stellen
 * `gtag('consent','update')` + der Cookie der vanilla-cookieconsent-Lib her.
 * Betroffen war nur der serverseitige NACHWEIS — und der Call ist im
 * ConsentManager ein `void fetch(...)` in try/catch, scheiterte also lautlos.
 *
 * Bewusst same-origin statt absoluter App-URL (Aaron-Entscheid 21.08.2026):
 * kein CORS noetig und kein crawlbarer app.claimondo.de-Verweis im
 * Marketing-Frontend.
 *
 * Antwortet auch im Fehlerfall mit HTTP 200 — identisch zur App-Fassung: der
 * Aufrufer ist ein fire-and-forget-Beacon, ein 5xx erzeugte dort nur eine
 * unbehandelte Rejection ohne jeden Nutzen.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { categories?: unknown; policyVersion?: unknown }
    const categories = Array.isArray(body.categories) ? body.categories.map(String) : []
    const policyVersion = typeof body.policyVersion === 'string' ? body.policyVersion : 'unknown'
    const ua = (req.headers.get('user-agent') ?? '').slice(0, 300)
    const supabase = createAdminClient()
    const { error } = await supabase
      .from('consent_records')
      .insert({ categories, policy_version: policyVersion, user_agent: ua })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 200 })
  }
}
