'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import type { FeedEntry, CommentRow } from '@/lib/community/community-queries'
import { reportCommunityTarget } from '@/lib/community/community-actions'
import { loadThread } from '@/lib/community/thread-loader'
import { LikeButton } from './LikeButton'
import { PostComments } from './PostComments'
import { PartnerRangPille } from './PartnerRangPille'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

interface PostCardProps {
  entry: FeedEntry
  isLoggedIn: boolean
  hasUsername: boolean
  likedKeys: string[]
}

export function PostCard({ entry, isLoggedIn, hasUsername, likedKeys }: PostCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [thread, setThread] = useState<{
    top: CommentRow[]
    repliesByParent: Record<string, CommentRow[]>
  } | null>(null)
  const [threadPending, startThread] = useTransition()
  const [reported, setReported] = useState(false)
  const [reportPending, startReport] = useTransition()
  const [reportError, setReportError] = useState<string | null>(null)

  const isArtikel = entry.kind === 'artikel'
  const targetKind: 'post' | 'wissen' = isArtikel ? 'wissen' : 'post'

  function handleExpand() {
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    if (thread === null) {
      startThread(async () => {
        setThread(await loadThread(targetKind, entry.id))
      })
    }
  }

  function handleReport() {
    startReport(async () => {
      const r = await reportCommunityTarget(targetKind, entry.id)
      if (r.ok) setReported(true)
      else setReportError(r.error ?? 'Melden fehlgeschlagen.')
    })
  }
  const bodyPreview =
    entry.body.length > 200 ? entry.body.slice(0, 200).trimEnd() + ' …' : entry.body

  return (
    <article className="rounded-ios-md border border-claimondo-border bg-white p-4 transition-shadow hover:shadow-claimondo-sm">
      {/* Header – Autor + Redaktion-Badge + Datum */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-claimondo-navy">{entry.authorDisplay}</span>
        {entry.rang && <PartnerRangPille tier={entry.rang} />}
        {entry.isRedaktion && (
          <span className="rounded-ios-sm bg-claimondo-navy px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-white">
            Redaktion
          </span>
        )}
        <span className="ml-auto text-[0.65rem] text-claimondo-shield/75">
          {new Date(entry.createdAt).toLocaleDateString('de-DE')}
        </span>
      </div>

      {/* Tags */}
      {entry.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-ios-sm bg-claimondo-bg px-1.5 py-0.5 text-[0.65rem] font-medium text-claimondo-shield"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Title (nur Artikel) */}
      {isArtikel && entry.title ? (
        entry.slug ? (
          <Link
            href={`/wissen/${entry.slug}`}
            className="mt-2 block font-semibold leading-snug text-claimondo-navy transition-colors hover:text-claimondo-ondo"
            style={HEAD_FONT}
          >
            {entry.title}
          </Link>
        ) : (
          <p className="mt-2 font-semibold leading-snug text-claimondo-navy" style={HEAD_FONT}>
            {entry.title}
          </p>
        )
      ) : null}

      {/* Body-Preview */}
      <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">{bodyPreview}</p>

      {/* Footer – Likes + Kommentare + Melden */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <LikeButton
          targetKind={targetKind}
          targetId={entry.id}
          initialCount={entry.likeCount}
          isLoggedIn={isLoggedIn}
          initialLiked={likedKeys.includes(`${targetKind}:${entry.id}`)}
        />

        <button
          type="button"
          onClick={handleExpand}
          disabled={threadPending}
          className="inline-flex items-center gap-1 rounded-ios-sm px-2 py-1 text-xs text-claimondo-shield/70 transition hover:bg-claimondo-bg hover:text-claimondo-shield disabled:opacity-50"
        >
          <svg
            aria-hidden="true"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {entry.commentCount > 0 ? `${entry.commentCount} Kommentar${entry.commentCount === 1 ? '' : 'e'}` : 'Kommentieren'}
          {expanded ? ' ▲' : ' ▼'}
        </button>

        {reported ? (
          <span className="ml-auto text-[0.7rem] text-claimondo-shield/75">Gemeldet – danke.</span>
        ) : (
          <span className="ml-auto inline-flex flex-col items-end gap-0.5">
            <button
              type="button"
              onClick={handleReport}
              disabled={reportPending}
              className="text-[0.7rem] text-claimondo-shield/75 underline-offset-2 hover:text-claimondo-shield hover:underline disabled:opacity-50"
            >
              Melden
            </button>
            {reportError && (
              <span className="text-[0.7rem] text-danger-strong">{reportError}</span>
            )}
          </span>
        )}
      </div>

      {/* Thread (aufgeklappt) */}
      {expanded && (
        <>
          {threadPending || thread === null ? (
            <p className="mt-3 text-xs text-claimondo-shield/75">Lade Kommentare …</p>
          ) : (
            <PostComments
              targetKind={targetKind}
              targetId={entry.id}
              initialThread={thread}
              isLoggedIn={isLoggedIn}
              hasUsername={hasUsername}
            />
          )}
        </>
      )}
    </article>
  )
}
