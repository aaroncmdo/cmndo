// ZB1-Scan-Auswertung fuer die Firmen-Flotte-Batch-Anlage (Task 4 der ZB1-Batch-Spec).
// Reiner READ-Pfad -- KEIN Write. Liefert die editierbare Review-Zeile (felder) plus drei
// Signale fuer die UI: Confidence (wie sicher ist die OCR), bereitsInFlotte (FIN-Dedup gegen
// die eigene Flotte) und halterWarnung (ZB1-Halter weicht vom Firmennamen ab, z.B. Leasing).
import type { SupabaseClient } from '@supabase/supabase-js'
import { runZB1Ocr } from '@/lib/ocr/zb1-parser'
import { zb1ToFelder, type EditierbareFahrzeugFelder } from './zb1-vehicle'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

// Identisch zu VIN_REGEX (ensure-vehicle.ts) / FIN_REGEX (zb1-batch-anlage.ts) -- bewusst
// lokal dupliziert, kein gemeinsamer Export vorhanden (etablierte Konvention in diesem Ordner).
const FIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/

// Rechtsform-Suffixe, die beim Halter-Fuzzy-Vergleich ignoriert werden (Leasing/Finanzierung
// weicht legitim vom Firmennamen ab -- siehe Spec §4.7, kein Block, nur Warnung).
const RECHTSFORM_REGEX = /\b(gmbh|ag|kg|ohg|ug|mbh|gbr)\b/g
const EK_REGEX = /\be\.\s*k\.?/g
const CO_REGEX = /&\s*co\.?/g

/** lowercase, Rechtsform-Suffixe + "& Co." raus, Satzzeichen weg, Whitespace kollabiert. */
function normalisiereHaltername(raw: string): string {
  return raw
    .toLowerCase()
    .replace(CO_REGEX, ' ')
    .replace(EK_REGEX, ' ')
    .replace(RECHTSFORM_REGEX, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type ScanErgebnis = {
  felder: EditierbareFahrzeugFelder
  confidence: number
  bereitsInFlotte: boolean
  halterWarnung: boolean
  halterZb1: string | null
}

/** OCR + Confidence + FIN-Dedup-gegen-Flotte + Halter-Fuzzy-Vergleich. Kein Write. */
export async function scanZb1FuerFlotte(
  db: AnyDb,
  base64: string,
  firmaId: string,
): Promise<{ ok: true; ergebnis: ScanErgebnis } | { ok: false; error: string }> {
  const ocr = await runZB1Ocr(base64)
  if ('error' in ocr) return { ok: false, error: ocr.error }
  const { extracted } = ocr

  const felder = zb1ToFelder(extracted)

  // Confidence: Anteil der 5 Kernfelder, die die OCR erkannt hat (identische Heuristik wie
  // der bestehende Lead-Scan in src/app/api/ocr/zb1-scan/route.ts).
  const core = [extracted.fin_vin, extracted.hsn, extracted.tsn, extracted.kennzeichen, extracted.erstzulassung]
  const confidence = core.filter(Boolean).length / core.length

  // FIN-Dup-Check gegen die eigene Flotte -- nur wenn die FIN gesetzt UND 17-Zeichen-gueltig ist.
  const fin = felder.fin?.trim().toUpperCase() || null
  let bereitsInFlotte = false
  if (fin && FIN_REGEX.test(fin)) {
    const { data: dup } = await db
      .from('flotten_fahrzeuge')
      .select('vehicle_id, vehicles!inner(fin)')
      .eq('firma_id', firmaId)
      .eq('vehicles.fin', fin)
      .maybeSingle()
    bereitsInFlotte = !!dup
  }

  // Halter-Fuzzy-Vergleich gegen den Firmennamen (Leasing/Finanzierung weicht legitim ab).
  const halterZb1 = extracted.halter_nachname ?? extracted.halter_vorname
  const { data: firma } = await db.from('firmen').select('name').eq('id', firmaId).maybeSingle()
  const firmaName = (firma as { name: string | null } | null)?.name ?? null

  let halterWarnung = false
  if (halterZb1 && firmaName) {
    const halterNorm = normalisiereHaltername(halterZb1)
    const firmaNorm = normalisiereHaltername(firmaName)
    halterWarnung = !firmaNorm.includes(halterNorm)
  }

  return { ok: true, ergebnis: { felder, confidence, bereitsInFlotte, halterWarnung, halterZb1 } }
}
