import { getTerminByToken } from './actions'
import TerminClient from './TerminClient'

export default async function TerminPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { termin, error } = await getTerminByToken(token)

  if (error || !termin) {
    return (
      <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-xl shadow-black/10">
          <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl text-red-500">✗</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Link ungültig</h1>
          <p className="text-sm text-gray-500">{error || 'Dieser Link ist ungültig oder abgelaufen.'}</p>
        </div>
      </div>
    )
  }

  return <TerminClient termin={termin} token={token} />
}
