import { CLUSTER, waHref, type City } from '@/lib/cluster'

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
]

const WA_PATH =
  'M17.498 14.382c-.301-.15-1.767-.867-2.04-.966-.273-.101-.473-.15-.673.15-.197.295-.771.964-.944 1.162-.175.195-.349.21-.646.075-.3-.15-1.263-.465-2.403-1.485-.888-.795-1.484-1.77-1.66-2.07-.174-.3-.019-.465.13-.615.136-.135.301-.345.451-.523.146-.181.194-.301.297-.496.1-.21.049-.375-.025-.524-.075-.15-.672-1.62-.922-2.206-.24-.584-.487-.51-.672-.51-.172-.015-.371-.015-.571-.015-.2 0-.523.074-.797.359-.273.3-1.045 1.02-1.045 2.475s1.07 2.865 1.219 3.075c.149.195 2.105 3.195 5.1 4.485.714.3 1.27.48 1.704.63.714.225 1.365.195 1.88.121.574-.091 1.767-.721 2.016-1.426.255-.705.255-1.29.18-1.425-.074-.135-.27-.21-.57-.345m-5.446 7.443h-.016c-1.77 0-3.524-.48-5.055-1.38l-.36-.214-3.75.975 1.005-3.645-.239-.375a9.869 9.869 0 0 1-1.516-5.26c.002-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413'

export function Header({ city }: { city: City }) {
  return (
    <>
      <header className="sticky top-0 z-50 bg-[var(--header-glass)] lg:bg-paper/60 backdrop-blur-xl backdrop-saturate-150 border-b border-white/10 lg:border-black/[0.06] shadow-[0_2px_16px_-8px_rgba(0,0,0,0.28)] transition-all duration-200">
        <div className="max-w-wrap mx-auto px-6 flex items-center justify-between h-[58px] md:h-[64px] lg:h-[72px] gap-3.5">
          <a className="flex items-center gap-3" href="/" aria-label="Kfz-Gutachter — zur Startseite">
            {/* Logo: Desktop (>=lg) dunkle Variante fuer hellen Header; Mobil/Tablet (<lg)
                helle Variante fuer dunklen Header. <picture> laedt nur EINE Quelle. */}
            <picture>
              <source media="(min-width: 1024px)" srcSet={`${CLUSTER.imgPath}logo-${CLUSTER.key}.webp`} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${CLUSTER.imgPath}logo-${CLUSTER.key}-mobile.webp`}
                alt={`Kfz-Gutachter ${CLUSTER.cities[0].name}`}
                className="h-9 md:h-11 lg:h-12 w-auto flex-none"
                loading="eager"
              />
            </picture>
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
              <span>{CLUSTER.phone.display}</span>
            </a>
            {/* Burger (Phase 1.5) — nur <lg; oeffnet Off-Canvas-Drawer (Toggle in SiteScripts) */}
            <button
              id="burgerBtn"
              type="button"
              className="lg:hidden inline-flex flex-col items-center justify-center gap-[5px] w-11 h-11 -mr-2 rounded-md text-white transition active:scale-95"
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
              href={n.href}
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
