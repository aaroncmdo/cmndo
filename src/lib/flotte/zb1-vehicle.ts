// Reines Mapping ZB1-OCR -> VehicleSnapshot. Die FIN wird bewusst NICHT gemappt:
// ensureVehicleFromFin nimmt sie als eigenes Argument (sie ist der Dedup-Key, nicht Teil
// des Nachtrag-Snapshots). finQuelle='zb1_ocr' markiert die Provenienz in vehicles.fin_quelle.
import type { ZB1ExtractedData } from '@/lib/ocr/zb1-parser'
import type { VehicleSnapshot } from '@/lib/vehicles/ensure-vehicle'

/** Die im Review editierbaren Felder einer gescannten Zeile (FIN separat). */
export type EditierbareFahrzeugFelder = {
  fin: string | null
  kennzeichen: string | null
  hersteller: string | null
  modell: string | null
  hsn: string | null
  tsn: string | null
  farbe: string | null
  erstzulassung: string | null
  baujahr: number | null
  /** Spec B: EU-/KBA-Fahrzeugklasse (M1 | N1 | L3e | ...) -> harter Werkstatt-Matching-Filter.
   *  Bewusst NICHT Teil von VehicleSnapshot: der Write-Path kennt das Feld noch nicht -
   *  wird in einem spaeteren Task per separatem vehicles.update persistiert. */
  fahrzeugklasse: string | null
}

export function zb1ToVehicleSnapshot(e: ZB1ExtractedData): VehicleSnapshot {
  return {
    kennzeichen: e.kennzeichen,
    hersteller: e.fahrzeug_hersteller,
    modell: e.fahrzeug_modell,
    hsn: e.hsn,
    tsn: e.tsn,
    farbe: e.fahrzeug_farbe,
    baujahr: e.fahrzeug_baujahr,
    erstzulassung: e.erstzulassung,
    finQuelle: 'zb1_ocr',
  }
}

/** ZB1-OCR -> die editierbare Review-Zeile (FIN inklusive, fuer die Anzeige). */
export function zb1ToFelder(e: ZB1ExtractedData): EditierbareFahrzeugFelder {
  return {
    fin: e.fin_vin, kennzeichen: e.kennzeichen, hersteller: e.fahrzeug_hersteller,
    modell: e.fahrzeug_modell, hsn: e.hsn, tsn: e.tsn, farbe: e.fahrzeug_farbe,
    erstzulassung: e.erstzulassung, baujahr: e.fahrzeug_baujahr, fahrzeugklasse: e.fahrzeugklasse,
  }
}

/** Die editierten Review-Felder -> VehicleSnapshot (fuer die Anlage nach Nutzer-Korrektur). */
export function felderToSnapshot(f: EditierbareFahrzeugFelder): VehicleSnapshot {
  return {
    kennzeichen: f.kennzeichen, hersteller: f.hersteller, modell: f.modell,
    hsn: f.hsn, tsn: f.tsn, farbe: f.farbe, baujahr: f.baujahr,
    erstzulassung: f.erstzulassung, finQuelle: 'zb1_ocr',
  }
}
