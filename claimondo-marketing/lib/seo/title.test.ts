import { describe, it, expect } from 'vitest'
import { titelMitZusatz, angezeigteLaenge, BRAND_SUFFIX, TITEL_MAX_ANZEIGE } from './title'

// Die Staffel, die die Stadtseiten nutzen — hier als Fixture, damit die Tests
// genau das pruefen, was live laeuft.
const STAFFEL = [' – kostenfrei nach Unfall', ' – kostenfrei', ''] as const

describe('titelMitZusatz', () => {
  it('nimmt den vollen Zusatz, wenn er passt', () => {
    const t = titelMitZusatz('Kfz-Gutachter Köln', STAFFEL)
    expect(t).toBe('Kfz-Gutachter Köln – kostenfrei nach Unfall')
    expect(angezeigteLaenge(t)).toBeLessThanOrEqual(TITEL_MAX_ANZEIGE)
  })

  it('faellt auf den kurzen Zusatz zurueck, wenn der volle nicht mehr passt', () => {
    const t = titelMitZusatz('Kfz-Gutachter Ludwigshafen am Rhein', STAFFEL)
    expect(t).toBe('Kfz-Gutachter Ludwigshafen am Rhein – kostenfrei')
    expect(angezeigteLaenge(t)).toBeLessThanOrEqual(TITEL_MAX_ANZEIGE)
  })

  it('laesst den Zusatz ganz weg, wenn auch der kurze nicht passt', () => {
    // Basis aus der Rechnung bauen statt Zeichen zu zaehlen: gerade so lang,
    // dass der kurze Zusatz nicht mehr passt, der nackte Titel aber schon.
    const platz = TITEL_MAX_ANZEIGE - BRAND_SUFFIX.length
    const basis = 'x'.repeat(platz - ' – kostenfrei'.length + 1)
    const t = titelMitZusatz(basis, STAFFEL)
    expect(t).toBe(basis)
    expect(angezeigteLaenge(t)).toBeLessThanOrEqual(TITEL_MAX_ANZEIGE)
  })

  it('gibt die kuerzeste vorgesehene Fassung zurueck, wenn selbst die zu lang ist', () => {
    // Kein Zusatz rettet das mehr — dann lieber der nackte Titel als gar nichts.
    const basis = 'x'.repeat(TITEL_MAX_ANZEIGE)
    const t = titelMitZusatz(basis, STAFFEL)
    expect(t).toBe(basis)
    expect(angezeigteLaenge(t)).toBeGreaterThan(TITEL_MAX_ANZEIGE)
  })

  it('rechnet das Marken-Suffix mit, nicht nur den Titel', () => {
    // Genau an der Grenze: Basis 48 passt (48+12=60), 49 nicht mehr.
    const gerade = 'x'.repeat(TITEL_MAX_ANZEIGE - BRAND_SUFFIX.length)
    expect(titelMitZusatz(gerade, ['!', ''])).toBe(gerade)
    expect(angezeigteLaenge(gerade)).toBe(TITEL_MAX_ANZEIGE)
  })

  it('respektiert eine abweichende Obergrenze', () => {
    expect(titelMitZusatz('Kurz', [' – Zusatz', ''], 100)).toBe('Kurz – Zusatz')
    expect(titelMitZusatz('Kurz', [' – Zusatz', ''], 20)).toBe('Kurz')
  })

  it('kommt mit einer einelementigen Staffel klar', () => {
    expect(titelMitZusatz('Titel', [''])).toBe('Titel')
  })

  it('kommt mit einer leeren Staffel klar (kein Absturz)', () => {
    expect(titelMitZusatz('Titel', [])).toBe('Titel')
  })

  it('zaehlt Umlaute als je EIN Zeichen', () => {
    // Wichtig, weil die Ortsnamen voller Umlaute sind — eine byte-basierte
    // Zaehlung wuerde "Mülheim an der Ruhr" faelschlich als zu lang werten.
    const t = titelMitZusatz('Kfz-Gutachter Mülheim an der Ruhr', STAFFEL)
    expect(t).toBe('Kfz-Gutachter Mülheim an der Ruhr – kostenfrei')
    expect(angezeigteLaenge(t)).toBe(58)
  })
})
