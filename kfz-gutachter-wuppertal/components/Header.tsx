import Link from 'next/link'
import { CLUSTER, MAIN_CITY, waHref, type City } from '@/lib/cluster'

// SERVER-Component (kein 'use client'). Statisches Markup; die Burger-Toggle-
// State-Machine (open/close/ESC/Backdrop/Link) liegt clientseitig in SiteScripts
// (wie das Mock-IIFE). Off-Canvas-Transition: globals.css #burgerMenu/#burgerBackdrop.
// - Cluster-Daten aus CLUSTER (Telefon/Bilder). Klick-Tracking delegiert (SiteScripts).
// - Burger-Nav (Phase 1.5): Mobile/Tablet (<lg) hatten zuvor KEINE Navigation.
const NAV = [
  { href: '#leistungen', label: 'Leistungen' },
  { href: '#reviews', label: 'Bewertungen' },
  { href: '#ueber-uns', label: 'Über uns' },
  { href: '#faq', label: 'FAQ' },
  // Einziger echter Seiten-Link der Navigation: der Finder liegt nicht als
  // Abschnitt auf der Landing, sondern unter /gutachter-finden (eigenstaendig
  // auf DIESER Domain, Aaron-Entscheid 21.08.2026). Deshalb praefixt der
  // Header nur `#`-Links mit `ankerBasis` — dieser hier bleibt unberuehrt.
  { href: '/gutachter-finden', label: 'Gutachter finden' },
]

const WA_PATH =
  'M17.498 14.382c-.301-.15-1.767-.867-2.04-.966-.273-.101-.473-.15-.673.15-.197.295-.771.964-.944 1.162-.175.195-.349.21-.646.075-.3-.15-1.263-.465-2.403-1.485-.888-.795-1.484-1.77-1.66-2.07-.174-.3-.019-.465.13-.615.136-.135.301-.345.451-.523.146-.181.194-.301.297-.496.1-.21.049-.375-.025-.524-.075-.15-.672-1.62-.922-2.206-.24-.584-.487-.51-.672-.51-.172-.015-.371-.015-.571-.015-.2 0-.523.074-.797.359-.273.3-1.045 1.02-1.045 2.475s1.07 2.865 1.219 3.075c.149.195 2.105 3.195 5.1 4.485.714.3 1.27.48 1.704.63.714.225 1.365.195 1.88.121.574-.091 1.767-.721 2.016-1.426.255-.705.255-1.29.18-1.425-.074-.135-.27-.21-.57-.345m-5.446 7.443h-.016c-1.77 0-3.524-.48-5.055-1.38l-.36-.214-3.75.975 1.005-3.645-.239-.375a9.869 9.869 0 0 1-1.516-5.26c.002-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413'

/**
 * @param ankerBasis Prefix fuer die `#`-Links der Navigation.
 *
 * Leer auf allen Landing-Seiten (Hub + Spokes) — dort liegen die Abschnitte auf
 * derselben Seite, ein blosses `#leistungen` scrollt. Auf `/gutachter-finden`
 * gibt es diese Abschnitte NICHT: dort waeren die vier Nav-Links tot, ohne dass
 * etwas fehlschlaegt (der Browser springt einfach nicht). Mit `ankerBasis="/"`
 * fuehren sie stattdessen zurueck auf die Startseite und dort zum Abschnitt.
 */
export function Header({ city, ankerBasis = '' }: { city: City; ankerBasis?: string }) {
  return (
    <>
      <header className="relative sm:sticky sm:top-0 z-50 border-b border-white/15 sm:border-white/40 header-glossy transition-all duration-200">
        {/* BRIEF 08d · Header schmaler (Aaron 10.06.: Kopf-Overlap Desktop). */}
        <div className="max-w-wrap header-wrap mx-auto px-5 sm:px-6 flex items-center justify-between h-[60px] sm:h-[72px] md:h-[80px] lg:h-[84px] gap-3.5">
          <Link className="flex items-center gap-3" href="/" aria-label="Kfz-Gutachter — zur Startseite">
            {/* BRIEF 08d F2 · DOM-Composite-Wortmarke auf ALLEN Viewports (ersetzt den
                logo-{key}-new.svg-Asset-TODO). Mobile (<640, dunkler Cluster-Glossy):
                White-Signet + weisse Wortmarke; Desktop (>=640, hell): Dark-Signet.
                Logo-Endung pro Cluster (CLUSTER.logoExt: Aachen Vektor-SVG, Koeln PNG). */}
            <span className="flex items-center gap-2.5 sm:gap-3 flex-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${CLUSTER.imgPath}logo-${CLUSTER.key}-white.${CLUSTER.logoExt}?v=${CLUSTER.assetVersion}`}
                alt=""
                aria-hidden="true"
                className="sm:hidden flex-none object-contain h-8 w-auto max-w-[56px]"
                loading="eager"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {/* 08h A4b · Logo-Leiter: Signet ~62% der Header-Hoehe >=1024 (52/58/64px),
                  Stufen im globals-08h-A4-Block (.brand-signet-desk). */}
              <img
                src={`${CLUSTER.imgPath}logo-${CLUSTER.key}-dark.${CLUSTER.logoExt}?v=${CLUSTER.assetVersion}`}
                alt=""
                aria-hidden="true"
                className="brand-signet-desk hidden sm:block flex-none object-contain h-11 w-auto max-w-[72px]"
                loading="eager"
              />
              <span className="block w-px self-stretch min-h-[28px] sm:min-h-[34px] bg-amber" aria-hidden="true" />
              <span className="flex flex-col leading-none">
                <span className="brand-z1 font-display font-bold text-[13px] sm:text-[clamp(17px,1.4vw,22px)] tracking-[-0.012em] text-white sm:text-ink">Kfz-Gutachter</span>
                {/* 08h A4a (Aaron-Copy-Entscheid 10.06.): "{Stadt} und Umgebung" in normaler
                    Gross-/Kleinschreibung, Sperrung zurueckgenommen — Spoke-Besucher duerfen
                    nicht durch ein hartes Versal-"KOELN" verwirrt werden; Marke deckt die Region. */}
                <span className="brand-z2 font-display font-bold text-[8.5px] sm:text-[clamp(9.5px,0.8vw,12px)] tracking-[0.02em] mt-1 sm:mt-1.5 text-[var(--accent-on-dark,var(--amber))] sm:text-amber">{MAIN_CITY.name} und Umgebung</span>
              </span>
            </span>
          </Link>
          <nav className="hidden lg:flex items-center justify-center gap-[22px] flex-1 min-w-0" aria-label="Seitennavigation">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href.startsWith('#') ? `${ankerBasis}${n.href}` : n.href}
                className="text-ink text-[13.5px] font-semibold tracking-[.005em] py-1.5 px-0.5 border-b-2 border-transparent hover:text-amber hover:border-amber transition whitespace-nowrap"
              >
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3.5 flex-wrap justify-end">
            <span className="hidden lg:inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-amber tracking-[.08em] uppercase whitespace-nowrap">
              <svg className="w-3.5 h-3.5 stroke-amber fill-none stroke-2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 15 14" />
              </svg>
              24/7 Soforthilfe
            </span>
            <a
              className="hidden sm:inline-flex items-center gap-2 bg-amber text-white font-display font-bold text-[15px] tracking-[.02em] px-4 py-[9px] rounded-full shadow-md hover:bg-amber-700 hover:-translate-y-px transition"
              href={`tel:${CLUSTER.phone.tel}`}
              data-cta="header_call"
              aria-label="Jetzt anrufen"
            >
              <span aria-hidden="true">☎</span>
              {/* 08e A2: national formatiert (gleiche Konvention wie Hero-CTA). */}
              <span>{CLUSTER.phone.displayNational}</span>
            </a>
            {/* Burger (Phase 1.5) — nur <lg; oeffnet Off-Canvas-Drawer (Toggle in SiteScripts) */}
            <button
              id="burgerBtn"
              type="button"
              className="lg:hidden inline-flex flex-col items-center justify-center gap-[5px] w-11 h-11 -mr-2 rounded-md text-white sm:text-ink transition active:scale-95"
              aria-label="Menü öffnen"
              aria-expanded="false"
              aria-controls="burgerMenu"
            >
              <span className="block w-6 h-[2.5px] bg-current rounded-full" />
              <span className="block w-6 h-[2.5px] bg-current rounded-full" />
              <span className="block w-6 h-[2.5px] bg-current rounded-full" />
            </button>
          </div>
        </div>
      </header>

      {/* Off-Canvas-Backdrop + Drawer (Mobile/Tablet). Anruf prominent oben, Nav, WhatsApp unten. */}
      <div id="burgerBackdrop" className="lg:hidden fixed inset-0 z-[60] bg-black/55" aria-hidden="true" />
      <aside
        id="burgerMenu"
        className="lg:hidden fixed top-0 right-0 bottom-0 z-[61] w-[86%] max-w-[360px] bg-paper shadow-2xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Hauptmenü"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <span className="font-display font-bold text-petrol text-[16px]">Menü</span>
          <button
            id="burgerClose"
            type="button"
            className="w-10 h-10 -mr-2 grid place-items-center rounded-full text-ink hover:bg-border/40 transition"
            aria-label="Menü schließen"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <a
          className="flex items-center justify-center gap-2.5 bg-amber text-white font-display font-bold text-[16px] mx-5 mt-5 px-5 py-3.5 rounded-xl shadow-md active:scale-[.98] transition"
          href={`tel:${CLUSTER.phone.tel}`}
          data-cta="burger_call"
          aria-label="Jetzt anrufen"
        >
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
          </svg>
          <span>Jetzt anrufen</span>
        </a>
        <span className="text-[12.5px] text-muted text-center mt-1.5 mb-4">24/7 erreichbar · Rückruf in &lt; 15 Min</span>
        <nav className="flex flex-col px-3" aria-label="Menü-Navigation">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href.startsWith('#') ? `${ankerBasis}${n.href}` : n.href}
              className="block px-4 py-3 text-ink font-semibold text-[15.5px] hover:bg-border/30 rounded-lg transition"
              data-burger-link
            >
              {n.label}
            </a>
          ))}
        </nav>
        <a
          className="mt-auto flex items-center justify-center gap-2.5 bg-green text-white font-display font-bold text-[15.5px] mx-5 mb-6 px-5 py-3.5 rounded-xl shadow-md active:scale-[.98] transition"
          href={waHref(city)}
          data-cta="burger_wa"
          target="_blank"
          rel="noopener"
          aria-label="WhatsApp schreiben"
        >
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
            <path d={WA_PATH} />
          </svg>
          <span>WhatsApp schreiben</span>
        </a>
      </aside>
    </>
  )
}
