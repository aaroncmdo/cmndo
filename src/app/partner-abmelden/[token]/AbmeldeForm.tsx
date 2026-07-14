'use client'
// Cold-Mailer S0: der Write passiert bewusst erst auf Klick, nie beim GET —
// Mail-Clients (Gmail/Outlook) prefetchen Links, ein GET-Write wuerde Empfaenger
// ungewollt abmelden.
import { useState } from 'react'
import { Button } from '@/components/primitives'
import { bestaetigeAbmeldung } from './actions'

export default function AbmeldeForm({ token, email }: { token: string; email: string }) {
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [fehler, setFehler] = useState<string | null>(null)

  async function abmelden() {
    setStatus('busy')
    setFehler(null)
    const res = await bestaetigeAbmeldung(token)
    if (res.ok) {
      setStatus('done')
      return
    }
    setFehler(res.error ?? 'Abmeldung fehlgeschlagen.')
    setStatus('error')
  }

  if (status === 'done') {
    return (
      <div className="mt-4">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success-strong">
          ✓
        </div>
        <p className="text-body-sm text-claimondo-ondo">
          Sie wurden abgemeldet. An <span className="font-medium text-claimondo-navy">{email}</span> gehen keine
          weiteren Nachrichten des Claimondo Partnernetzwerks mehr raus.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-4">
      <p className="text-body-sm text-claimondo-ondo">
        Möchten Sie <span className="font-medium text-claimondo-navy">{email}</span> von künftigen Nachrichten des
        Claimondo Partnernetzwerks abmelden?
      </p>
      <Button variant="navy" loading={status === 'busy'} onClick={abmelden}>
        Abmeldung bestätigen
      </Button>
      {status === 'error' && <p className="text-body-sm text-danger">{fehler}</p>}
    </div>
  )
}
