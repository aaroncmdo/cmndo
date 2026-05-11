'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const APP_PREFIXES = ['/admin', '/kunde', '/gutachter', '/dispatch', '/kanzlei', '/sv', '/mitarbeiter', '/flow']

export function Footer() {
  const pathname = usePathname()
  if (APP_PREFIXES.some(p => pathname.startsWith(p))) return null

  return (
    <footer className="w-full border-t border-claimondo-shield/10 bg-claimondo-navy text-white mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm font-[family-name:var(--font-montserrat)]">
        <p className="text-white/60">
          &copy; {new Date().getFullYear()} Claimondo GmbH i.G.
        </p>
        <nav className="flex items-center gap-6">
          <Link href="/impressum" className="text-white/80 hover:text-white transition-colors">
            Impressum
          </Link>
          <Link href="/datenschutz" className="text-white/80 hover:text-white transition-colors">
            Datenschutz
          </Link>
          <a href="mailto:aaron.sprafke@claimondo.de" className="text-white/80 hover:text-white transition-colors">
            Kontakt
          </a>
        </nav>
      </div>
    </footer>
  )
}
