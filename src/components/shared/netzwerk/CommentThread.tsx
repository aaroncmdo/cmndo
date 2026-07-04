'use client'
import { useState, useTransition, useEffect } from 'react'
import { toast } from 'sonner'
import Avatar from '@/components/shared/Avatar'
import { Badge } from '@/components/primitives'
import { Button } from '@/components/primitives'
import type { CommentRow } from '@/lib/community/threads'
import { ladeThread, melden } from '@/lib/community/actions'
import { LikeButton } from './LikeButton'
import { CommentComposer } from './CommentComposer'

// ---------------------------------------------------------------------------
// Single reply row — no interactive sub-actions (replies are flat in DB)
// ---------------------------------------------------------------------------
function ReplyRow({
  reply,
  topCommentId,
  targetKind,
  targetId,
  onReplyDone,
}: {
  reply: CommentRow
  topCommentId: string
  targetKind: 'post' | 'wissen'
  targetId: string
  onReplyDone: () => void
}) {
  const [reported, setReported] = useState(false)
  const [showReply, setShowReply] = useState(false)
  const [pending, start] = useTransition()

  function reportThis() {
    start(async () => {
      const r = await melden('comment', reply.id)
      if (r.ok) setReported(true)
      else toast.error(r.error ?? 'Melden fehlgeschlagen.')
    })
  }

  return (
    <li className="rounded-ios-sm border border-claimondo-border/60 bg-claimondo-bg p-2.5">
      <div className="flex items-center gap-2">
        <Avatar url={null} name={reply.authorDisplay} size="xs" />
        <span className="text-body-xs font-semibold text-claimondo-navy">{reply.authorDisplay}</span>
        {reply.isRedaktion && <Badge tone="info" size="sm">Redaktion</Badge>}
        <span className="ml-auto shrink-0 text-body-xs text-claimondo-shield/50">
          {new Date(reply.createdAt).toLocaleDateString('de-DE')}
        </span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-body-xs leading-relaxed text-claimondo-shield">
        {reply.body}
      </p>
      <div className="mt-1.5 flex items-center gap-3">
        <LikeButton targetKind="comment" targetId={reply.id} initialCount={reply.likeCount} initiallyLiked={false} />
        {!showReply && (
          <button
            type="button"
            onClick={() => setShowReply(true)}
            className="text-body-xs text-claimondo-shield/60 underline-offset-2 hover:text-claimondo-shield hover:underline"
          >
            Antworten
          </button>
        )}
        {reported ? (
          <span className="text-body-xs text-claimondo-shield/50">Gemeldet — danke.</span>
        ) : (
          <button
            type="button"
            onClick={reportThis}
            disabled={pending}
            className="text-body-xs text-claimondo-shield/50 underline-offset-2 hover:text-claimondo-shield hover:underline disabled:opacity-50"
          >
            Melden
          </button>
        )}
      </div>
      {/* Reply-auf-Reply: DB erlaubt nur 1 Ebene → parentId = top comment id, @mention = reply.authorDisplay */}
      {showReply && (
        <div className="mt-2">
          <CommentComposer
            targetKind={targetKind}
            targetId={targetId}
            parentId={topCommentId}
            mention={reply.authorDisplay}
            onDone={() => { setShowReply(false); onReplyDone() }}
          />
        </div>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Single top-level comment row with replies
// ---------------------------------------------------------------------------
function CommentItem({
  comment,
  replies,
  targetKind,
  targetId,
  onRefresh,
}: {
  comment: CommentRow
  replies: CommentRow[]
  targetKind: 'post' | 'wissen'
  targetId: string
  onRefresh: () => void
}) {
  const [showReply, setShowReply] = useState(false)
  const [reported, setReported] = useState(false)
  const [pending, start] = useTransition()

  function reportThis() {
    start(async () => {
      const r = await melden('comment', comment.id)
      if (r.ok) setReported(true)
      else toast.error(r.error ?? 'Melden fehlgeschlagen.')
    })
  }

  return (
    <li className="space-y-2">
      <div className="rounded-ios-sm border border-claimondo-border bg-white p-3">
        <div className="flex items-center gap-2">
          <Avatar url={null} name={comment.authorDisplay} size="sm" />
          <span className="text-body-sm font-semibold text-claimondo-navy">{comment.authorDisplay}</span>
          {comment.isRedaktion && <Badge tone="info" size="sm">Redaktion</Badge>}
          <span className="ml-auto shrink-0 text-body-xs text-claimondo-shield/50">
            {new Date(comment.createdAt).toLocaleDateString('de-DE')}
          </span>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-body-sm leading-relaxed text-claimondo-shield">
          {comment.body}
        </p>
        <div className="mt-2 flex items-center gap-3">
          <LikeButton targetKind="comment" targetId={comment.id} initialCount={comment.likeCount} initiallyLiked={false} />
          {!showReply && (
            <button
              type="button"
              onClick={() => setShowReply(true)}
              className="text-body-xs text-claimondo-shield/60 underline-offset-2 hover:text-claimondo-shield hover:underline"
            >
              Antworten
            </button>
          )}
          {reported ? (
            <span className="text-body-xs text-claimondo-shield/50">Gemeldet — danke.</span>
          ) : (
            <button
              type="button"
              onClick={reportThis}
              disabled={pending}
              className="text-body-xs text-claimondo-shield/50 underline-offset-2 hover:text-claimondo-shield hover:underline disabled:opacity-50"
            >
              Melden
            </button>
          )}
        </div>

        {showReply && (
          <div className="mt-2">
            <CommentComposer
              targetKind={targetKind}
              targetId={targetId}
              parentId={comment.id}
              onDone={() => { setShowReply(false); onRefresh() }}
            />
          </div>
        )}
      </div>

      {/* Replies — 1 Ebene eingerückt */}
      {replies.length > 0 && (
        <ul className="ml-6 space-y-1.5">
          {replies.map(r => (
            <ReplyRow
              key={r.id}
              reply={r}
              topCommentId={comment.id}
              targetKind={targetKind}
              targetId={targetId}
              onReplyDone={onRefresh}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// CommentThread — lädt volles Thread via ladeThread, 2 Ebenen
// ---------------------------------------------------------------------------
export function CommentThread(props: { targetKind: 'post' | 'wissen'; targetId: string }) {
  const [top, setTop] = useState<CommentRow[]>([])
  const [repliesByParent, setRepliesByParent] = useState<Record<string, CommentRow[]>>({})
  const [loading, startLoad] = useTransition()

  function refresh() {
    startLoad(async () => {
      const t = await ladeThread(props.targetKind, props.targetId)
      setTop(t.top)
      setRepliesByParent(t.repliesByParent)
    })
  }

  // Initial load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh() }, [props.targetKind, props.targetId])

  if (loading && top.length === 0) {
    return <p className="text-body-sm text-claimondo-shield/60">Kommentare werden geladen…</p>
  }

  if (!loading && top.length === 0) {
    return <p className="text-body-sm text-claimondo-shield/60">Noch keine Kommentare — schreib den ersten.</p>
  }

  return (
    <ul className="space-y-2">
      {top.map(c => (
        <CommentItem
          key={c.id}
          comment={c}
          replies={repliesByParent[c.id] ?? []}
          targetKind={props.targetKind}
          targetId={props.targetId}
          onRefresh={refresh}
        />
      ))}
    </ul>
  )
}
