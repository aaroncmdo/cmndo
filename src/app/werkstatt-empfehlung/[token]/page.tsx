// Kunde-Magic-Link (kein Login): der SV hat 1-3 Werkstaetten empfohlen, der Kunde
// waehlt hier eine aus. Muster: src/app/kunde-termin/[token]/page.tsx.
import { getWerkstattEmpfehlungByToken } from './actions'
import { WerkstattEmpfehlungClient } from './WerkstattEmpfehlungClient'

export const dynamic = 'force-dynamic'

export default async function WerkstattEmpfehlungPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const res = await getWerkstattEmpfehlungByToken(token)

  if (!res.ok) {
    return (
      <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-ios-lg p-8 text-center shadow-claimondo-lg shadow-black/10">
          <h1 className="text-xl font-semibold text-claimondo-navy mb-2">Link nicht mehr gültig</h1>
          <p className="text-sm text-claimondo-ondo">{res.error}</p>
        </div>
      </div>
    )
  }

  return <WerkstattEmpfehlungClient token={token} data={res.data} />
}
