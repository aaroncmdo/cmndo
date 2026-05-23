import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { SITE } from '@/lib/site'

// Foundation-Footer (STANDALONE): Betreiber = Kitta & Sprafke UG, Pflicht-
// Rechtslinks (Impressum/Datenschutz — Routen kommen in WP-1). KEIN Claimondo,
// keine claimondo.de-Links.
export function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="mt-auto border-t border-au-sand-dark bg-au-ink text-au-surface">
      <div className="container-narrow px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Link href="/" aria-label="autounfall.io · Startseite" className="text-au-surface">
              <Logo idSuffix="footer" />
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-au-surface/80">
              Unabhängige Unfall-Assistance: Ratgeber, Decoder und Rechner rund um den
              Kfz-Unfallschaden — verständlich erklärt.
            </p>
          </div>
          <nav aria-label="Rechtliches" className="flex flex-col gap-2 text-sm text-au-surface/80">
            <Link href="/impressum" className="transition-colors hover:text-au-surface">
              Impressum
            </Link>
            <Link href="/datenschutz" className="transition-colors hover:text-au-surface">
              Datenschutz
            </Link>
          </nav>
        </div>
        <div className="mt-10 border-t border-au-surface/15 pt-6 text-xs text-au-surface/60">
          © {year} {SITE.publisher.name}. autounfall.io
        </div>
      </div>
    </footer>
  )
}
