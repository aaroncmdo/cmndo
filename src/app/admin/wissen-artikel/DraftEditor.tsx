'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { updateArtikel, publishArtikel, rejectArtikel } from './actions'

// Exportiert fuer die Detail-View /admin/wissen-artikel/[id] (W2.1).
export type DraftRow = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  body: string
  meta_description: string | null
  meta_title: string | null
  primary_keyword: string | null
  cluster: string | null
  status: string
  created_at: string
}

export default function DraftEditor({ draft }: { draft: DraftRow }) {
  const router = useRouter()
  const [title, setTitle] = useState(draft.title)
  const [slug, setSlug] = useState(draft.slug)
  const [excerpt, setExcerpt] = useState(draft.excerpt ?? '')
  const [metaDescription, setMetaDescription] = useState(draft.meta_description ?? '')
  const [metaTitle, setMetaTitle] = useState(draft.meta_title ?? '')
  const [body, setBody] = useState(draft.body)

  const [isPendingSave, startSave] = useTransition()
  const [isPendingPublish, startPublish] = useTransition()
  const [isPendingReject, startReject] = useTransition()

  const isAnyPending = isPendingSave || isPendingPublish || isPendingReject

  function handleSave() {
    startSave(async () => {
      const result = await updateArtikel(draft.id, {
        title,
        slug,
        excerpt,
        meta_description: metaDescription,
        meta_title: metaTitle,
        body,
      })
      if (!result.ok) {
        toast.error(result.error ?? 'Speichern fehlgeschlagen')
        return
      }
      toast.success('Änderungen gespeichert.')
    })
  }

  function handlePublish() {
    startPublish(async () => {
      const result = await publishArtikel(draft.id)
      if (!result.ok) {
        toast.error(result.error ?? 'Veröffentlichung fehlgeschlagen')
        return
      }
      toast.success('Artikel veröffentlicht.')
      // Draft verlaesst in_review -> zurueck zur Liste (Action revalidiert /admin/wissen-artikel).
      router.push('/admin/wissen-artikel')
    })
  }

  function handleReject() {
    startReject(async () => {
      const result = await rejectArtikel(draft.id)
      if (!result.ok) {
        toast.error(result.error ?? 'Ablehnen fehlgeschlagen')
        return
      }
      toast.success('Draft abgelehnt.')
      router.push('/admin/wissen-artikel')
    })
  }

  return (
    <SectionCard title="Entwurf bearbeiten">{/* Titel/Datum stehen im Detail-View-Header (EntityDetailShell). */}
      <div className="space-y-4">
        {/* Titel */}
        <div>
          <label className="block text-xs font-medium text-claimondo-navy mb-1">Titel</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            disabled={isAnyPending}
            className="w-full border border-claimondo-border rounded-ios-md px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:border-claimondo-ondo disabled:opacity-60"
          />
        </div>

        {/* Slug */}
        <div>
          <label className="block text-xs font-medium text-claimondo-navy mb-1">Slug</label>
          <input
            type="text"
            value={slug}
            onChange={e => setSlug(e.target.value)}
            disabled={isAnyPending}
            className="w-full border border-claimondo-border rounded-ios-md px-3 py-2 text-sm font-mono text-claimondo-navy focus:outline-none focus:border-claimondo-ondo disabled:opacity-60"
          />
          <p className="text-[10px] text-claimondo-ondo/70 mt-0.5">URL: /wissen/{slug}</p>
        </div>

        {/* Excerpt */}
        <div>
          <label className="block text-xs font-medium text-claimondo-navy mb-1">Excerpt</label>
          <textarea
            value={excerpt}
            onChange={e => setExcerpt(e.target.value)}
            disabled={isAnyPending}
            rows={3}
            className="w-full border border-claimondo-border rounded-ios-md px-3 py-2 text-sm text-claimondo-navy resize-y focus:outline-none focus:border-claimondo-ondo disabled:opacity-60"
          />
        </div>

        {/* Meta Description */}
        <div>
          <label className="block text-xs font-medium text-claimondo-navy mb-1">Meta-Description</label>
          <input
            type="text"
            value={metaDescription}
            onChange={e => setMetaDescription(e.target.value)}
            disabled={isAnyPending}
            className="w-full border border-claimondo-border rounded-ios-md px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:border-claimondo-ondo disabled:opacity-60"
          />
        </div>

        {/* Meta-Titel — kurzer Titel fuer die Suchergebnisse. Leer = der
            Artikel-Titel oben wird genommen (der zugleich die H1 ist). */}
        <div>
          <label className="block text-xs font-medium text-claimondo-navy mb-1">
            Meta-Titel <span className="font-normal text-claimondo-ondo/60">(optional, für Google)</span>
          </label>
          <input
            type="text"
            value={metaTitle}
            onChange={e => setMetaTitle(e.target.value)}
            disabled={isAnyPending}
            placeholder="Leer lassen = Artikel-Titel verwenden"
            className="w-full border border-claimondo-border rounded-ios-md px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:border-claimondo-ondo disabled:opacity-60"
          />
          <p className={`text-[10px] mt-0.5 ${metaTitle.length > 48 ? 'text-danger' : 'text-claimondo-ondo/70'}`}>
            {metaTitle.length}/48 Zeichen — Google zeigt rund 60, „ | Claimondo" kommt automatisch dazu.
          </p>
        </div>

        {/* Body (Markdown) */}
        <div>
          <label className="block text-xs font-medium text-claimondo-navy mb-1">
            Artikel-Body <span className="text-claimondo-ondo/60 font-normal">(Markdown)</span>
          </label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            disabled={isAnyPending}
            rows={20}
            className="w-full border border-claimondo-border rounded-ios-md px-3 py-2 text-sm font-mono text-claimondo-navy resize-y focus:outline-none focus:border-claimondo-ondo disabled:opacity-60"
          />
        </div>

        {/* Pflicht-Hinweis vor Freigabe: Zitate pruefen (Smoke-Befund: KI kann BGH-Az raten) */}
        <div className="rounded-ios-md bg-warning-soft px-3 py-2.5 text-[11px] leading-relaxed text-warning-strong">
          <strong>Vor der Freigabe prüfen:</strong> Alle <strong>BGH-Aktenzeichen</strong> und Rechtsaussagen auf
          Richtigkeit kontrollieren — die KI kann Aktenzeichen falsch angeben. §§ und Fakten stichprobenartig
          verifizieren. Der Artikel erscheint öffentlich unter „Aaron Sprafke" — die Byline verpflichtet.
        </div>

        {/* Aktions-Buttons */}
        <div className="flex items-center gap-3 pt-2 border-t border-claimondo-border">
          <Button
            variant="ondo"
            size="sm"
            loading={isPendingSave}
            onClick={handleSave}
          >
            Speichern
          </Button>
          <Button
            variant="navy"
            size="sm"
            loading={isPendingPublish}
            onClick={handlePublish}
          >
            Freigeben &amp; veröffentlichen
          </Button>
          <Button
            variant="bare"
            size="sm"
            loading={isPendingReject}
            onClick={handleReject}
          >
            Ablehnen
          </Button>
        </div>
      </div>
    </SectionCard>
  )
}
