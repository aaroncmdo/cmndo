'use client'
import { useState, useTransition } from 'react'
import { toggleCommunityLike } from '@/lib/community/community-actions'

interface LikeButtonProps {
  targetKind: string
  targetId: string
  initialCount: number
  isLoggedIn: boolean
  initialLiked?: boolean
}

export function LikeButton({ targetKind, targetId, initialCount, isLoggedIn, initialLiked }: LikeButtonProps) {
  const [count, setCount] = useState(initialCount)
  const [liked, setLiked] = useState(initialLiked ?? false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function handleClick() {
    if (!isLoggedIn) {
      setError('Bitte zuerst anmelden.')
      return
    }
    setError(null)
    const wasLiked = liked
    // Optimistic update
    setLiked(!wasLiked)
    setCount((c) => (wasLiked ? c - 1 : c + 1))
    start(async () => {
      const r = await toggleCommunityLike(targetKind, targetId)
      if (!r.ok) {
        // Rollback
        setLiked(wasLiked)
        setCount((c) => (wasLiked ? c + 1 : c - 1))
        setError(r.error ?? 'Fehler beim Liken.')
      } else if (r.nowLiked !== undefined) {
        setLiked(r.nowLiked)
      }
    })
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-pressed={liked}
        aria-label={liked ? 'Like entfernen' : 'Liken'}
        className={[
          'inline-flex items-center gap-1 rounded-ios-sm px-2 py-1 text-xs font-medium transition',
          liked
            ? 'bg-claimondo-ondo/10 text-claimondo-ondo'
            : 'text-claimondo-shield/70 hover:bg-claimondo-bg hover:text-claimondo-shield',
          'disabled:opacity-50',
        ].join(' ')}
      >
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill={liked ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
        {count > 0 && <span>{count}</span>}
      </button>
      {error && <span className="text-[0.7rem] text-danger-strong">{error}</span>}
    </span>
  )
}
