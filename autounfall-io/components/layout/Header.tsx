import Link from 'next/link'
import { Logo } from '@/components/Logo'

// Foundation-Header: Logo (Startseiten-Link). Navigation/CTA folgen mit ihren
// Zielrouten in den naechsten WPs (WP-1 Pflichtseiten, WP-2/3/4 Content,
// WP-6 /gutachter-finden) — bewusst KEINE Links auf noch nicht existierende
// Routen, damit die Foundation kein 404 produziert.
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-au-sand-dark/60 bg-au-surface/80 backdrop-blur-md">
      <div className="container-narrow flex h-16 items-center px-4 sm:px-6">
        <Link
          href="/"
          aria-label="autounfall.io · Startseite"
          className="text-au-ink transition-opacity hover:opacity-80"
        >
          <Logo idSuffix="header" />
        </Link>
      </div>
    </header>
  )
}
