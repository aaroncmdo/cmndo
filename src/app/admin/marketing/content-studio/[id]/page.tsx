import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { STATUS_LABEL, STATUS_TONE } from '../status-display'

export const dynamic = 'force-dynamic'

export default async function ClipDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()
  const { data: job } = await db.from('marketing_content_jobs').select('*').eq('id', id).single()
  if (!job) notFound()

  const hashtags: string[] = Array.isArray(job.hashtags) ? job.hashtags : []

  return (
    <div className="space-y-6 py-6">
      <Link
        href="/admin/marketing/content-studio"
        className="text-body-sm text-claimondo-ondo hover:underline"
      >
        ← Zurück zum Content-Studio
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-heading-lg font-bold text-claimondo-navy">{job.thema}</h1>
          <p className="mt-0.5 text-body-sm text-claimondo-ondo">
            {job.format === 'ad' ? 'Ad / Werbung' : 'Ratgeber'}
          </p>
        </div>
        <StatusBadge tone={STATUS_TONE[job.status] ?? 'neutral'}>
          {STATUS_LABEL[job.status] ?? job.status}
        </StatusBadge>
      </div>

      {job.status === 'fehler' && job.fehler_text ? (
        <SectionCard>
          <p className="text-body-sm text-danger-strong">Fehler: {job.fehler_text}</p>
        </SectionCard>
      ) : null}

      {job.video_url ? (
        <SectionCard>
          <h2 className="mb-3 text-heading-sm font-semibold text-claimondo-navy">Video</h2>
          <video
            src={job.video_url}
            controls
            className="w-full max-w-xs rounded-ios-md"
            style={{ aspectRatio: '9 / 16' }}
          />
          <div className="mt-3">
            <a
              href={job.video_url}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="text-body-sm text-claimondo-ondo hover:underline"
            >
              Herunterladen
            </a>
          </div>
        </SectionCard>
      ) : job.status !== 'fehler' ? (
        <SectionCard>
          <p className="text-body-sm text-claimondo-slate">
            Wird generiert … (Skript → Voiceover → Render). Seite neu laden für den aktuellen Stand.
          </p>
        </SectionCard>
      ) : null}

      {job.caption ? (
        <SectionCard>
          <h2 className="mb-2 text-heading-sm font-semibold text-claimondo-navy">
            Caption &amp; Hashtags
          </h2>
          <p className="whitespace-pre-wrap text-body-sm text-claimondo-navy">{job.caption}</p>
          {hashtags.length ? (
            <p className="mt-2 text-body-sm text-claimondo-ondo">
              {hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
            </p>
          ) : null}
        </SectionCard>
      ) : null}

      {job.skript ? (
        <SectionCard>
          <h2 className="mb-2 text-heading-sm font-semibold text-claimondo-navy">Skript</h2>
          <pre className="overflow-x-auto whitespace-pre-wrap text-body-xs text-claimondo-slate">
            {JSON.stringify(job.skript, null, 2)}
          </pre>
        </SectionCard>
      ) : null}
    </div>
  )
}
