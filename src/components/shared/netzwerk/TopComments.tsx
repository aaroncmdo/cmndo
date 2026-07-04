'use client'
import { useState } from 'react'
import Avatar from '@/components/shared/Avatar'
import { Badge } from '@/components/primitives'
import type { CommentPreview } from '@/lib/community/threads'
import { LikeButton } from './LikeButton'
import { CommentThread } from './CommentThread'
import { CommentComposer } from './CommentComposer'

export function TopComments(props: {
  targetKind: 'post' | 'wissen'
  targetId: string
  previews: CommentPreview[]
  totalCount: number
}) {
  const [showAll, setShowAll] = useState(false)

  return (
    <div className="mt-3 space-y-3 border-t border-claimondo-border pt-3">
      {!showAll && props.previews.map(p => (
        <div key={p.comment.id} className="space-y-1">
          {/* Kommentar-Zeile */}
          <div className="flex items-center gap-2">
            <Avatar url={null} name={p.comment.authorDisplay} size="sm" />
            <span className="text-body-sm font-semibold text-claimondo-navy">{p.comment.authorDisplay}</span>
            {p.comment.isRedaktion && <Badge tone="info" size="sm">Redaktion</Badge>}
          </div>
          <p className="text-body-sm text-claimondo-navy">{p.comment.body}</p>
          <LikeButton
            targetKind="comment"
            targetId={p.comment.id}
            initialCount={p.comment.likeCount}
            initiallyLiked={p.comment.likedByMe}
          />

          {/* Top-Antwort eingerückt */}
          {p.topReply && (
            <div className="ml-6 mt-1 border-l border-claimondo-border pl-3">
              <div className="flex items-center gap-1.5">
                <Avatar url={null} name={p.topReply.authorDisplay} size="xs" />
                <span className="text-body-xs font-semibold text-claimondo-navy">{p.topReply.authorDisplay}</span>
                {p.topReply.isRedaktion && <Badge tone="info" size="sm">Redaktion</Badge>}
              </div>
              <p className="mt-0.5 text-body-xs text-claimondo-shield">{p.topReply.body}</p>
              <LikeButton targetKind="comment" targetId={p.topReply.id} initialCount={p.topReply.likeCount} initiallyLiked={p.topReply.likedByMe} />
            </div>
          )}

          {/* „N weitere Antworten" öffnet vollen Thread */}
          {p.replyCount > (p.topReply ? 1 : 0) && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="ml-6 text-body-xs text-claimondo-light-blue hover:underline"
            >
              {p.replyCount - (p.topReply ? 1 : 0)} weitere Antworten
            </button>
          )}
        </div>
      ))}

      {/* „Alle N Kommentare anzeigen" */}
      {props.totalCount > 0 && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-body-sm text-claimondo-light-blue hover:underline"
        >
          Alle {props.totalCount} Kommentare anzeigen
        </button>
      )}

      {showAll && (
        <CommentThread targetKind={props.targetKind} targetId={props.targetId} />
      )}

      {/* Kommentar-Eingabe immer sichtbar */}
      <CommentComposer targetKind={props.targetKind} targetId={props.targetId} />
    </div>
  )
}
