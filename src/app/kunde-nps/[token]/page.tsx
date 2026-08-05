// GEO-P2 SP2: Anon-Route für die NPS-Umfrage. Kein Login.
import { Card } from '@/components/primitives'
import { getNpsByToken } from './actions'
import { NpsFormClient } from './NpsFormClient'

export const dynamic = 'force-dynamic'

export default async function KundeNpsPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ abmelden?: string }>
}) {
  const { token } = await params
  const { abmelden } = await searchParams
  const { feedback, error } = await getNpsByToken(token)

  return (
    <div className="min-h-screen flex items-center justify-center bg-claimondo-bg p-4">
      {error || !feedback ? (
        <Card className="max-w-md w-full text-center">
          <p className="text-claimondo-navy">{error ?? 'Link nicht mehr gültig.'}</p>
        </Card>
      ) : (
        <NpsFormClient token={token} claimNummer={feedback.claim_nummer} startAbmelden={abmelden === '1'} />
      )}
    </div>
  )
}
