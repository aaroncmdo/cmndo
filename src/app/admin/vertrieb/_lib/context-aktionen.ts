// context-aktionen.ts
import type { VertriebRolle, VertriebTyp } from '@/lib/vertrieb/vertrieb-kontakt.types'

export type VertriebAktion = {
  key: string
  label: string
  href?: string
  kind: 'scrape' | 'csv' | 'anlegen' | 'freigaben' | 'qrpool' | 'sequenzen'
}

const ROLLE_TO_PL: Record<VertriebRolle, string> = { sv: 'sachverstaendiger', makler: 'makler', werkstatt: 'werkstatt', 'firmen-flotte': 'firmen-flotte' }
const ANLEGEN_LABEL: Record<VertriebRolle, string> = { sv: 'SV anlegen', makler: 'Makler anlegen', werkstatt: 'Werkstatt anlegen', 'firmen-flotte': 'Firmen-Flotte anlegen' }

/** Aktions-Set je aktiver Pill (Rolle) × Lead/Partner. P1: href = Deep-Link auf Bestand. */
export function contextAktionen(rolle: VertriebRolle | 'alle', typ: VertriebTyp | 'alle'): VertriebAktion[] {
  const out: VertriebAktion[] = []
  const rolleQuery = rolle !== 'alle' ? `rolle=${ROLLE_TO_PL[rolle]}` : ''

  // Discoverability-Fix (UI-Audit 17.07.): in der "Alle"-Pill-Ansicht — der Default beim
  // Cockpit-Aufruf — gab es SONST KEINEN Anlege-Einstieg (die rollen-spezifischen "X anlegen"-
  // Buttons unten erscheinen erst nach Pill-Wahl; im reinen Partner-Modus rendert die Leiste
  // sogar null). Ein prominenter "Partner anlegen"-Picker macht das Onboarding aus jeder
  // Cockpit-Sicht erreichbar und oeffnet dieselben (bereits verdrahteten) Anlage-Drawer.
  if (rolle === 'alle') {
    out.push({ key: 'anlegen-picker', kind: 'anlegen', label: 'Partner anlegen' })
  }

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
    // Cold-Mailer S4: Vorlagen + Sequenzen konfigurieren. Neben der Akquise, weil genau
    // dort entschieden wird, was mit den frisch gescrapten Leads passiert.
    out.push({ key: 'sequenzen', kind: 'sequenzen', label: '📨 Cold-Mail-Sequenzen' })
  }
  // Anlegen je Rolle
  if (rolle === 'sv') {
    out.push({ key: 'anlegen-sv', kind: 'anlegen', label: ANLEGEN_LABEL.sv, href: '/admin/vertrieb/sachverstaendige/anlegen' })
    out.push({ key: 'freigaben', kind: 'freigaben', label: 'Basis-Freigaben', href: '/admin/vertrieb/sachverstaendige/basic-freigaben' })
  } else if (rolle === 'makler') {
    out.push({ key: 'anlegen-makler', kind: 'anlegen', label: ANLEGEN_LABEL.makler, href: '/admin/vertrieb/makler' })
  } else if (rolle === 'werkstatt') {
    out.push({ key: 'anlegen-werkstatt', kind: 'anlegen', label: ANLEGEN_LABEL.werkstatt, href: '/admin/vertrieb/werkstaetten' })
    out.push({ key: 'qrpool', kind: 'qrpool', label: 'QR-Pool verwalten', href: '/admin/vertrieb/werkstaetten/qr-pool' })
  } else if (rolle === 'firmen-flotte') {
    out.push({ key: 'anlegen-flotte', kind: 'anlegen', label: ANLEGEN_LABEL['firmen-flotte'], href: '/admin/firmen-flotte' })
  }
  return out
}
