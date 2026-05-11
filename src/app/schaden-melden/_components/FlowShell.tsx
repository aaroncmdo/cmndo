import Link from 'next/link'
import { getLocaleCookie } from '@/lib/i18n/locale-cookie'
import { LanguageSwitcher } from '@/components/shared'
import { FlowProgress } from './FlowProgress'

// AAR-467 C1: Gemeinsame Außenhülle für alle /schaden-melden-Sub-Routes.
// Header mit Claimondo-Logo (→ Landing) + LanguageSwitcher + Progress-Bar.
// Server Component — Locale kommt aus dem Cookie, Children kommen aus
// der jeweiligen Step-Route.
//
// 2026-05-11 (kitta/aar-polish-flows): iOS-Glass Polish — Ambient-Gradient
// im Hintergrund, Sticky-Glass-Header (78% bg + blur), Step-Rail unter
// dem Header, Phase-Card-Patterns rendern im max-w-3xl Container.

type Props = {
  step: 1 | 2 | 3 | 4
  children: React.ReactNode
}

export async function FlowShell({ step, children }: Props) {
  const locale = await getLocaleCookie()

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-claimondo-bg">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background: [
            'radial-gradient(60% 50% at 80% 0%, rgba(123,163,204,0.18), transparent 60%)',
            'radial-gradient(50% 50% at 0% 100%, rgba(69,115,162,0.08), transparent 70%)',
          ].join(', '),
        }}
      />

      <header className="sticky top-0 z-30 border-b border-claimondo-navy/[0.06] bg-white/[0.78] backdrop-blur-[22px] backdrop-saturate-150">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3.5 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-lg font-bold tracking-[-.024em]"
            aria-label="Claimondo — zur Startseite"
          >
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-claimondo-navy text-white text-sm font-bold">
              C
            </span>
            <span>
              <span className="text-claimondo-navy">Claim</span>
              <span className="text-claimondo-ondo">ondo</span>
            </span>
          </Link>
          <LanguageSwitcher locale={locale} variant="compact" />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pt-5 sm:px-6 sm:pt-7">
        <FlowProgress current={step} />
      </div>

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-5 sm:px-6 sm:pt-7">
        {children}
      </main>
    </div>
  )
}
