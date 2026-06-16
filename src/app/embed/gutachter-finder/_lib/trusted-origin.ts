// AAR-956 Consent-Bridge — Origin-Allowlist (sicherheitskritisch, daher pure + getestet).
// Nur claimondo.de + dessen Subdomains (prod/staging: www / kfzgutachter / app / staging.…)
// und localhost (dev) dürfen per postMessage den Consent in den GF-Embed setzen — sonst könnte
// ein fremder Parent Einwilligung vortäuschen. Der führende Punkt in `.claimondo.de` verhindert
// Suffix-Angriffe (evilclaimondo.de, claimondo.de.evil.com).

export function isTrustedParentOrigin(origin: string): boolean {
  try {
    const h = new URL(origin).hostname
    return h === 'claimondo.de' || h.endsWith('.claimondo.de') || h === 'localhost' || h === '127.0.0.1'
  } catch {
    return false
  }
}
