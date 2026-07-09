// Fallback-Titel je SV-Route. Statische Seiten brauchen NUR ihren PageHeader
// raus — der Titel kommt hierher. Dynamische Titel/Actions überschreiben via
// useSvPageChrome. Längster passender Prefix gewinnt (Segment-Grenze).
export const SV_PAGE_TITLES: Array<{ prefix: string; title: string }> = [
  { prefix: '/gutachter/einstellungen/verfuegbarkeit', title: 'Verfügbarkeit' },
  { prefix: '/gutachter/einstellungen/kalender', title: 'Kalender' },
  { prefix: '/gutachter/einstellungen/embed/neu', title: 'Neue Embed-Site' },
  { prefix: '/gutachter/einstellungen/embed', title: 'Embed-Sites' },
  { prefix: '/gutachter/einstellungen', title: 'Einstellungen' },
  { prefix: '/gutachter/heute', title: 'Heute' },
  { prefix: '/gutachter/auftraege', title: 'Meine Aufträge' },
  { prefix: '/gutachter/faelle', title: 'Meine Fälle' },
  { prefix: '/gutachter/kalender', title: 'Kalender' },
  { prefix: '/gutachter/netzwerk', title: 'Netzwerk' },
  { prefix: '/gutachter/abrechnung', title: 'Abrechnung' },
  { prefix: '/gutachter/leadpreise', title: 'Lead-Preis-Tabelle' },
  { prefix: '/gutachter/vertrag', title: 'Vertrag' },
  { prefix: '/gutachter/statistiken', title: 'Statistiken' },
  { prefix: '/gutachter/reklamationen', title: 'Reklamationen' },
  { prefix: '/gutachter/verifizierung', title: 'Verifizierung' },
  { prefix: '/gutachter/team', title: 'Team' },
  { prefix: '/gutachter/community', title: 'Community' },
  { prefix: '/gutachter/tasks', title: 'Meine Tasks' },
  { prefix: '/gutachter/gebiet', title: 'Mein Gebiet' },
  { prefix: '/gutachter/profil', title: 'Mein Profil' },
  { prefix: '/gutachter', title: 'Heute' }, // Index
]

export function matchSvTitle(pathname: string): string | null {
  let best: { prefix: string; title: string } | null = null
  for (const e of SV_PAGE_TITLES) {
    // Exact match OR starts with prefix + '/' (segment boundary)
    // For the catch-all /gutachter entry, only match exactly
    const isMatch = pathname === e.prefix || (e.prefix !== '/gutachter' && pathname.startsWith(e.prefix + '/'))
    if (isMatch && (!best || e.prefix.length > best.prefix.length)) best = e
  }
  return best?.title ?? null
}
