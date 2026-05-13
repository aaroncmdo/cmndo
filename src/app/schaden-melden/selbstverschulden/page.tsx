import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Shield, Phone, ChevronLeft } from 'lucide-react'
import { ClearFlowOnMount } from './ClearFlowOnMount'
import PageHeader from '@/components/shared/PageHeader'

// AAR-469 C3: Abort-Screen bei Schuldfrage = eigenverantwortung. Freundliche
// Sackgasse mit Kasko-Hinweis + 3 Tipps + Hotline-Verweis. FlowShell wird
// bewusst NICHT genutzt — hier ist der Flow beendet, also kein Progress.
// Server Component — getTranslations statt useTranslations. Der Lead in
// der DB bleibt erhalten (disqualifiziert), nur der lokale Store wird
// über ClearFlowOnMount zurückgesetzt.

export const metadata = {
  title: 'Selbstverschulden — Claimondo',
  robots: { index: false, follow: false },
}

export default async function SelbstverschuldenPage() {
  const t = await getTranslations('flow.abort')

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
      <ClearFlowOnMount />
      <div className="w-full max-w-2xl rounded-claimondo-sheet bg-white p-8 sm:p-10 shadow-sheet">
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

        <div className="mt-8 rounded-2xl bg-claimondo-navy/[0.03] border border-claimondo-navy/[0.06] p-4">
          <p className="flex flex-wrap items-center gap-2 text-sm text-claimondo-navy">
            <Phone className="h-4 w-4 text-claimondo-ondo" aria-hidden />
            <span>{t('hotline_hint')}</span>
            <a
              href="tel:+4922125906530"
              className="font-semibold text-claimondo-ondo hover:underline"
            >
              0221 25906530
            </a>
          </p>
        </div>

        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-claimondo-ondo px-6 py-3.5 text-sm font-semibold tracking-[-.01em] text-white shadow-cta-ondo transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-[#3a6291] hover:-translate-y-[1px] active:translate-y-0"
          >
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
            {t('back_home')}
          </Link>
        </div>
      </div>
    </div>
  )
}
