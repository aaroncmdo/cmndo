'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import type { FeedEntry } from '@/lib/community/feed'
import type { CommentPreview } from '@/lib/community/threads'
import { SectionCard } from '@/components/shared/SectionCard'
import { Badge } from '@/components/primitives'
import Avatar from '@/components/shared/Avatar'
import { melden } from '@/lib/community/actions'
import { LikeButton } from './LikeButton'
import { TopComments } from './TopComments'

// Einfacher relativer Zeit-Helper (de-DE).
function relativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then
  if (Number.isNaN(diffMs)) return iso

  const mins = Math.floor(diffMs / 60_000)
  if (mins < 2) return 'gerade eben'
  if (mins < 60) return `vor ${mins} Minuten`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `vor ${hrs} ${hrs === 1 ? 'Stunde' : 'Stunden'}`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`
  // Fallback: lesbares Datum
  return new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(iso),
  )
}

export type FeedCardProps = {
  entry: FeedEntry
  liked: boolean
  previews: CommentPreview[]
}

export function FeedCard({ entry, liked, previews }: FeedCardProps) {
  const targetKind = entry.kind === 'artikel' ? 'wissen' : 'post'

  const [reported, setReported] = useState(false)
  const [pending, startReport] = useTransition()

  function reportPost() {
    startReport(async () => {
      const res = await melden('post', entry.id)
      if (res.ok) setReported(true)
      else toast.error(res.error ?? 'Fehler')
    })
  }

  // Kopfzeile als SectionCard-Slot (icon-Prop nimmt ReactNode)
  const headSlot = (
    <div className="flex items-center gap-2 flex-wrap w-full">
      <Avatar url={null} name={entry.authorDisplay} size="sm" />
      <span className="text-body-sm font-semibold text-claimondo-navy leading-none">
        {entry.authorDisplay}
      </span>
      {entry.isRedaktion && (
        <Badge tone="info" size="sm">
          Redaktion
        </Badge>
      )}
      <span className="ml-auto text-caption text-claimondo-shield whitespace-nowrap">
        {relativeTime(entry.createdAt)}
      </span>
    </div>
  )

  return (
    <SectionCard icon={headSlot}>
      {/* Artikel-Titel → externer Link */}
      {entry.kind === 'artikel' && entry.slug && entry.title && (
        <a
          href={`https://claimondo.de/wissen/${entry.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-2 block text-heading-sm font-semibold text-claimondo-navy hover:text-claimondo-light-blue hover:underline transition-colors"
        >
          {entry.title}
        </a>
      )}

      {/* Fließtext */}
      <p className="text-body text-claimondo-navy">{entry.body}</p>

      {/* Tags */}
      {entry.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.tags.map(tag => (
            <Badge key={tag} tone="neutral" size="sm">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Interaktionszeile */}
      <div className="mt-3 flex items-center gap-3">
        <LikeButton
          targetKind={targetKind}
          targetId={entry.id}
          initialCount={entry.likeCount}
          initiallyLiked={liked}
        />
        {entry.kind === 'post' && (
          reported ? (
            <span className="text-body-xs text-claimondo-shield/50">Gemeldet — danke.</span>
          ) : (
            <button
              type="button"
              onClick={reportPost}
              disabled={pending}
              className="text-body-xs text-claimondo-shield/50 underline-offset-2 hover:text-claimondo-shield hover:underline disabled:opacity-50"
            >
              Melden
            </button>
          )
        )}
      </div>

      {/* Kommentar-Vorschau + Eingabe */}
      <TopComments
        targetKind={targetKind}
        targetId={entry.id}
        previews={previews}
        totalCount={entry.commentCount}
      />
    </SectionCard>
  )
}
