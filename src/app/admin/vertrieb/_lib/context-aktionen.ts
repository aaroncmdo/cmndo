// context-aktionen.ts
import type { VertriebRolle, VertriebTyp } from '@/lib/vertrieb/vertrieb-kontakt.types'

export type VertriebAktion = {
  key: string
  label: string
  href?: string
  kind: 'scrape' | 'csv' | 'anlegen' | 'freigaben' | 'qrpool' | 'karte'
}

const ROLLE_TO_PL: Record<VertriebRolle, string> = { sv: 'sachverstaendiger', makler: 'makler', werkstatt: 'werkstatt' }
const ANLEGEN_LABEL: Record<VertriebRolle, string> = { sv: 'SV anlegen', makler: 'Makler anlegen', werkstatt: 'Werkstatt anlegen' }

/** Aktions-Set je aktiver Pill (Rolle) × Lead/Partner. P1: href = Deep-Link auf Bestand. */
export function contextAktionen(rolle: VertriebRolle | 'alle', typ: VertriebTyp | 'alle'): VertriebAktion[] {
  const out: VertriebAktion[] = []
  const rolleQuery = rolle !== 'alle' ? `rolle=${ROLLE_TO_PL[rolle]}` : ''

  // Akquise nur im Lead-Modus (nicht im reinen Partner-Modus)
  if (typ !== 'partner') {
    out.push({
      key: 'scrape',
      kind: 'scrape',
      label: 'Scrapen (Google Places)',
      href: `/admin/vertrieb/partner-leads?aktion=scrapen${rolleQuery ? '&' + rolleQuery : ''}`,
    })
    out.push({
      key: 'csv',
      kind: 'csv',
      label: 'CSV importieren',
      href: `/admin/vertrieb/partner-leads?aktion=csv${rolleQuery ? '&' + rolleQuery : ''}`,
    })
  }
  // Anlegen je Rolle
  if (rolle === 'sv') {
    out.push({ key: 'anlegen-sv', kind: 'anlegen', label: ANLEGEN_LABEL.sv, href: '/admin/vertrieb/sachverstaendige/anlegen' })
    out.push({ key: 'freigaben', kind: 'freigaben', label: 'Basis-Freigaben', href: '/admin/vertrieb/sachverstaendige/basic-freigaben' })
    out.push({ key: 'sv-karte', kind: 'karte', label: 'SV-Karte (Live-Ops)', href: '/admin/vertrieb/sachverstaendige' })
  } else if (rolle === 'makler') {
    out.push({ key: 'anlegen-makler', kind: 'anlegen', label: ANLEGEN_LABEL.makler, href: '/admin/vertrieb/makler' })
  } else if (rolle === 'werkstatt') {
    out.push({ key: 'anlegen-werkstatt', kind: 'anlegen', label: ANLEGEN_LABEL.werkstatt, href: '/admin/vertrieb/werkstaetten' })
    out.push({ key: 'qrpool', kind: 'qrpool', label: 'QR-Pool verwalten', href: '/admin/vertrieb/werkstaetten/qr-pool' })
  }
  return out
}
