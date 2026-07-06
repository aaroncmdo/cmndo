// Server Component — kein 'use client'
// Kompakter Dashboard-Teaser des Netzwerk-Feeds (max. 3 Eintraege).

import Link from 'next/link'
import { getNetzwerkFeed } from '@/lib/community/feed'
import { SectionCard } from '@/components/shared/SectionCard'
import { Badge } from '@/components/primitives'
import Avatar from '@/components/shared/Avatar'
import type { NetzwerkPortal } from './types'
import { NETZWERK_HREF } from './types'

function truncate(text: string, maxLen = 80): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen).trimEnd() + '…'
}

export async function NetzwerkWidget({ portal }: { portal: NetzwerkPortal }) {
  const entries = await getNetzwerkFeed({ limit: 3 })
  const href = NETZWERK_HREF[portal]

  return (
    <SectionCard title="Aus dem Netzwerk">
      {entries.length === 0 ? (
        <div className="space-y-3">
          <p className="text-body-sm text-claimondo-shield">
            Noch keine Beiträge — schreib den ersten.
          </p>
          <Link
            href={href}
            className="text-body-sm font-medium text-claimondo-ondo hover:underline"
          >
            Zum Netzwerk →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={`${entry.kind}:${entry.id}`} className="flex items-start gap-2">
              <Avatar url={null} name={entry.authorDisplay} size="sm" style={{ flexShrink: 0 }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-body-sm font-medium text-claimondo-navy truncate">
                    {entry.authorDisplay}
                  </span>
                  {entry.isRedaktion && (
                    <Badge tone="info" size="sm">
                      Redaktion
                    </Badge>
                  )}
                </div>
                <p className="text-caption text-claimondo-shield mt-0.5 leading-snug">
                  {truncate(entry.body)}
                </p>
                <p className="text-caption text-claimondo-shield/60 mt-0.5">
                  ♥ {entry.likeCount} · 💬 {entry.commentCount}
                </p>
              </div>
            </div>
          ))}

          <div className="pt-1 border-t border-claimondo-border">
            <Link
              href={href}
              className="text-body-sm font-medium text-claimondo-ondo hover:underline"
            >
              Zum Netzwerk →
            </Link>
          </div>
        </div>
      )}
    </SectionCard>
  )
}
