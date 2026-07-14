'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/primitives'
import { markiereAlsGepostet, zuruecksetzenPublishStatus } from './actions'

// TikTok Creative Center — Trending-Sounds (public). Beim Posten einen antippen = Algo-Boost
// + korrekt gelinkter Sound (per API nicht moeglich, nur in der App -> „Fabrik->Entwuerfe, du postest").
const CREATIVE_CENTER_SOUNDS =
  'https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en'

export function PublishPanel({
  jobId,
  caption,
  hashtags,
  publishStatus,
  gepostetAm,
}: {
  jobId: string
  caption: string
  hashtags: string[]
  publishStatus: string
  gepostetAm: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hashtagText = hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')
  const gepostet = publishStatus === 'gepostet'

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500)
    } catch {
      setError('Kopieren nicht möglich — bitte Text manuell markieren.')
    }
  }

  const toggle = () => {
    setError(null)
    startTransition(async () => {
      const r = gepostet ? await zuruecksetzenPublishStatus(jobId) : await markiereAlsGepostet(jobId)
      if (!r.ok) setError(r.error ?? 'Fehler')
      else router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-body-xs font-semibold text-claimondo-navy">Caption</span>
          <Button variant="bare" onClick={() => copy(caption, 'caption')}>
            {copied === 'caption' ? 'Kopiert ✓' : 'Kopieren'}
          </Button>
        </div>
        <p className="whitespace-pre-wrap text-body-sm text-claimondo-navy">{caption || '—'}</p>
      </div>

      {hashtags.length ? (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-body-xs font-semibold text-claimondo-navy">Hashtags</span>
            <Button variant="bare" onClick={() => copy(hashtagText, 'hashtags')}>
              {copied === 'hashtags' ? 'Kopiert ✓' : 'Kopieren'}
            </Button>
          </div>
          <p className="text-body-sm text-claimondo-ondo">{hashtagText}</p>
        </div>
      ) : null}

      <div className="rounded-ios-md bg-claimondo-bg p-3">
        <p className="text-body-xs text-claimondo-shield">
          🎵 Beim Posten einen <strong className="font-semibold">Trending-Sound</strong> antippen — das gibt
          den Algo-Boost und den korrekt gelinkten Sound (per API nicht möglich, nur in der App).{' '}
          <a
            href={CREATIVE_CENTER_SOUNDS}
            target="_blank"
            rel="noopener noreferrer"
            className="text-claimondo-ondo hover:underline"
          >
            Trending-Sounds ansehen →
          </a>
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-claimondo-border pt-3">
        {gepostet ? (
          <span className="text-body-sm font-medium text-success-strong">
            ✓ Gepostet{gepostetAm ? ` am ${new Date(gepostetAm).toLocaleDateString('de-DE')}` : ''}
          </span>
        ) : (
          <span className="text-body-sm text-claimondo-slate">Noch nicht gepostet</span>
        )}
        <Button variant={gepostet ? 'ghost' : 'navy'} onClick={toggle} loading={pending}>
          {gepostet ? 'Zurücksetzen' : 'Als gepostet markieren'}
        </Button>
      </div>

      {error ? <p className="text-body-xs text-danger-strong">{error}</p> : null}
    </div>
  )
}
