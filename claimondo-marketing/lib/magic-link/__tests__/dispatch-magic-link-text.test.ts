import { describe, it, expect } from 'vitest'
import { buildWhatsAppText } from '../dispatch-magic-link'

// Diese Nachricht bekommt JEDER Marketing-Lead als erste Kundenkommunikation.
// Die Tests sichern die AUSSAGEN, nicht die Formulierung — der Text darf umgeschrieben
// werden, aber nicht seine Zusagen verlieren.

const URL = 'https://app.claimondo.de/flow/abc123'

describe('FlowLink-WhatsApp an den Kunden', () => {
  it('nennt den Link und den Gueltigkeitszeitraum', () => {
    const t = buildWhatsAppText({ vorname: 'Ernest', flowUrl: URL })
    expect(t).toContain(URL)
    expect(t).toMatch(/72 Stunden/)
  })

  it('spricht den Kunden mit Namen an und siezt', () => {
    const t = buildWhatsAppText({ vorname: 'Ernest', flowUrl: URL })
    expect(t).toContain('Ernest')
    // ⚠ RICHTUNGSWECHSEL 06.09.2026. Hier stand das Gegenteil, mit der Begruendung
    // „Kundensicht ist auf du umgestellt — ein Sie/Ihr waere ein Rueckfall".
    // Aaron hat die Richtung umgedreht: „das soll auf Sie bleiben. Weil wenn das auch Du
    // ist, haben wir meistens die Schwierigkeit, dass sich einheitlich ist. Also es soll
    // die einheitliche Ansprache." Website, Portal und Nachrichten siezen jetzt durchgehend.
    expect(t).toMatch(/\bIhre[nmrs]?\b|\bIhnen\b|\bSie\b/)
    expect(t).not.toMatch(/\bdu\b|\bdein\b|\bdich\b|\bdir\b/i)
    // Und die Begruessung passt zur Anrede: „Hi" neben „Ihre" war ein Stilbruch.
    expect(t).toMatch(/^Hallo Ernest,/)
  })

  it('funktioniert ohne Vornamen (Lead ohne Namen)', () => {
    const t = buildWhatsAppText({ vorname: null, flowUrl: URL })
    expect(t).toContain(URL)
    expect(t).not.toContain('null')
    expect(t).not.toContain('undefined')
  })

  it('sagt, dass der Service den Kunden nichts kostet', () => {
    // Aaron 01.09.2026: der Kunde muss sehen, dass er fuer den Service nichts zahlt.
    const t = buildWhatsAppText({ vorname: 'Ernest', flowUrl: URL })
    expect(t).toMatch(/kostenlos|kostenfrei|keine Kosten/i)
  })

  it('verspricht NICHT pauschal, dass der Kunde gar nichts zahlt', () => {
    // Nur 62,7 % der Claims laufen ueber Haftpflicht; bei Selbstzahler (14,5 %) und
    // Kasko (10,8 %) traegt der Kunde Gutachten bzw. Selbstbeteiligung. Diese Nachricht
    // geht VOR der Klaerung des Abrechnungswegs raus — eine pauschale Zusage waere eine
    // irrefuehrende Angabe (§ 5 UWG).
    const t = buildWhatsAppText({ vorname: 'Ernest', flowUrl: URL })
    expect(t).not.toMatch(/du zahlst (gar )?nichts/i)
    expect(t).not.toMatch(/(komplett|voellig|völlig|rundum) kostenlos/i)
    expect(t).not.toMatch(/alles kostenlos/i)
  })

  it('erklaert die Unterschrift, statt sie abzukuerzen', () => {
    // Frueher: „legst du SA + Vollmacht ab". „SA" = Sicherungsabtretung — das versteht
    // kein Kunde, und bei einer bindenden Unterschrift ist das das falsche Mittel.
    const t = buildWhatsAppText({ vorname: 'Ernest', flowUrl: URL })
    expect(t).not.toMatch(/\bSA\b/)
    expect(t).toMatch(/Sicherungsabtretung/i)
    expect(t).toMatch(/Vollmacht/i)
  })
})
