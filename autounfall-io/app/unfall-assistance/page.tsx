import type { Metadata } from 'next'
import { Suspense } from 'react'
import { UnfallAssistanceWizard } from '@/components/tools/UnfallAssistanceWizard'

// noindex (wie Prototyp): geführter Funnel, kein Ranking-Ziel → NICHT in sitemap.ts.
export const metadata: Metadata = {
  title: 'Unfall-Assistance — in 60 Sekunden wissen, was zu tun ist',
  description:
    'Unfall-Assistance: In 60 Sekunden wissen Sie, was nach Ihrem Unfall zu tun ist. Kostenlos, anonym, keine Anmeldung.',
  robots: { index: false, follow: true },
}

export default function UnfallAssistancePage() {
  return (
    <div className="mx-auto max-w-[720px] px-4 pb-16 sm:px-6">
      {/* useSearchParams (?context=/?ref=) braucht eine Suspense-Grenze (Next 16). */}
      <Suspense fallback={null}>
        <UnfallAssistanceWizard />
      </Suspense>
    </div>
  )
}
