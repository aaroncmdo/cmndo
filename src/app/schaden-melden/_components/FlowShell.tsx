import Link from 'next/link'
import { getLocaleCookie } from '@/lib/i18n/locale-cookie'
import { LanguageSwitcher } from '@/components/shared'
import { FlowProgress } from './FlowProgress'

// AAR-467 C1: Gemeinsame Außenhülle für alle /schaden-melden-Sub-Routes.
// Header mit Claimondo-Logo (→ Landing) + LanguageSwitcher + Progress-Bar.
// Server Component — Locale kommt aus dem Cookie, Children kommen aus
// der jeweiligen Step-Route.

type Props = {
  step: 1 | 2 | 3 | 4
  children: React.ReactNode
}

export async function FlowShell({ step, children }: Props) {
  const locale = await getLocaleCookie()

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <header className="border-b border-claimondo-border bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-bold" aria-label="Claimondo — zur Startseite">
            <span className="text-claimondo-navy">Claim</span>
            <span className="text-claimondo-ondo">ondo</span>
          </Link>
          <LanguageSwitcher locale={locale} variant="compact" />
        </div>
        <div className="mx-auto max-w-3xl px-6 pb-4">
          <FlowProgress current={step} />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>
    </div>
  )
}
