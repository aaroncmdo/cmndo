// AAR-702: Anon-Route für Kunde-Response auf SV-Gegenvorschlag.
import { getKundeTerminByToken } from './actions'
import KundeTerminClient from './KundeTerminClient'

export const dynamic = 'force-dynamic'

export default async function KundeTerminPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const { termin, error } = await getKundeTerminByToken(token)

  if (error || !termin) {
    return (
      <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-ios-lg p-8 text-center shadow-claimondo-lg shadow-black/10">
          <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl text-red-500">✗</span>
          </div>
          <h1 className="text-xl font-semibold text-claimondo-navy mb-2">Link nicht mehr gültig</h1>
          <p className="text-sm text-claimondo-ondo">
            {error ?? 'Dieser Link ist ungültig oder abgelaufen.'}
          </p>
        </div>
      </div>
    )
  }

  return <KundeTerminClient termin={termin} token={token} />
}
