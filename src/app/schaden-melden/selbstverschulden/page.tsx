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
    <div className="flex min-h-screen items-center justify-center bg-claimondo-bg px-6 py-12">
      <ClearFlowOnMount />
      <div className="w-full max-w-2xl rounded-2xl bg-white p-10 shadow-[var(--shadow-claimondo-md)]">
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

        <div className="mt-8 rounded-xl border border-claimondo-border bg-claimondo-bg p-4">
          <p className="flex flex-wrap items-center gap-2 text-sm text-claimondo-navy">
            <Phone className="h-4 w-4 text-claimondo-ondo" aria-hidden />
            <span>{t('hotline_hint')}</span>
            <a
              href="tel:+4922112345678"
              className="font-semibold text-claimondo-ondo hover:underline"
            >
              0221 123 456 78
            </a>
          </p>
        </div>

        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-claimondo-navy px-6 py-3 font-semibold text-white hover:bg-claimondo-shield"
          >
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
            {t('back_home')}
          </Link>
        </div>
      </div>
    </div>
  )
}
