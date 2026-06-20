import type { ReactNode } from 'react'

// Zentrale Navigations-Daten fuer GlobalHeader (Mega-Menue + Werkzeuge-Dropdown +
// Mobile-Akkordeon) und Footer. Kuratierte Auswahl laut Hub-Redesign-Brief:
// PILLARS = 7 Themenfelder ("Nach Phase"), BELIEBT = Top-Einzelartikel
// ("Beliebte Themen"), TOOLS = 6 Werkzeuge. Linien-Icons (SVG, currentColor) —
// KEINE Emojis. Alle Slugs gegen die Sitemap/Build bestaetigt.

export interface NavLink {
  label: string
  href: string
  sub?: string
  icon?: ReactNode
}

// Einheitlicher Linien-Icon-Stil (wie V6-Mockup .mic/.ic): 24er-Viewbox,
// currentColor-Stroke. Decorativ → aria-hidden (Label traegt die Bedeutung).
function Ic({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

// Kleine UI-Icons fuer Dropdown-Trigger (Chevron) und CTAs/Links (Pfeil).
export function ChevronDown({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export function ArrowRight({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export const PILLARS: NavLink[] = [
  { label: 'Akutphase', sub: 'Erste 24 Stunden', href: '/unfall-was-tun', icon: <Ic><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></Ic> },
  { label: 'Schuldfrage', sub: 'Anscheinsbeweis', href: '/wer-hat-schuld', icon: <Ic><path d="M12 3v18" /><path d="M5 7h14" /><path d="m5 7-3 6h6z" /><path d="m19 7-3 6h6z" /></Ic> },
  { label: 'Anspruch & Versicherung', sub: '§ 249 BGB, BGH', href: '/anspruch', icon: <Ic><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h4" /></Ic> },
  { label: 'Reparatur & Werkstatt', sub: 'Werkstattwahl, fiktiv', href: '/reparatur', icon: <Ic><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.9 2.9-2.4-2.4z" /></Ic> },
  { label: 'Personenschaden', sub: 'HWS, Schmerzensgeld', href: '/personenschaden', icon: <Ic><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></Ic> },
  { label: 'Spezialfälle', sub: 'E-Auto, Wild, Hagel', href: '/spezialfaelle', icon: <Ic><path d="M5 13l1.6-4.6A2 2 0 0 1 8.5 7h7a2 2 0 0 1 1.9 1.4L19 13v4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" /><circle cx="7.5" cy="14.5" r=".6" /><circle cx="16.5" cy="14.5" r=".6" /></Ic> },
  { label: 'Gutachter-Ratgeber', sub: 'Kosten, Beauftragung', href: '/gutachter-ratgeber', icon: <Ic><path d="M9 11l3 3 8-8" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></Ic> },
]

export const BELIEBT: NavLink[] = [
  { label: 'Stundenverrechnungssatz', href: '/stundenverrechnungssatz' },
  { label: 'Nutzungsausfall & Unkostenpauschale', href: '/nutzungsausfall-unkostenpauschale' },
  { label: 'Merkantile Wertminderung', href: '/merkantile-wertminderung' },
  { label: 'Verbringungskosten', href: '/verbringungskosten' },
  { label: 'UPE-Aufschläge', href: '/upe-aufschlaege' },
  { label: 'Fiktive Abrechnung', href: '/fiktive-abrechnung' },
  { label: '130-%-Regel / Totalschaden', href: '/totalschaden-130-prozent-regel' },
  { label: 'Schmerzensgeld', href: '/schmerzensgeld' },
  { label: 'HWS-Schleudertrauma', href: '/hws-schleudertrauma' },
  { label: 'Schadenfreiheitsklasse', href: '/schadenfreiheitsklasse' },
  { label: 'E-Auto- & Tesla-Unfall', href: '/eauto-tesla-unfall' },
]

export const TOOLS: NavLink[] = [
  { label: 'Kürzungs-Checker', sub: 'Gekürzt? Was Ihnen nach BGH zusteht.', href: '/kuerzungs-checker', icon: <Ic><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></Ic> },
  { label: 'Unfall-Assistance', sub: 'In 60 Sekunden zum persönlichen Plan.', href: '/unfall-assistance', icon: <Ic><path d="M13 2 3 14h7l-1 8 10-12h-7z" /></Ic> },
  { label: 'Schaden-Rechner', sub: 'Nutzungsausfall, Wertminderung & mehr.', href: '/rechner', icon: <Ic><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8M8 10h2M8 14h2M8 18h2M14 10h2v8h-2z" /></Ic> },
  { label: 'Versicherer-Decoder', sub: 'Was Formulierungen wirklich bedeuten.', href: '/versicherer-decoder', icon: <Ic><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Ic> },
  { label: 'SF-Rückstufungs-Rechner', sub: 'Selbst zahlen oder melden?', href: '/schadenfreiheitsklasse/rechner', icon: <Ic><path d="M22 17 13.5 8.5 8.5 13.5 2 7" /><path d="M16 17h6v-6" /></Ic> },
  { label: 'Unfallbericht', sub: 'Europäischer Unfallbericht als PDF.', href: '/unfallbericht', icon: <Ic><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><path d="M9 13h6M9 17h4" /></Ic> },
]
