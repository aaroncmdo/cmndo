import Link from 'next/link'

export function Footer() {
  return (
    <footer className="w-full border-t border-[#1E3A5F]/10 bg-[#0D1B3E] text-white mt-auto">
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
          <a href="mailto:support@claimondo.de" className="text-white/80 hover:text-white transition-colors">
            Kontakt
          </a>
        </nav>
      </div>
    </footer>
  )
}
