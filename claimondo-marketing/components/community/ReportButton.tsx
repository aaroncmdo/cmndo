'use client'
import { useState, useTransition } from 'react'
import { reportComment } from '@/lib/community/actions'

/** Kleiner "Melden"-Link je Kommentar (Notice-and-Takedown). Login-pflichtig serverseitig. */
export function ReportButton({ commentId, isLoggedIn }: { commentId: string; isLoggedIn: boolean }) {
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (done) return <span className="shrink-0 text-[0.7rem] text-claimondo-shield/60">Gemeldet – danke.</span>

  return (
    <span className="shrink-0 text-[0.7rem]">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null)
            const r = await reportComment(commentId)
            if (r.ok) setDone(true)
            else setError(r.error ?? 'Fehler')
          })
        }
        className="text-claimondo-shield/55 underline-offset-2 transition hover:text-claimondo-shield hover:underline disabled:opacity-50"
        title={isLoggedIn ? 'Diesen Kommentar melden' : 'Zum Melden bitte zuerst anmelden'}
      >
        {pending ? 'Melde…' : 'Melden'}
      </button>
      {error && <span className="ml-1.5 text-danger-strong">{error}</span>}
    </span>
  )
}
