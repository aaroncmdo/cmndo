// Der `oppref` muss durch eine LANGE Kette: Marketing-Landingpage → iframe-src →
// Embed-Page → Client-Root → Wizard → Server-Action → leads.oppref.
//
// Faellt EIN Glied aus, verschwindet der Wert lautlos. Genau das ist in dieser
// Codebase schon passiert: `schadenart` stand seit dem 25.08. in der llms.txt,
// wurde aber von der Prop-Allowlist der EmbedFinderSection verworfen — kein
// Fehler, keine leere Seite, nur eine Ersparnis, die nie eintrat. Gefunden wurde
// es drei Tage spaeter per Zufall (Kommentar in EmbedFinderSection.tsx).
//
// Hier waere der Schaden groesser: der Embed-Finder ist der GROESSTE Lead-Kanal
// (gemessen 03.09.2026: 43 Leads gegen 6 ueber den Mini-Wizard). Ein
// stillgelegtes Glied hiesse, dass die Anzeigen fast nichts zu bringen scheinen.
//
// Der Test prueft die STRUKTUR, nicht das Verhalten: dass jedes Glied den Wert
// ueberhaupt kennt. Dass er am Ende real ankommt, kann nur ein Durchlauf auf
// prod zeigen (Regel 4) — aber ein fehlendes Glied faellt hier sofort auf,
// statt erst in einer Auswertung, die niemand als falsch erkennt.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const KETTEN: Record<string, string[]> = {
  'Gutachter-Finder': [
    // Marketing-Build: Wert ermitteln und an den iframe haengen
    'claimondo-marketing/app/[locale]/gutachter-finden/page.tsx',
    'claimondo-marketing/components/embed-finder/EmbedFinderSection.tsx',
    // App-Build: aus der iframe-URL bis in die Server-Action
    'src/app/embed/gutachter-finder/page.tsx',
    'src/app/embed/gutachter-finder/_components/FinderWizard.tsx',
    'src/app/embed/gutachter-finder/actions.ts',
  ],
  'Werkstatt-Finder': [
    'claimondo-marketing/app/[locale]/werkstatt-finden/page.tsx',
    'claimondo-marketing/components/embed-finder/EmbedFinderSection.tsx',
    'src/app/embed/werkstatt-finder/page.tsx',
    // Das Zwischenglied, das beim Bau zunaechst uebersehen wurde — die Page
    // rendert nicht den Wizard, sondern diesen Kompositions-Root.
    'src/app/embed/werkstatt-finder/WerkstattFinderEmbedClient.tsx',
    'src/app/embed/werkstatt-finder/_components/WerkstattWizard.tsx',
    'src/app/embed/werkstatt-finder/actions.ts',
  ],
}

function lies(rel: string): string {
  const p = join(process.cwd(), rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : ''
}

describe('oppref erreicht den Lead durch die iframe-Grenze', () => {
  for (const [name, glieder] of Object.entries(KETTEN)) {
    for (const glied of glieder) {
      it(`${name}: ${glied.split('/').pop()} reicht oppref weiter`, () => {
        const inhalt = lies(glied)
        // Erst pruefen, dass die Datei ueberhaupt da ist: ein umbenanntes Glied
        // wuerde sonst als "enthaelt kein oppref" durchgehen und wie ein echter
        // Befund aussehen.
        expect(inhalt.length, `${glied} nicht gefunden — Kette umgebaut?`).toBeGreaterThan(0)
        expect(inhalt, `${glied} kennt oppref nicht — die Kette ist unterbrochen`).toContain('oppref')
      })
    }
  }

  it('beide Embed-Actions schreiben oppref an den Lead', () => {
    // Durchreichen allein genuegt nicht — am Ende muss der Wert in der DB landen,
    // sonst haben die spaeteren Ereignisse (Termin, SA) nichts zu lesen.
    const gutachter = lies('src/app/embed/gutachter-finder/actions.ts')
    expect(gutachter).toMatch(/update\(\{\s*oppref/)

    // Der Werkstatt-Pfad legt den Lead ueber createCase an und gibt oppref im
    // `extra`-Objekt mit — dieselbe Zeile wie ga_client_id, kein Nachtrag-Update.
    const werkstatt = lies('src/app/embed/werkstatt-finder/actions.ts')
    expect(werkstatt).toMatch(/\)\.oppref = payload\.oppref/)
  })
})
