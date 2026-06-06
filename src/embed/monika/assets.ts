// AAR-939 · Monika-A-Flow · Inline-Assets.
// Siegel = Vektor (gestochen scharf, kein Request, ~1KB gzip); Foto = URL vom
// claimondo-Origin (zu gross zum Inlinen, Gzip-Budget <30KB).
//
// Token-Audit-Skip: SVG-Replikat eines physischen Siegels (Marken-Hex Navy/Ondo/Gold).
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.

export const SIEGEL_SVG = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Claimondo Partner — Unfall Assistance">
<defs><path id="mk-top" d="M 22,100 A 78,78 0 0 1 178,100"/><path id="mk-bot" d="M 15,100 A 85,85 0 0 0 185,100"/></defs>
<circle cx="100" cy="100" r="98" fill="#0D1B3E"/><circle cx="100" cy="100" r="64" fill="#FFFFFF"/>
<text fill="#FFFFFF" font-family="Arial,Helvetica,sans-serif" font-size="12.5" font-weight="700" letter-spacing="1.8" text-anchor="middle"><textPath href="#mk-top" startOffset="50%">CLAIMONDO PARTNER</textPath></text>
<text fill="#FFFFFF" font-family="Arial,Helvetica,sans-serif" font-size="12.5" font-weight="700" letter-spacing="1.8" text-anchor="middle"><textPath href="#mk-bot" startOffset="50%">UNFALL ASSISTANCE</textPath></text>
<circle cx="22" cy="100" r="2.5" fill="#4573A2"/><circle cx="178" cy="100" r="2.5" fill="#4573A2"/>
<g transform="translate(100 85) scale(2.2) translate(-22 -22)">
<path d="M28.4331 16.2064L21.9995 13.7943L15.5669 16.2064V22.0003C15.567 25.9823 18.2689 28.8737 21.9995 30.2132C25.7305 28.8738 28.433 25.9825 28.4331 22.0003V16.2064ZM30.2329 22.0003C30.2328 27.0838 26.657 30.5633 22.2847 32.0208C22.1 32.0824 21.9 32.0823 21.7153 32.0208C17.3429 30.5634 13.7663 27.0839 13.7661 22.0003V15.5833C13.7661 15.2083 13.999 14.8724 14.3501 14.7406L21.6841 11.9906L21.8403 11.9476C21.9988 11.919 22.1633 11.9333 22.3159 11.9906L29.6489 14.7406C30.0002 14.8723 30.2329 15.2082 30.2329 15.5833V22.0003Z" fill="#0D1B3E"/>
<path d="M24.5397 19.1058C24.8723 18.7368 25.4409 18.7071 25.8102 19.0394C26.1797 19.3719 26.2101 19.9414 25.8776 20.3109L21.7526 24.8939C21.5875 25.0774 21.3539 25.1852 21.1071 25.1917C20.8603 25.1982 20.6215 25.1026 20.447 24.928L18.155 22.6361C17.8039 22.2846 17.8038 21.715 18.155 21.3636C18.5064 21.0121 19.0769 21.0121 19.4284 21.3636L21.0485 22.9847L24.5397 19.1058Z" fill="#4573A2"/></g>
<g fill="#C9A961"><path d="M 82.2,146.5 l 0.7,2.1 2.2,0 -1.8,1.3 0.7,2.1 -1.8,-1.3 -1.8,1.3 0.7,-2.1 -1.8,-1.3 2.2,0 z"/><path d="M 91.0,148.8 l 0.7,2.1 2.2,0 -1.8,1.3 0.7,2.1 -1.8,-1.3 -1.8,1.3 0.7,-2.1 -1.8,-1.3 2.2,0 z"/><path d="M 100,149.6 l 0.7,2.1 2.2,0 -1.8,1.3 0.7,2.1 -1.8,-1.3 -1.8,1.3 0.7,-2.1 -1.8,-1.3 2.2,0 z"/><path d="M 109.0,148.8 l 0.7,2.1 2.2,0 -1.8,1.3 0.7,2.1 -1.8,-1.3 -1.8,1.3 0.7,-2.1 -1.8,-1.3 2.2,0 z"/><path d="M 117.8,146.5 l 0.7,2.1 2.2,0 -1.8,1.3 0.7,2.1 -1.8,-1.3 -1.8,1.3 0.7,-2.1 -1.8,-1.3 2.2,0 z"/></g></svg>`

export function monikaPhotoUrl(base: string): string {
  return `${base}/embed/monika.png`
}
