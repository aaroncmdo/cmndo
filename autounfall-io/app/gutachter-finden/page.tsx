import type { Metadata } from 'next'
import { Suspense } from 'react'
import { JsonLd } from '@/components/JsonLd'
import { siteGraph } from '@/lib/jsonld'
import { LeadFormClient } from '@/components/lead/LeadFormClient'
import { FinderMap } from '@/components/finder/FinderMap'
import { ladeFinderPins, type FinderPins } from '@/lib/finder/pins'

// WP-6 · Lead-Formular. Löst die /gutachter-finden-CTAs aus WP-2/3/4/5/7 ein
// (vorher transiente 404). Anfrage → Server Action submitAutounfallLead →
// anfragen → RPC convert_anfrage_zu_lead. STANDALONE, kein Claimondo im Formular.
export const metadata: Metadata = {
  title: 'Sachverständigen finden — unabhängiges Kfz-Gutachten anfragen',
  description:
    'Nach unverschuldetem Unfall: unabhängigen Kfz-Sachverständigen in Ihrer Nähe anfragen. Bei Fremdverschulden kostenfrei nach § 249 BGB. Match in der Regel binnen 24 Stunden.',
  alternates: { canonical: '/gutachter-finden' },
}

// Pins brauchen den Service-Role-Key (Runtime-Secret aus /etc/autounfall/.env.local).
// Der fehlt in der CI-Build-Env -> ein ISR-Prerender liefe dort ins Leere (0 Pins).
// force-dynamic holt die Pins zur REQUEST-Zeit auf dem VPS (wie das Lead-Form schon).
export const dynamic = 'force-dynamic'

const TRUST = [
  'Unabhängige, BVSK-orientierte Sachverständige',
  'Bei Fremdverschulden kostenfrei (§ 249 BGB)',
  'Match in der Regel binnen 24 Stunden',
  'Keine Verpflichtung, keine versteckten Kosten',
]

export default async function GutachterFindenPage() {
  // Footprint-safe: Pins server-seitig aus der geteilten Supabase (nur anon Felder).
  let pins: FinderPins = { deadPins: [], aktiveSVs: [] }
  try {
    pins = await ladeFinderPins()
  } catch {
    // Supabase-Hiccup -> Karte leer; das Lead-Formular unten bleibt voll nutzbar.
  }
  return (
    <>
      <JsonLd data={siteGraph()} />
      <div className="container-prose px-4 pb-16 pt-10 sm:px-0 lg:pt-14">
        <header className="mb-8" id="anfrage">
          <div className="mb-4 flex items-center gap-3">
            <span className="h-0.5 w-12 bg-au-amber" aria-hidden />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-au-amber-dark">
              Anfrage · in 60 Sekunden
            </span>
          </div>
          <h1 className="text-balance font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-au-ink sm:text-5xl">
            Sachverständigen finden
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-au-ink-soft">
            Nach einem unverschuldeten Unfall haben Sie das Recht auf einen unabhängigen
            Sachverständigen Ihrer Wahl. Wir vermitteln Ihnen einen Gutachter in Ihrer Nähe und
            übernehmen den Schriftverkehr — bei Fremdverschulden kostenfrei.
          </p>
          <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TRUST.map((t) => (
              <li key={t} className="flex items-start gap-2 text-sm text-au-ink-soft">
                <span aria-hidden className="mt-0.5 font-bold text-au-success">
                  ✓
                </span>
                {t}
              </li>
            ))}
          </ul>
        </header>

        {/* Native, footprint-safe Finder-Karte (au.io-gebrandet, anonyme SV-Pins aus
            der geteilten Supabase). Pin-Klick -> Ort-Prefill + SV-Praeferenz im Formular. */}
        <FinderMap deadPins={pins.deadPins} aktiveSVs={pins.aktiveSVs} />

        {/* useSearchParams (?ref=/?utm_*) braucht eine Suspense-Grenze (Next 16). */}
        <Suspense fallback={null}>
          <LeadFormClient />
        </Suspense>

        <p className="mt-6 text-xs leading-relaxed text-au-muted">
          Ihre Daten werden ausschließlich zur Bearbeitung dieser Anfrage und zur Vermittlung
          verarbeitet. Keine Weitergabe zu Werbezwecken. Mehr in der Datenschutzerklärung.
        </p>
      </div>
    </>
  )
}
