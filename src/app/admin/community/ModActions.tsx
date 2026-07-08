'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { hidePost, deletePost, hideComment, deleteComment, blockUser } from './actions'

type PostActionsProps = { id: string; authorId: string; kind: 'post' }
type CommentActionsProps = { id: string; authorId: string; kind: 'comment' }
type Props = PostActionsProps | CommentActionsProps

export function ModActions({ id, authorId, kind }: Props) {
  const [pending, start] = useTransition()

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) toast.error(r.error ?? 'Fehler')
      else toast.success('Aktion durchgeführt')
    })

  const onHide = () =>
    act(() => (kind === 'post' ? hidePost(id) : hideComment(id)))

  const onDelete = () =>
    act(() => (kind === 'post' ? deletePost(id) : deleteComment(id)))

  const onBlock = () =>
    act(() => blockUser(authorId))

  return (
    <div className="flex flex-wrap gap-2">
      <button
        disabled={pending}
        onClick={onHide}
        className="rounded-ios-md bg-warning px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
      >
        Verstecken
      </button>
      <button
        disabled={pending}
        onClick={onDelete}
        className="rounded-ios-md bg-danger px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
      >
        Löschen
      </button>
      <button
        disabled={pending}
        onClick={onBlock}
        className="rounded-ios-md border border-claimondo-border px-2.5 py-1 text-xs text-claimondo-navy disabled:opacity-60"
      >
        Sperren
      </button>
    </div>
  )
}
