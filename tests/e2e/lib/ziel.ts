// EINE Quelle fuer "wohin faehrt dieser Lauf" und "braucht dieses Ziel Basic-Auth".
//
// Vorher lag beides verstreut in den Specs — mit DREI Konventionen nebeneinander:
//   STAGING_BASIC_AUTH_USER/PASS  (cmm44-sph-reroute, kunde-auth-setup, smoke-cmm65)
//   STAGING_BASIC_USER/PASS       (onboarding-pflichtdok, smoke-caldav-*)
//   Klartext im Repo              (staging-clickthrough.spec.ts:6)
//
// Der Pruefsatz, an dem sich hier alles ausrichtet (aus den drei Faellen vom 23.08.,
// broadcast-prod-playwright-smoke-drei-fallen):
//
//   "Wenn ich das ZIEL wechsle (localhost <-> staging <-> prod) — aendert sich diese
//    Bedingung mit?"
//
// Lautet die Antwort nein, haengt sie am falschen Wert. Deshalb haengt hier NICHTS an
// `CI` oder `IS_LOCAL`, sondern ausschliesslich an der Ziel-URL. Genau daran war
// #5543 gescheitert: `!IS_LOCAL` behandelte prod wie staging und liess den von Regel 4
// vorgeschriebenen Prod-Lauf still skippen.

export type BasicAuth = { username: string; password: string }

/**
 * Nur STAGING liegt hinter nginx-Basic-Auth. Prod und localhost nicht.
 * Muster uebernommen aus #5543 (`BRAUCHT_BASIC_AUTH = /staging/i.test(BASE)`).
 */
export function brauchtBasicAuth(ziel: string): boolean {
  return /staging/i.test(ziel)
}

/**
 * Liest die Credentials aus einer ENV-Map. Beide historischen Namenspaare werden
 * akzeptiert, damit bestehende Specs und gesetzte CI-Secrets unveraendert weiterlaufen.
 *
 * `||` statt `??` ist Absicht: ein gesetztes-aber-leeres CI-Secret rendert als `''`,
 * und `??` liesse den leeren String als gueltigen Wert durch (Klasse aus #5465).
 * Ein Kontext mit leerem Passwort scheitert an nginx mit 401 — das saehe aus wie ein
 * kaputtes Deployment, ist aber ein fehlendes Secret.
 */
export function credentialsAus(env: Record<string, string | undefined>): BasicAuth | undefined {
  const username = env.STAGING_BASIC_AUTH_USER || env.STAGING_BASIC_USER || ''
  const password = env.STAGING_BASIC_AUTH_PASS || env.STAGING_BASIC_PASS || ''
  if (!username || !password) return undefined
  return { username, password }
}

/** Das Ziel dieses Laufs. Identisch zu dem, was playwright.config.ts als baseURL setzt. */
export const ZIEL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

export const ZIEL_IST_STAGING = brauchtBasicAuth(ZIEL)

/**
 * Credentials fuer das aktuelle Ziel — `undefined`, wenn das Ziel keine braucht.
 * Direkt an `browser.newContext({ httpCredentials })` uebergebbar: Playwright
 * behandelt `undefined` als "keine Basic-Auth".
 */
export function basicAuthFuerZiel(): BasicAuth | undefined {
  if (!ZIEL_IST_STAGING) return undefined
  return credentialsAus(process.env)
}

/**
 * true = das Ziel braucht Basic-Auth, aber es sind keine Credentials da.
 * Der Test muss dann skippen — mit sichtbarer Begruendung, nicht still.
 */
export function basicAuthFehlt(): boolean {
  return ZIEL_IST_STAGING && basicAuthFuerZiel() === undefined
}
