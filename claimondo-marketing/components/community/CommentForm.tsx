'use client'
import { useState, useTransition } from 'react'
import { requestCommentLogin, ensureUsername, submitComment } from '@/lib/community/actions'

type Stage = 'email' | 'username' | 'comment' | 'sent' | 'posted'

export function CommentForm({ slug, isLoggedIn, hasUsername, username }: { slug: string; isLoggedIn: boolean; hasUsername: boolean; username?: string | null }) {
  const initial: Stage = !isLoggedIn ? 'email' : !hasUsername ? 'username' : 'comment'
  const [stage, setStage] = useState<Stage>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function run(action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, fd: FormData, onOk: () => void) {
    setError(null)
    start(async () => {
      const r = await action(fd)
      if (r.ok) onOk()
      else setError(r.error ?? 'Fehler')
    })
  }

  const input = 'w-full rounded-ios-md border border-claimondo-border bg-white px-3 py-2.5 text-sm focus:border-claimondo-ondo focus:outline-none'
  const btn = 'rounded-ios-md bg-claimondo-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-claimondo-shield disabled:opacity-60'

  if (stage === 'sent') return <p className="text-sm text-claimondo-shield">Wir haben Ihnen einen Anmelde-Link per E-Mail geschickt. Bitte prüfen Sie Ihr Postfach.</p>
  if (stage === 'posted') return <p className="text-sm text-claimondo-shield">Danke! Ihr Kommentar wird nach kurzer Prüfung freigeschaltet.</p>

  return (
    <form
      className="mt-4 space-y-2.5"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        fd.set('slug', slug)
        if (stage === 'email') run(requestCommentLogin, fd, () => setStage('sent'))
        else if (stage === 'username') run(ensureUsername, fd, () => setStage('comment'))
        else run(submitComment, fd, () => setStage('posted'))
      }}
    >
      {stage === 'email' && (
        <input name="email" type="email" required placeholder="Ihre E-Mail (für den Anmelde-Link)" className={input} />
      )}
      {stage === 'username' && (
        <>
          <p className="text-[0.8125rem] text-claimondo-shield">
            Sie sind angemeldet – wählen Sie jetzt einmalig einen öffentlichen Nutzernamen für Ihre Kommentare.
          </p>
          <input name="username" required placeholder="Nutzername (3–24 Zeichen)" className={input} />
          <label className="flex items-start gap-2 text-[0.75rem] text-claimondo-shield">
            <input type="checkbox" name="consent" className="mt-0.5" />
            <span>Ich bin einverstanden, dass mein Nutzername und Kommentar gespeichert und öffentlich angezeigt werden.</span>
          </label>
        </>
      )}
      {stage === 'comment' && (
        <>
          {username && (
            <p className="text-[0.8125rem] text-claimondo-shield">
              Sie kommentieren <span className="font-medium">öffentlich</span> als <span className="font-semibold text-claimondo-navy">{username}</span>.
            </p>
          )}
          <textarea name="body" required maxLength={2000} rows={3} placeholder="Ihren Kommentar schreiben …" className={input} />
          <p className="text-[0.7rem] leading-relaxed text-claimondo-shield/70">
            Bitte beachten Sie die{' '}
            <a href="/kommentar-regeln" className="underline hover:text-claimondo-shield">Kommentar-Regeln</a>{' '}
            – keine sensiblen oder fremden personenbezogenen Daten.
          </p>
        </>
      )}
      {error && <p className="text-[0.8125rem] text-danger-strong">{error}</p>}
      <button type="submit" disabled={pending} className={btn}>
        {stage === 'email' ? 'Anmelde-Link senden' : stage === 'username' ? 'Nutzername setzen' : 'Kommentar abschicken'}
      </button>
    </form>
  )
}
