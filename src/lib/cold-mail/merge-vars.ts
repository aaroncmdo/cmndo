// Token-Audit-Skip: Email-HTML (Button-CTAs) braucht inline-hex — Email-Clients
//   unterstuetzen keine CSS-Vars, und Cold-Mail geht an Prospects ohne Brand-Theme.
//   Siehe src/lib/email/google/templates/ColdMailShell.tsx und AGENTS.md §branding-rules.
//
// Single Source of Truth fuer die Cold-Mail-Merge-Palette: WAS die Palette anzeigt,
// WAS buildMergeVars() erzeugt und WAS renderMerge() ersetzt — aus einer Definition,
// damit die Palette nie eine Variable zeigt, die beim Versand nicht aufgeloest wird.

export type PaletteEintrag = { token: string; label: string }

/** Datenvariablen (aus dem Lead). Reihenfolge = Reihenfolge in der Palette. */
export const MERGE_VARS: readonly PaletteEintrag[] = [
  { token: 'Ansprechpartner', label: 'Ansprechpartner' },
  { token: 'Vorname', label: 'Vorname' },
  { token: 'Nachname', label: 'Nachname' },
  { token: 'Firma', label: 'Firma' },
  { token: 'Position', label: 'Position' },
  { token: 'Ort', label: 'Ort' },
]

/** Aktionen (loesen zu Button-CTAs auf). Erweiterbar: neuer Eintrag + Resolver-Zweig unten. */
export const ACTION_VARS: readonly PaletteEintrag[] = [
  { token: 'Partnerlink', label: 'Partner werden' },
  { token: 'Beratungslink', label: 'Beratungsgespräch buchen' },
  { token: 'Registrierungslink', label: 'Registrierungslink' },
]

const BERATUNG_URL = 'https://claimondo.de/beratung-anfragen'

function appBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de').replace(/\/$/, '')
}

/** Rollenbewusste Partner-Registrierungs-URL. Unbekannt -> harmlose App-Basis. */
export function registrierungsUrl(rolle: string | null): string {
  const base = appBase()
  switch (rolle) {
    case 'makler':
      return `${base}/makler/registrieren`
    case 'werkstatt':
      return `${base}/werkstatt-partner-werden`
    case 'sachverstaendiger':
      return `${base}/sv/registrieren`
    default:
      return base
  }
}

/**
 * Rollenbewusste Partner-Landing = Cold-Mail-CTA-Ziel je Sequenz-Rolle.
 * makler/SV haben eigene verkaufswirksame Landing-Subdomains; werkstatt.claimondo.de
 * existiert noch nicht (Task #4) -> bis dahin der funktionierende App-Pfad statt NXDOMAIN.
 */
export function partnerLandingUrl(rolle: string | null): string {
  switch (rolle) {
    case 'makler':
      return 'https://makler.claimondo.de'
    case 'sachverstaendiger':
      return 'https://gutachter.claimondo.de'
    case 'werkstatt':
      // TODO(Task #4): auf 'https://werkstatt.claimondo.de' umstellen, sobald die
      //   Subdomain live serviert (aktuell HTTP 000). App-Pfad liefert 200.
      return `${appBase()}/werkstatt-partner-werden`
    default:
      return 'https://claimondo.de'
  }
}

/** Email-sicheres Button-`<a>` (Inline-Styles; Claimondo-Navy). */
export function actionButton(url: string, label: string): string {
  const style =
    'display:inline-block;background-color:#0D1B3E;color:#ffffff;' +
    'padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px'
  return `<a href="${url}" style="${style}" target="_blank">${label}</a>`
}

/** Aktions-Tokens -> aufgeloestes Button-HTML fuer einen konkreten Lead. */
export function resolveActionVars(lead: { rolle: string | null }): Record<string, string> {
  return {
    Partnerlink: actionButton(partnerLandingUrl(lead.rolle), 'Jetzt Partner werden'),
    Beratungslink: actionButton(BERATUNG_URL, 'Beratungsgespräch buchen'),
    Registrierungslink: actionButton(registrierungsUrl(lead.rolle), 'Jetzt registrieren'),
  }
}
