'use client'
import { useState, useMemo } from 'react'
import type { FeedEntry } from '@/lib/community/community-queries'
import { B2B_TAGS } from '@/lib/community/tags'
import { PostCard } from './PostCard'
import { PostComposer } from './PostComposer'
import { SessionSync } from './SessionSync'

interface CommunityFeedClientProps {
  entries: FeedEntry[]
  isLoggedIn: boolean
  hasUsername: boolean
  likedKeys: string[]
}

export function CommunityFeedClient({ entries, isLoggedIn, hasUsername, likedKeys }: CommunityFeedClientProps) {
  const [activeTag, setActiveTag] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!activeTag) return entries
    return entries.filter((e) => e.tags.includes(activeTag))
  }, [entries, activeTag])

  return (
    <div className="space-y-6">
      {/* Tag-Filter-Chips */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTag(null)}
          className={[
            'rounded-ios-sm px-3 py-1.5 text-xs font-medium transition',
            activeTag === null
              ? 'bg-claimondo-navy text-white'
              : 'border border-claimondo-border text-claimondo-shield hover:border-claimondo-ondo hover:text-claimondo-ondo',
          ].join(' ')}
        >
          Alle
        </button>
        {B2B_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            className={[
              'rounded-ios-sm px-3 py-1.5 text-xs font-medium transition',
              activeTag === tag
                ? 'bg-claimondo-navy text-white'
                : 'border border-claimondo-border text-claimondo-shield hover:border-claimondo-ondo hover:text-claimondo-ondo',
            ].join(' ')}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Composer */}
      <SessionSync loggedIn={isLoggedIn} />
      <PostComposer isLoggedIn={isLoggedIn} hasUsername={hasUsername} />

      {/* Feed */}
      {filtered.length === 0 ? (
        <p className="text-sm text-claimondo-shield">
          {activeTag
            ? `Noch keine Beiträge zum Thema „${activeTag}".`
            : 'Noch keine Beiträge in der Community.'}
        </p>
      ) : (
        <ul className="space-y-4">
          {filtered.map((entry) => (
            <li key={`${entry.kind}-${entry.id}`}>
              <PostCard entry={entry} isLoggedIn={isLoggedIn} hasUsername={hasUsername} likedKeys={likedKeys} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
