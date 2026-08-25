import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Shield, Phone, ChevronLeft, ChevronRight, Wrench } from 'lucide-react'
// AAR-904: ClearFlowOnMount entfernt — flow-store gibt es im Mini-Wizard-
// Flow nicht mehr (kein client-state, alles via Server-Action).
import PageHeader from '@/components/shared/PageHeader'
import { SheetCard } from '@/components/shared/SheetCard'
import { PHONE_DISPLAY, PHONE_E164,
} from '@/lib/seo/jsonld'

// AAR-469 C3: Abort-Screen bei Schuldfrage = eigenverantwortung. Freundliche
// Sackgasse mit Kasko-Hinweis + 3 Tipps + Hotline-Verweis. FlowShell wird
// bewusst NICHT genutzt — hier ist der Flow beendet, also kein Progress.
// Server Component — getTranslations statt useTranslations. Der Lead in
// der DB bleibt erhalten (disqualifiziert), nur der lokale Store wird
// über ClearFlowOnMount zurückgesetzt.

export const metadata = {
  title: 'Selbstverschulden – Claimondo',
  robots: { index: false, follow: false },
}

export default async function SelbstverschuldenPage() {
  const t = await getTranslations('flow.abort')
  // F4 (Entry-Point-Audit 24.07.): App-Origin fuer den Werkstatt-Finder-CTA. Im Marketing-Build
  // ist NEXT_PUBLIC_APP_URL die Marketing-Domain (claimondo.de) — die App liegt auf EMBED_ORIGIN.
  const embedOrigin = process.env.NEXT_PUBLIC_EMBED_ORIGIN ?? 'https://app.claimondo.de'

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-claimondo-bg px-6 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: [
            'radial-gradient(60% 50% at 80% 0%, rgba(123,163,204,0.18), transparent 60%)',
            'radial-gradient(50% 50% at 0% 100%, rgba(69,115,162,0.08), transparent 70%)',
          ].join(', '),
        }}
      />
      <SheetCard size="2xl" padding="md" animateIn={false} className="sm:p-10">
        <Shield className="mb-6 h-14 w-14 text-claimondo-ondo" aria-hidden />
        <PageHeader title={t('heading')} description={t('explanation')} size="lg" />

        <ul className="mt-6 space-y-3">
          {[1, 2, 3].map((n) => (
            <li key={n} className="flex gap-3">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-claimondo-ondo/10 text-sm font-semibold text-claimondo-ondo"
                aria-hidden
              >
                {n}
              </span>
              <span className="text-claimondo-navy">
                {t(`tip_${n}` as 'tip_1' | 'tip_2' | 'tip_3')}
              </span>
            </li>
          ))}
        </ul>

        {/* F4 (Entry-Point-Audit 24.07.): Ausgang aus der Sackgasse. Selbstverschulden heisst
            KEIN unabhaengiger Gutachter (Haftpflicht) — aber der Kunde kann die Reparatur ueber
            Kasko oder als Selbstzahler regeln. Der Werkstatt-Finder startet genau diese Strecke
            (schuldfrage=eigenverantwortung -> kasko/selbstzahler-Szenario im /flow). Hardcoded
            Deutsch wie der Makler-Hub (Marketing-Build, deutscher Kontext). */}
        <div className="mt-8 rounded-ios-md border border-claimondo-ondo/25 bg-claimondo-ondo/[0.05] p-5">
          <div className="flex items-start gap-3">
            <Wrench className="mt-0.5 h-5 w-5 shrink-0 text-claimondo-ondo" aria-hidden />
            <div>
              <h2 className="text-base font-bold text-claimondo-navy">
                Reparatur über Kasko oder als Selbstzahler?
              </h2>
              <p className="mt-1 text-sm text-claimondo-ondo">
                Auch bei selbst verschuldetem Schaden helfen wir Ihnen weiter: Finden Sie eine
                passende Werkstatt in Ihrer Nähe und wickeln Sie die Reparatur über Ihre
                Kaskoversicherung oder als Selbstzahler ab – digital und ohne Papierkram.
              </p>
              <a
                href={`${embedOrigin}/embed/werkstatt-finder`}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-claimondo-navy px-6 py-3 text-sm font-semibold text-white transition hover:bg-claimondo-shield"
              >
                <Wrench className="h-4 w-4" aria-hidden /> Werkstatt finden
                <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-ios-md bg-claimondo-navy/[0.03] border border-claimondo-navy/[0.06] p-4">
          <p className="flex flex-wrap items-center gap-2 text-sm text-claimondo-navy">
            <Phone className="h-4 w-4 text-claimondo-ondo" aria-hidden />
            <span>{t('hotline_hint')}</span>
            <a
              href={`tel:${PHONE_E164}`}
              className="font-semibold text-claimondo-ondo hover:underline"
            >
              {PHONE_DISPLAY}
            </a>
          </p>
        </div>

        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-claimondo-ondo px-6 py-3.5 text-sm font-semibold tracking-[-.01em] text-white shadow-cta-ondo transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-shield hover:-translate-y-[1px] active:translate-y-0"
          >
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
            {t('back_home')}
          </Link>
        </div>
      </SheetCard>
    </div>
  )
}
