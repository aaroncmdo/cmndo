import { CLUSTER } from '@/lib/cluster'

// EXEMPLAR-KOMPONENTE (Idiom-Referenz fuer alle Section-Komponenten):
// - Server-Component (kein 'use client', keine Interaktivitaet).
// - Farben/Radien NUR ueber Tokens: bg-amber, text-petrol, rounded-cta, ...
//   (Mock-Mapping: rounded → rounded-card[16px], rounded-sm → rounded-cta[11px]).
// - Cluster-Daten aus CLUSTER (Telefon/Bilder). Bild-Pfade: /assets/img/{cluster}/...
// - Telefon-CTA: <a href={`tel:${CLUSTER.phone.tel}`} data-cta="header_call">.
//   Klick-Tracking laeuft delegiert ueber SiteScripts (kein onClick noetig).
// - Echte Umlaute in allen sichtbaren Strings.
const NAV = [
  { href: '#leistungen', label: 'Leistungen' },
  { href: '#reviews', label: 'Bewertungen' },
  { href: '#ueber-uns', label: 'Über uns' },
  { href: '#faq', label: 'FAQ' },
]

export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-paper/90 backdrop-blur-[10px] border-b border-border transition-all duration-200">
      <div className="max-w-wrap mx-auto px-6 flex items-center justify-between h-[84px] md:h-[92px] lg:h-[100px] gap-3.5">
        <a className="flex items-center gap-3" href="/" aria-label="Kfz-Gutachter — zur Startseite">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${CLUSTER.imgPath}logo-${CLUSTER.key}.webp`}
            alt={`Kfz-Gutachter ${CLUSTER.cities[0].name}`}
            className="h-16 md:h-[72px] lg:h-[80px] w-auto flex-none"
            loading="eager"
          />
        </a>
        <nav className="hidden lg:flex items-center justify-center gap-[22px] flex-1 min-w-0" aria-label="Seitennavigation">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="text-ink text-[13.5px] font-semibold tracking-[.005em] py-1.5 px-0.5 border-b-2 border-transparent hover:text-amber hover:border-amber transition whitespace-nowrap"
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3.5 flex-wrap justify-end">
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-amber tracking-[.08em] uppercase whitespace-nowrap">
            <svg className="w-3.5 h-3.5 stroke-amber fill-none stroke-2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15 14" />
            </svg>
            24/7 Soforthilfe
          </span>
          <a
            className="inline-flex items-center gap-2 bg-amber text-white font-display font-bold text-[15px] tracking-[.02em] px-4 py-[9px] rounded-full shadow-md hover:bg-amber-700 hover:-translate-y-px transition"
            href={`tel:${CLUSTER.phone.tel}`}
            data-cta="header_call"
            aria-label="Jetzt anrufen"
          >
            <span aria-hidden="true">☎</span>
            <span>{CLUSTER.phone.display}</span>
          </a>
        </div>
      </div>
    </header>
  )
}
