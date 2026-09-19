// Nachtraegliche Verknuepfung Foto-Check <-> Lead (2026-09-09, Design
// docs/superpowers/specs/2026-09-09-foto-check-nachtraegliche-verknuepfung-design.md).
//
// /check merkt sich pro Browser eine zufaellige Kennung in einem First-Party-Cookie, haengt sie als
// `?ref=` an den Foto-CTA (das Tool schreibt sie auf anspruch_schaetzungen.check_ref) und liest sie beim
// Kontakt serverseitig (check-ref-server.ts). Technisch erforderlich fuer den vom Nutzer gewuenschten
// Dienst (§ 25 Abs. 2 Nr. 2 TDDDG): kein Tracking, keine PII, keine Einwilligung — aber Nennung in der
// Datenschutzerklaerung. Alles hier ist DOM-frei, damit es im node-vitest testbar bleibt.

export const CHECK_REF_COOKIE = 'claimondo_check_ref'
/** 30 Tage — genau das Fenster, in dem der Cleanup-Cron unverknuepfte Sessions noch stehen laesst. */
export const CHECK_REF_MAX_AGE_S = 30 * 24 * 60 * 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Liefert die kleingeschriebene UUID oder null — der Wert kommt aus Cookie/URL, also aus fremder Hand. */
export function parseCheckRef(wert: unknown): string | null {
  if (typeof wert !== 'string') return null
  return UUID_RE.test(wert) ? wert.toLowerCase() : null
}

/** Liest die ref aus einem Cookie-Header (`a=1; claimondo_check_ref=...; b=2`). Exakter Name, kein Praefix-Match. */
export function leseCheckRefAusCookieHeader(header: string | null | undefined): string | null {
  if (!header) return null
  for (const teil of header.split(';')) {
    const [name, ...rest] = teil.trim().split('=')
    if (name === CHECK_REF_COOKIE) return parseCheckRef(rest.join('='))
  }
  return null
}

export function erzeugeCheckRefCookie(ref: string): string {
  return `${CHECK_REF_COOKIE}=${ref}; Max-Age=${CHECK_REF_MAX_AGE_S}; Path=/; SameSite=Lax; Secure`
}

/**
 * Client: vorhandene ref aus dem Cookie, sonst neue erzeugen und setzen. `doc`/`uuid` sind nur fuer
 * Tests injizierbar — im Browser reichen die Defaults.
 */
export function getOrCreateCheckRef(
  doc: { cookie: string } = document,
  uuid: () => string = () => crypto.randomUUID(),
): string {
  const vorhanden = leseCheckRefAusCookieHeader(doc.cookie)
  if (vorhanden) return vorhanden
  const neu = uuid().toLowerCase()
  doc.cookie = erzeugeCheckRefCookie(neu)
  return neu
}
