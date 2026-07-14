import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ContentScriptSchema } from '@/lib/marketing/schema'
import PageHeader from '@/components/shared/PageHeader'
import { STATUS_LABEL, STATUS_TONE } from '../status-display'
import { RetryButton } from '../RetryButton'
import { ScriptEditor } from '../ScriptEditor'

export const dynamic = 'force-dynamic'

export default async function ClipDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()
  const { data: job } = await db.from('marketing_content_jobs').select('*').eq('id', id).single()
  if (!job) notFound()

  const hashtags: string[] = Array.isArray(job.hashtags) ? job.hashtags : []
  const parsedSkript = ContentScriptSchema.safeParse(job.skript)
  const showEditor =
    parsedSkript.success && (job.status === 'skript_generiert' || job.status === 'fehler')

  return (
    <div className="space-y-6 py-6">
      <Link
        href="/admin/marketing/content-studio"
        className="text-body-sm text-claimondo-ondo hover:underline"
      >
        ← Zurück zum Content-Studio
      </Link>

      <PageHeader
        title={job.thema}
        description={job.format === 'ad' ? 'Ad / Werbung' : 'Ratgeber'}
        size="lg"
        actions={
          <StatusBadge tone={STATUS_TONE[job.status] ?? 'neutral'}>
            {STATUS_LABEL[job.status] ?? job.status}
          </StatusBadge>
        }
      />

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
      ) : null}

      {showEditor && parsedSkript.success ? (
        <SectionCard>
          <h2 className="mb-1 text-heading-sm font-semibold text-claimondo-navy">
            Skript prüfen &amp; freigeben
          </h2>
          <p className="mb-3 text-body-xs text-claimondo-shield">
            Alles editierbar. „Freigeben &amp; Rendern“ speichert und startet den Render (Voiceover
            → Untertitel → Video).
          </p>
          <ScriptEditor jobId={job.id} skript={parsedSkript.data} />
        </SectionCard>
      ) : null}

      {job.status === 'entwurf' ? (
        <SectionCard>
          <p className="text-body-sm text-claimondo-slate">
            Skript wird generiert … Seite neu laden für den aktuellen Stand.
          </p>
        </SectionCard>
      ) : null}

      {job.status === 'render_queued' || job.status === 'audio_erzeugt' ? (
        <SectionCard>
          <p className="text-body-sm text-claimondo-slate">
            {job.status === 'render_queued'
              ? 'In der Render-Warteschlange … der Worker rendert den Clip automatisch, sobald genügend RAM frei ist. Seite neu laden für den aktuellen Stand.'
              : 'Wird gerendert (Voiceover → Video) … Seite neu laden für den aktuellen Stand.'}
          </p>
          <p className="mt-3 mb-2 text-body-xs text-claimondo-shield">
            Hängt es zu lange (z.B. nach einem Server-Neustart)?
          </p>
          <RetryButton jobId={job.id} label="Render neu starten" />
        </SectionCard>
      ) : null}

      {job.status === 'fehler' && !parsedSkript.success ? (
        <SectionCard>
          <p className="mb-2 text-body-sm text-claimondo-slate">
            Kein Skript vorhanden — neu generieren:
          </p>
          <RetryButton jobId={job.id} label="Neues Skript generieren" />
        </SectionCard>
      ) : null}

      {job.status === 'video_fertig' && job.caption ? (
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
    </div>
  )
}
