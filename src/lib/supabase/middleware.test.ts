// Regressionstest fuer die publicPaths-Allowlist (Auth-Grenze der Middleware).
//
// Warum dieser Test existiert: isPublicPath matcht per startsWith. Ein Eintrag OHNE
// Trailing-Slash oeffnet daher stillschweigend alle Geschwister-Routen mit gleichem
// Praefix — ein Auth-Bypass, den weder Build noch tsc noch ein anderer Ratchet faengt.
// Die Datei warnt inline mehrfach vor genau dieser Falle ('/g/', '/auth/bestaetigen',
// '/embed/', '/makler/registrieren', '/werkstatt/registrieren')
// — und trotzdem ist sie erneut zugeschlagen: '/kunde/termin' (ohne Slash) oeffnete
// '/kunde/termine' (Termin-Liste) und '/kunde/termine/[id]' (Termin-Detail). Beide sind
// auth-required und laden per createAdminClient() (Service-Role, RLS-umgehend); anon bekam
// dort 200-Shells statt 307 -> /login (prod-verifiziert 20.07.2026).
// Kommentare allein halten diese Grenze nachweislich nicht — deshalb Assertions.

import { describe, it, expect } from 'vitest'
import { isPublicPath } from './middleware'

describe('isPublicPath — Magic-Link-Routen bleiben public', () => {
  it.each([
    ['/kunde/termin/abc-token-123', 'SV-Live-Tracking (WhatsApp-Magic-Link)'],
    ['/kunde/re-termin/tok', 'Re-Termin-Slot-Picker (no-show-Cron)'],
    ['/kunde-termin', 'Token-Termin-Bestaetigung'],
    ['/g/mein-sv-slug', 'Hosted-Widget-Seite'],
    ['/embed/gutachter-finder', 'iframe-Embed'],
    ['/auth/bestaetigen', 'Prefetch-gehaerteter Klick-Gate'],
    ['/werkstatt/registrieren', 'Werkstatt-Selbst-Registrierung'],
    ['/flotte/registrieren', 'Flotten-Selbst-Registrierung (Partner-Einladung)'],
    ['/makler/registrieren', 'Makler-Selbst-Registrierung'],
    ['/login', 'Login selbst'],
    ['/', 'Root'],
    ['/sitemap.xml', 'SEO-Crawler-Endpunkt'],
    ['/robots.txt', 'SEO-Crawler-Endpunkt'],
  ])('%s ist public (%s)', (pfad) => {
    expect(isPublicPath(pfad)).toBe(true)
  })
})

describe('isPublicPath — geschuetzte Portal-Routen bleiben hinter dem Auth-Gate', () => {
  it.each([
    // Der konkrete Regressionsfall (20.07.2026): duerfen NICHT vom '/kunde/termin/'-
    // Eintrag mitgeoeffnet werden. Beide laden per Service-Role-Client.
    ['/kunde/termine', 'Termin-Liste'],
    ['/kunde/termine/9f0c1d2e-0000-4000-8000-000000000000', 'Termin-Detail (ID)'],
    ['/kunde', 'Kunde-Portal-Root'],
    ['/kunde/profil', 'Kunde-Profil'],
    // Die inline dokumentierten Geschwister-Fallen — als Dauer-Wache mitgetestet.
    ['/gutachter/dashboard', "darf nicht durch '/g/' oder '/gutachter-*' fallen"],
    ['/auth/callback', "darf nicht durch '/auth/bestaetigen' fallen"],
    ['/werkstatt/auftraege', "darf nicht durch '/werkstatt-*' fallen"],
    ['/makler/leads', "darf nicht durch '/makler/*-Registrierung' fallen"],
    ['/admin/faelle', 'Admin-Portal'],
    ['/dispatch/leads', 'Dispatch-Portal'],
  ])('%s ist geschuetzt (%s)', (pfad) => {
    expect(isPublicPath(pfad)).toBe(false)
  })
})

describe('isPublicPath — Trailing-Slash-Disziplin (die eigentliche Bug-Klasse)', () => {
  it('ein Eintrag mit Slash oeffnet die Token-Subroute, aber nicht den Namens-Nachbarn', () => {
    // Genau die Asymmetrie, die der Fix herstellt:
    expect(isPublicPath('/kunde/termin/xyz')).toBe(true) // Subroute -> public
    expect(isPublicPath('/kunde/termine')).toBe(false) // Nachbar -> geschuetzt
  })

  it('kein publicPaths-Eintrag oeffnet versehentlich ein ganzes Portal', () => {
    // Waechter gegen kuenftige nackte Praefixe wie '/kunde', '/werkstatt', '/admin'.
    for (const portalRoute of ['/admin/', '/dispatch/', '/kunde/faelle', '/gutachter/termine']) {
      expect(isPublicPath(portalRoute)).toBe(false)
    }
  })
})
