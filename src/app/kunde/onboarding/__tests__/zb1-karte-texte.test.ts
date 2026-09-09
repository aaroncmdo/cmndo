import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 09.09.2026 — der Text, der in allen sechs Sprachen gleich falsch lag.
//
// Zwei neue Schlüssel landeten in `upload.zb1` statt `onboarding.zb1`: die Datei hat DREI
// Namespaces namens „zb1", und das Einfüge-Skript nahm den ersten Treffer. Die Oberfläche
// zeigte daraufhin den rohen Schlüssel „onboarding.zb1.finForm".
//
// ⭐ Kein bestehendes Gate konnte das sehen: `check:i18n` vergleicht die Locales
// UNTEREINANDER — in allen sechs gleich falsch ist paritätisch einwandfrei. Der
// `i18n-coverage`-Ratchet deckt nur dynamisch gebaute Namespaces ab. Gefunden hat es erst
// der Lauf durch die Oberfläche (MISSING_MESSAGE in der Browser-Konsole).
//
// Dieser Test schließt die Lücke für die Fahrzeugschein-Karte: eng gefasst auf eine Datei
// und einen Namespace, deshalb ohne Fehlalarm-Risiko.

const KARTE = join(process.cwd(), 'src/app/kunde/onboarding/Zb1Karte.tsx')
const DE = join(process.cwd(), 'src/i18n/messages/de.json')

/** Alle `t('zb1.xyz')`-Aufrufe der Karte — sie zeigen in `onboarding.zb1`. */
function benutzteSchluessel(): string[] {
  const quelle = readFileSync(KARTE, 'utf8')
  const treffer = [...quelle.matchAll(/\bt\('zb1\.([a-zA-Z0-9_]+)'/g)].map((m) => m[1])
  return [...new Set(treffer)].sort()
}

describe('Zb1Karte: jeder benutzte Text existiert im richtigen Namespace', () => {
  const messages = JSON.parse(readFileSync(DE, 'utf8')) as Record<string, unknown>
  const onboardingZb1 = ((messages.onboarding as Record<string, unknown>)?.zb1 ?? {}) as Record<string, string>

  it('die Karte benutzt überhaupt Texte aus diesem Namespace', () => {
    // Sonst prüfte der Test unbemerkt nichts mehr — etwa nach einer Umbenennung.
    expect(benutzteSchluessel().length).toBeGreaterThan(5)
  })

  it('alle benutzten Schlüssel liegen unter onboarding.zb1', () => {
    const fehlend = benutzteSchluessel().filter((k) => !(k in onboardingZb1))
    expect(fehlend).toEqual([])
  })

  it('kein Text der Karte liegt versehentlich unter upload.zb1', () => {
    // Die Datei hat drei Namespaces namens „zb1" — das war die Ursache.
    const uploadZb1 = (((messages.upload as Record<string, unknown>)?.zb1 ?? {}) as Record<string, string>)
    const verirrt = benutzteSchluessel().filter((k) => k in uploadZb1 && !(k in onboardingZb1))
    expect(verirrt).toEqual([])
  })

  it('jeder Text ist gefüllt, nicht nur vorhanden', () => {
    const leer = benutzteSchluessel().filter((k) => !String(onboardingZb1[k] ?? '').trim())
    expect(leer).toEqual([])
  })
})
