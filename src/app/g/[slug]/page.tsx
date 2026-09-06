import { notFound } from 'next/navigation'
import Script from 'next/script'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'

// AAR-939 Part B2: Claimondo-Hosted-Widget-Host.
//
// Minimale, Claimondo-gebrandete Landing fuer SVs OHNE eigene Website — traegt
// das Monika-Widget (sv_embed via data-site-id). Public/anon (Middleware-
// Whitelist '/g/'); embed_sites wird via service_role gelesen (anon hat kein
// SELECT, RLS owner_select). Das Widget self-mountet (Shadow-DOM, floating) und
// laedt seine Config von der Script-Origin (relative src -> selbe Origin ->
// /api/embed/config + /api/anfrage-from-lp gehen same-origin durch).

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function HostedEmbedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // embed_sites fehlt in database.types.ts -> Cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data: site } = await db
    .from('embed_sites')
    .select('slug, name, aktiv')
    .eq('slug', slug)
    .maybeSingle()
  if (!site || site.aktiv === false) notFound()

  return (
    <main className="min-h-screen bg-claimondo-bg flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="max-w-xl">
        <p className="text-sm font-semibold uppercase tracking-widest text-claimondo-ondo mb-2">
          Kfz-Schadengutachten
        </p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-claimondo-navy leading-tight">
          Unfall? Jetzt kostenloses Kfz-Gutachten anfragen.
        </h1>
        <p className="mt-4 text-base text-claimondo-navy/70">
          {site.name} — unabhängiges Schadengutachten, schnell und unkompliziert. Stellen Sie Ihre Anfrage
          in unter einer Minute über das Formular.
        </p>
      </div>

      {/* Monika-Widget: self-mounting (Shadow-DOM, floating). data-site-id -> sv_embed-Config. */}
      <Script src="/embed/monika.js" data-site-id={slug} strategy="afterInteractive" />

      <footer className="mt-14 text-xs text-claimondo-ondo/70">
        powered by <span className="font-semibold text-claimondo-navy">Claimondo</span>
      </footer>
    </main>
  )
}
