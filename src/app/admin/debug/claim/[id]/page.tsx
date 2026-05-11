// CMM-2 Debug-Endpunkt: zeigt für eine claim_id den rohen Loader-Output
// je Rolle als JSON. Dient ausschließlich der Verifikation, dass
// `getClaimForRole` für alle 5 Rollen die richtigen Spalten + Sub-Entities
// liefert. Admin-only.

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/guards'
import { getClaimForRole, resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { ROLLEN } from '@/lib/claims/types'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function DebugClaimPage({ params }: PageProps) {
  const guard = await requireRole(['admin'])
  if (!guard.success) redirect('/login')

  const { id: rawId } = await params
  if (!rawId) notFound()

  const supabase = await createClient()

  // ID kann claims.id oder faelle.id sein — auflösen
  const claimId = await resolveClaimId(supabase, rawId)
  const idResolved = claimId !== null && claimId !== rawId

  const results = claimId
    ? await Promise.all(
        ROLLEN.map(async (rolle) => ({
          rolle,
          claim: await getClaimForRole(supabase, claimId, rolle),
        })),
      )
    : []

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-claimondo-navy">
          Claim-Loader Debug · {claimId ?? rawId}
        </h1>
        <p className="text-xs text-claimondo-ondo">
          CMM-2: roher getClaimForRole-Output je Rolle. Felder die je Rolle
          fehlen sind absichtlich nicht selektiert (Need-to-know).
        </p>
        {idResolved && (
          <p className="mt-1 text-xs text-amber-700">
            URL enthielt eine <code className="font-mono">faelle.id</code> —
            wurde zu <code className="font-mono">claims.id = {claimId}</code> aufgelöst.
          </p>
        )}
        {!claimId && (
          <p className="mt-1 text-xs text-red-700">
            Keine Claim-ID gefunden — weder in <code>claims</code> noch in <code>faelle</code>.
          </p>
        )}
      </div>

      {results.map(({ rolle, claim }) => (
        <details
          key={rolle}
          className="rounded-md border border-claimondo-border bg-white p-3"
          open={rolle === 'admin'}
        >
          <summary className="cursor-pointer text-sm font-medium text-claimondo-navy">
            Rolle: <span className="font-mono">{rolle}</span>
            {claim ? (
              <span className="ml-2 text-emerald-700 text-xs">
                ✓ {Object.keys(claim).length} Spalten geladen
              </span>
            ) : (
              <span className="ml-2 text-red-700 text-xs">✗ kein Claim sichtbar</span>
            )}
          </summary>
          <pre className="mt-2 max-h-[600px] overflow-auto rounded bg-claimondo-bg p-2 text-[11px] font-mono leading-tight">
            {JSON.stringify(claim, null, 2)}
          </pre>
        </details>
      ))}
    </div>
  )
}
