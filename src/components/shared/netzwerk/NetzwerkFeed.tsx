'use client'

import { useState } from 'react'
import type { FeedEntry } from '@/lib/community/feed'
import type { CommentPreview } from '@/lib/community/threads'
import { B2B_TAGS } from '@/lib/community/tags'
import { Chip, ChipRow } from '@/components/ui/Chip'
import EmptyState from '@/components/shared/EmptyState'
import { MessagesSquareIcon } from 'lucide-react'
import { PostComposer } from './PostComposer'
import { FeedCard } from './FeedCard'
import type { NetzwerkPortal } from './types'

export type NetzwerkFeedProps = {
  portal: NetzwerkPortal
  entries: FeedEntry[]
  likedKeys: string[]
  previewsByKey: Record<string, CommentPreview[]>
}

type SortMode = 'top' | 'neu'

export function NetzwerkFeed({ portal: _portal, entries, likedKeys, previewsByKey }: NetzwerkFeedProps) {
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [sort, setSort] = useState<SortMode>('neu')

  // Client-side filter by active tag
  const filtered = activeTag
    ? entries.filter((e) => e.tags.includes(activeTag))
    : entries

  // Sort: 'top' = likeCount desc, 'neu' = createdAt desc
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'top') {
      return b.likeCount - a.likeCount
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-caption font-semibold uppercase tracking-widest text-claimondo-ondo mb-1">
          B2B-Community
        </p>
        <h1 className="text-heading-lg font-bold text-claimondo-navy">Aus dem Netzwerk</h1>
        <p className="mt-1 text-body-sm text-claimondo-shield">
          Fachlicher Austausch für Sachverständige, Makler und Werkstätten.
        </p>
      </div>

      {/* Tag-Filter + Sort */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ChipRow>
          <Chip
            variant={activeTag === null ? 'selected' : 'default'}
            onClick={() => setActiveTag(null)}
          >
            Alle
          </Chip>
          {B2B_TAGS.map((tag) => (
            <Chip
              key={tag}
              variant={activeTag === tag ? 'selected' : 'default'}
              onClick={() => setActiveTag(tag)}
            >
              {tag}
            </Chip>
          ))}
        </ChipRow>

        {/* Sort toggle */}
        <div className="flex items-center gap-1 shrink-0">
          <Chip
            variant={sort === 'top' ? 'selected' : 'default'}
            onClick={() => setSort('top')}
          >
            Top
          </Chip>
          <Chip
            variant={sort === 'neu' ? 'selected' : 'default'}
            onClick={() => setSort('neu')}
          >
            Neueste
          </Chip>
        </div>
      </div>

      {/* Composer — immer sichtbar */}
      <PostComposer />

      {/* Feed-Liste oder EmptyState */}
      {sorted.length === 0 ? (
        <EmptyState
          icon={MessagesSquareIcon}
          title={entries.length === 0 ? 'Noch keine Beiträge' : 'Keine Beiträge in dieser Kategorie'}
          description={
            entries.length === 0
              ? 'Sei der Erste und starte den fachlichen Austausch im Netzwerk.'
              : 'Für diesen Tag gibt es noch keine Beiträge.'
          }
        />
      ) : (
        <div className="space-y-4">
          {sorted.map((entry) => {
            // liked-keys use DB target_kind: 'wissen' for artikel, 'post' for post
            const likedKey = `${entry.kind === 'artikel' ? 'wissen' : 'post'}:${entry.id}`
            // preview-keys use feed kind: 'artikel' or 'post'
            const previewKey = `${entry.kind}:${entry.id}`
            return (
              <FeedCard
                key={`${entry.kind}:${entry.id}`}
                entry={entry}
                liked={likedKeys.includes(likedKey)}
                previews={previewsByKey[previewKey] ?? []}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
