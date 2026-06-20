import { NextResponse } from 'next/server'
import { getAllArticles } from '@/lib/articles'
import { getAllRestPages } from '@/lib/rest'
import { getAllDecoders } from '@/lib/decoders'

// Statischer Such-Index (Titel + Route) fuer die clientseitige Header-Suche
// (Phase 1: Titel-/Slug-Treffer). Wird per fetch('/search-index.json') beim ersten
// Fokus lazy geladen — KEIN Inline-Payload pro Seite. force-static → zur Build-Zeit
// als statische Datei erzeugt (kein Server-Hit zur Laufzeit).
export const dynamic = 'force-static'

interface SearchItem {
  t: string // Titel
  u: string // URL/Route
}

// Titel fuer die Trefferliste glaetten: das site-weite "· autounfall.io"-Suffix
// (in einigen Titeln enthalten) ist in der Suche redundant.
const clean = (t: string) => t.replace(/\s*·\s*autounfall\.io\s*$/i, '')

export function GET() {
  const items: SearchItem[] = [
    ...getAllRestPages().map((p) => ({ t: clean(p.title), u: p.route })),
    ...getAllArticles().map((a) => ({ t: clean(a.title), u: `/${a.slug}` })),
    ...getAllDecoders().map((d) => ({ t: clean(d.title), u: `/versicherer-decoder/${d.slug}` })),
    // Werkzeuge + Schluesselseiten (nicht im Content-Layer)
    { t: 'Schaden-Rechner', u: '/rechner' },
    { t: 'Kürzungs-Checker', u: '/kuerzungs-checker' },
    { t: 'Unfall-Assistance', u: '/unfall-assistance' },
    { t: 'Unfallbericht', u: '/unfallbericht' },
    { t: 'SF-Rückstufungs-Rechner', u: '/schadenfreiheitsklasse/rechner' },
    { t: 'Gutachter finden', u: '/gutachter-finden' },
    { t: 'Über uns', u: '/ueber-uns' },
  ]
  return NextResponse.json(items)
}
