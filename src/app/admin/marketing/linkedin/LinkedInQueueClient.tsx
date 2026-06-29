'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives/Button'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import type { LinkedInPostRow, PostStatus } from '@/lib/linkedin/types'
import {
  freigebenUndPosten,
  entwurfBearbeiten,
  ueberspringen,
  startLinkedInConnect,
} from './actions'

// PostStatus -> { label, tone } map for StatusBadge (uses token tones, no raw status scales)
const POST_STATUS_MAP: Record<PostStatus, { label: string; tone: 'info' | 'success' | 'danger' | 'neutral' }> = {
  entwurf: { label: 'Entwurf', tone: 'info' },
  veroeffentlicht: { label: 'Veröffentlicht', tone: 'success' },
  fehlgeschlagen: { label: 'Fehlgeschlagen', tone: 'danger' },
  uebersprungen: { label: 'Übersprungen', tone: 'neutral' },
}

export function LinkedInQueueClient({
  posts,
  connection,
}: {
  posts: LinkedInPostRow[]
  connection: { orgUrn: string; expiresAt: string } | null
}) {
  const entwuerfe = posts.filter((p) => p.status === 'entwurf')
  const verlauf = posts.filter((p) => p.status !== 'entwurf')

  return (
    <div className="space-y-6">
      {/* Verbindungsstatus */}
      <SectionCard>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-body font-semibold text-claimondo-navy">Verbindung</h3>
            <p className="text-body-sm text-claimondo-slate">
              {connection
                ? `Verbunden: ${connection.orgUrn} · Token gültig bis ${new Date(connection.expiresAt).toLocaleDateString('de-DE')}`
                : 'Nicht verbunden.'}
            </p>
          </div>
          <form action={startLinkedInConnect}>
            <Button type="submit" variant={connection ? 'ghost' : 'navy'}>
              {connection ? 'Neu verbinden' : 'LinkedIn verbinden'}
            </Button>
          </form>
        </div>
      </SectionCard>

      {/* Entwurfe */}
      <div className="space-y-4">
        <h3 className="text-heading-sm font-semibold text-claimondo-navy">
          Entwürfe ({entwuerfe.length})
        </h3>
        {entwuerfe.length === 0 && (
          <p className="text-body-sm text-claimondo-slate">Keine offenen Entwürfe.</p>
        )}
        {entwuerfe.map((p) => (
          <EntwurfCard key={p.id} post={p} />
        ))}
      </div>

      {/* Verlauf */}
      <div className="space-y-3">
        <h3 className="text-heading-sm font-semibold text-claimondo-navy">Verlauf</h3>
        {verlauf.length === 0 && (
          <p className="text-body-sm text-claimondo-slate">Kein Verlauf vorhanden.</p>
        )}
        {verlauf.map((p) => {
          const { label, tone } = POST_STATUS_MAP[p.status] ?? POST_STATUS_MAP.entwurf
          return (
            <SectionCard key={p.id} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-body-sm font-medium text-claimondo-navy truncate">{p.title}</p>
                {p.fehler && (
                  <p className="text-body-xs text-danger-strong truncate">{p.fehler}</p>
                )}
              </div>
              <StatusBadge tone={tone}>{label}</StatusBadge>
            </SectionCard>
          )
        })}
      </div>
    </div>
  )
}

function EntwurfCard({ post }: { post: LinkedInPostRow }) {
  const [text, setText] = useState(post.composed_text)
  const [pending, start] = useTransition()

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    start(async () => {
      const r = await fn()
      if (r.ok) toast.success(okMsg)
      else toast.error(r.error ?? 'Fehler')
    })

  const { label, tone } = POST_STATUS_MAP[post.status] ?? POST_STATUS_MAP.entwurf

  return (
    <SectionCard className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body font-semibold text-claimondo-navy">{post.title}</p>
        <StatusBadge tone={tone}>{label}</StatusBadge>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="w-full rounded-ios-md border border-claimondo-border p-3 text-body-sm"
      />
      <p className="text-body-xs text-claimondo-slate truncate">{post.feed_url}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          loading={pending}
          onClick={() => run(() => entwurfBearbeiten(post.id, text), 'Text gespeichert')}
        >
          Speichern
        </Button>
        <Button
          variant="navy"
          loading={pending}
          onClick={() => run(() => freigebenUndPosten(post.id), 'Veröffentlicht')}
        >
          Freigeben &amp; posten
        </Button>
        <Button
          variant="bare"
          loading={pending}
          onClick={() => run(() => ueberspringen(post.id), 'Übersprungen')}
        >
          Überspringen
        </Button>
      </div>
    </SectionCard>
  )
}
