// AAR-login-embed: Open-Redirect-Schutz fuer den Login-`?continue=`-Param.
//
// Das Login-Widget (und Marketing-Header) leiten zu /login?continue=<ziel-url>.
// Erlaubt sind NUR: relative Pfade (ohne protocol-relative `//`) und absolute
// https-URLs auf claimondo.de / *.claimondo.de. Externe Domains (z.B. die
// Cluster-LPs kfz-gutachter-*.de) werden bewusst NICHT erlaubt -> Login von dort
// faellt auf roleToPath (Portal) zurueck (sie sehen die Session ohnehin nicht).
//
// PURE-Modul (kein 'use server'/'server-only') -> importierbar in Server-Action,
// Route-Handler, Server-Component UND Client (SMS-Pfad validiert client-seitig).

const ALLOWED_HOST_SUFFIX = '.claimondo.de'
const ALLOWED_EXACT = new Set(['claimondo.de', 'app.claimondo.de'])

export const LOGIN_CONTINUE_COOKIE = 'cm_login_continue'

export function isSafeContinue(raw: string | null | undefined): boolean {
  if (!raw) return false
  const v = raw.trim()
  if (!v) return false
  // Relativer Pfad: muss mit / starten, aber nicht // (protocol-relative) oder /\ (Backslash-Trick)
  if (v.startsWith('/')) return !v.startsWith('//') && !v.startsWith('/\\')
  // Absolut: nur https auf der eigenen Domain-Familie
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    return ALLOWED_EXACT.has(host) || host.endsWith(ALLOWED_HOST_SUFFIX)
  } catch {
    return false
  }
}

export function safeContinue(raw: string | null | undefined): string | null {
  return isSafeContinue(raw) ? (raw as string).trim() : null
}
