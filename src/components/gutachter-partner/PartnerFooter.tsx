import Link from 'next/link'

// AAR-876 — Minimaler Footer auf /gutachter-partner mit Cross-Link auf Hauptdomain
// (SEO-Isolierung der Subdomain gutachter.claimondo.de aufbrechen)

export function PartnerFooter() {
  const jahr = new Date().getFullYear()
  return (
    <footer className="bg-claimondo-navy text-white py-10 px-6">
      <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm">
        <div>
          <div className="font-bold text-base">
            <span>Claim</span>
            <span className="text-claimondo-light-blue">ondo</span>
          </div>
          <p className="mt-1 text-white/60 text-xs">
            Vollständige Schadensregulierung — auf Augenhöhe. © {jahr} Claimondo GmbH, Köln.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-white/70">
          <a
            href="https://claimondo.de"
            className="hover:text-white transition-colors"
            rel="noopener"
          >
            Hauptseite
          </a>
          <Link href="https://claimondo.de/impressum" className="hover:text-white transition-colors">
            Impressum
          </Link>
          <Link href="https://claimondo.de/datenschutz" className="hover:text-white transition-colors">
            Datenschutz
          </Link>
          <Link href="https://claimondo.de/agb" className="hover:text-white transition-colors">
            AGB
          </Link>
        </nav>
      </div>
    </footer>
  )
}
