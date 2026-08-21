// Minimaler ZIP-Leser: Central Directory parsen, Eintraege per inflateRaw
// entpacken. Node bringt zlib mit, aber kein unzip — und eine neue Abhaengigkeit
// fuer einen jaehrlichen Datenlauf waere teurer als diese 60 Zeilen.
//
// WARUM UEBERHAUPT: der Unfallatlas-Generator soll EIN Kommando sein. Ein
// Skript, das erst einen manuellen PowerShell-Vorlauf braucht, wird beim
// naechsten Jahrgang nicht mehr ausgefuehrt.
import { inflateRawSync } from 'node:zlib'

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50

/**
 * Listet die Eintraege eines ZIP-Puffers.
 * @returns {{name: string, groesse: number, entpacke: () => Buffer}[]}
 */
export function zipEintraege(buf) {
  // End-of-Central-Directory rueckwaerts suchen (Kommentar am Ende moeglich).
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66_000; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Kein ZIP: End-of-Central-Directory nicht gefunden')

  const anzahl = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16) // Offset des Central Directory

  const eintraege = []
  for (let i = 0; i < anzahl; i++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) throw new Error(`Central-Directory-Eintrag ${i} defekt`)
    const methode = buf.readUInt16LE(p + 10)
    const komprimiert = buf.readUInt32LE(p + 20)
    const groesse = buf.readUInt32LE(p + 24)
    const nLen = buf.readUInt16LE(p + 28)
    const eLen = buf.readUInt16LE(p + 30)
    const kLen = buf.readUInt16LE(p + 32)
    const lokal = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nLen)

    eintraege.push({
      name,
      groesse,
      entpacke() {
        // Der lokale Header hat EIGENE Laengenfelder — die des Central
        // Directory stimmen hier nicht zwingend ueberein.
        const lnLen = buf.readUInt16LE(lokal + 26)
        const leLen = buf.readUInt16LE(lokal + 28)
        const start = lokal + 30 + lnLen + leLen
        const roh = buf.subarray(start, start + komprimiert)
        if (methode === 0) return Buffer.from(roh)      // gespeichert
        if (methode === 8) return inflateRawSync(roh)   // deflate
        throw new Error(`ZIP-Methode ${methode} nicht unterstuetzt (${name})`)
      },
    })
    p += 46 + nLen + eLen + kLen
  }
  return eintraege
}
