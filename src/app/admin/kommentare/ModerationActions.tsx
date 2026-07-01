'use client'
import { useTransition } from 'react'
import { approveComment, rejectComment, hideComment, blockUser } from './actions'

export function ModerationActions({ id, authorId }: { id: string; authorId: string }) {
  const [pending, start] = useTransition()
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) alert(r.error ?? 'Fehler')
    })
  return (
    <div className="flex flex-wrap gap-2">
      <button disabled={pending} onClick={() => act(() => approveComment(id))} className="rounded-ios-md bg-success px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60">Freigeben</button>
      <button disabled={pending} onClick={() => act(() => hideComment(id))} className="rounded-ios-md bg-warning px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60">Verstecken</button>
      <button disabled={pending} onClick={() => act(() => rejectComment(id))} className="rounded-ios-md bg-danger px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60">Ablehnen</button>
      <button disabled={pending} onClick={() => act(() => blockUser(authorId))} className="rounded-ios-md border border-claimondo-border px-2.5 py-1 text-xs text-claimondo-navy disabled:opacity-60">Sperren</button>
    </div>
  )
}
