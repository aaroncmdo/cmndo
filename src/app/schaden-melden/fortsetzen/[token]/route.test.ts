import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Regression-Guards fuer den Fortsetzen-Deeplink (P1-Fix 17.07.2026):
// LeadReminder1-4 verlinken /schaden-melden/fortsetzen/<reminder_token>. Vorher existierte
// die Route in KEINEM Build — claimondo.de 404te, app.claimondo.de warf einen permanenten
// 308 auf den Funnel-Start und verwarf den Token (next.config-Stopgap). Diese Guards halten
// die vier Bausteine des Fixes zusammen: Route + next.config-Redirect-Entfall +
// proxy-Host-Ausnahme + Marketing-Weiterleitung. (Lazy read: Datei-fehlt = Test-Fail,
// nicht Collection-Error.)
const read = (p: string) => readFileSync(p, 'utf8')

describe('/schaden-melden/fortsetzen/[token] — Nurture-Deeplink', () => {
  it('resolved reminder_token ueber den kanonischen FlowLink-Weg (mintet bei 72h-Expiry frisch)', () => {
    const route = read('src/app/schaden-melden/fortsetzen/[token]/route.ts')
    expect(route).toContain('ensureCanonicalFlowLinkForLead')
    expect(route).toContain(".eq('reminder_token'")
  })

  it('redirectet temporaer auf /flow/<token> — nie permanent (Token->FlowLink-Mapping ist dynamisch)', () => {
    const route = read('src/app/schaden-melden/fortsetzen/[token]/route.ts')
    expect(route).toContain('/flow/')
    expect(route).not.toContain('permanentRedirect')
  })

  it('faellt bei ungueltigem/unbekanntem Token auf den Marketing-Funnel zurueck', () => {
    const route = read('src/app/schaden-melden/fortsetzen/[token]/route.ts')
    expect(route).toContain('https://claimondo.de/schaden-melden')
  })

  it('next.config traegt den alten 308-Stopgap NICHT mehr als source (er liefe VOR dem Routing und wuerde die Route ueberschatten)', () => {
    const config = read('next.config.ts')
    expect(config).not.toContain("source: '/schaden-melden/fortsetzen")
  })

  it('proxy.ts nimmt den Fortsetzen-Pfad von der Marketing-301-Weiche aus (sonst app->claimondo->app-Redirect-Loop)', () => {
    const proxy = read('src/proxy.ts')
    expect(proxy).toContain('FORTSETZEN_PREFIX')
    expect(proxy).toContain("'/schaden-melden/fortsetzen'")
  })

  it('Marketing-Build leitet den Fortsetzen-Pfad zur App weiter (Mails mit Fallback-Base landen auf claimondo.de)', () => {
    const mkt = read('claimondo-marketing/next.config.ts')
    expect(mkt).toContain("'/schaden-melden/fortsetzen/:token'")
    expect(mkt).toContain('app.claimondo.de/schaden-melden/fortsetzen/:token')
  })
})
