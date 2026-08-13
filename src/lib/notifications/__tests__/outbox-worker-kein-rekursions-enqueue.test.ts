import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// C3/§9-#6-GUARD. Seit dem durable Umbau (13.08.) schreibt `sendFallCommunication` in die
// Outbox, statt zu senden. Der Worker MUSS deshalb `sendFallCommunicationDirekt` rufen —
// nutzt er die durable Variante, schreibt er beim Abarbeiten einer Row eine NEUE Row und
// dreht sich im Kreis (jede abgearbeitete Nachricht erzeugt ihren eigenen Nachfolger).
//
// Der Fehler ist harmlos-aussehend: ein „aufgeraeumter" Import genuegt. Weder tsc noch die
// Unit-Tests faengt ihn — beide Funktionen haben dieselbe Signatur und denselben
// Rueckgabetyp. Deshalb dieser statische Guard am Quelltext.

const workerPfad = join(process.cwd(), 'src/lib/notifications/outbox-worker.ts')
const quelltext = readFileSync(workerPfad, 'utf8')

/** Kommentare entfernen — ein erklaerender Kommentar darf den Guard nicht blenden. */
function ohneKommentare(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('outbox-worker ruft NIE die durable Variante (Endlosschleifen-Guard)', () => {
  const code = ohneKommentare(quelltext)

  it('importiert sendFallCommunicationDirekt', () => {
    expect(code).toMatch(/import\s*\{[^}]*sendFallCommunicationDirekt[^}]*\}\s*from\s*'@\/lib\/communications\/send-fall'/)
  })

  it('ruft NICHT die durable sendFallCommunication auf', () => {
    // Wortgrenze rechts: `sendFallCommunicationDirekt(` darf nicht als Treffer zaehlen.
    const durableAufrufe = code.match(/\bsendFallCommunication\s*\(/g) ?? []
    expect(durableAufrufe, `gefunden: ${durableAufrufe.join(', ')}`).toHaveLength(0)
  })

  it('ruft die Direkt-Variante tatsaechlich auf (der Guard misst etwas)', () => {
    // Ohne diese Gegenprobe waere der Test auch dann gruen, wenn gar nicht mehr
    // gesendet wird — dann liefe die Outbox still ins Leere.
    expect(code).toMatch(/\bsendFallCommunicationDirekt\s*\(/)
  })
})
