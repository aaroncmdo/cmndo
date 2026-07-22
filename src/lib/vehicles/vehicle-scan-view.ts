// SV-Galerie (Zustandsdoku-Vorzustand): laedt den letzten ABGESCHLOSSENEN Zustandsdoku-Scan
// eines Fahrzeugs — read-only. Perspektiv-Fotos (keine Nahaufnahmen) mit signierter URL +
// Qualitaets-Ampel (qualitaet_prozent/-hinweis, #4697) + die im Scan dokumentierten Vorschaeden.
// Verallgemeinert die Inline-Logik der FM-fahrzeug-Seite (fahrzeug/[id]/page.tsx, dort noch
// inline bis #4679 gelandet ist -> dann Boy-Scout-Migration auf diesen Loader). vehicle_scans*
// sind untyped (AnyDb wie #4678) — Caller uebergibt den Admin-Client (kein SV-RLS-Pfad).
import { getStorageUrl } from '@/lib/storage/url'
import {
  PERSPEKTIVE_LABEL,
  PFLICHT_PERSPEKTIVEN,
  OPTIONALE_PERSPEKTIVEN,
} from '@/lib/vehicles/zustand-perspektiven'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = import('@supabase/supabase-js').SupabaseClient<any, any, any>

const BUCKET = 'fahrzeug-zustand'

// Logische Galerie-Reihenfolge (Front zuerst … Ecken … Optionale) statt Upload-Zeitpunkt.
const PERSPEKTIVE_ORDER: Record<string, number> = Object.fromEntries(
  [...PFLICHT_PERSPEKTIVEN, ...OPTIONALE_PERSPEKTIVEN].map((p, i) => [p, i]),
)

export type ScanGalerieFoto = {
  id: string
  perspektive: string
  label: string
  url: string
  /** Claude-Qualitaets-Score 0-100 (Nutzbarkeit fuer die Schadenerkennung) — null = nicht bewertet. */
  prozent: number | null
  hinweis: string | null
}

export type ScanVorschaden = {
  id: string
  art: string | null
  schwere: string | null
  beschreibung: string | null
}

export type VehicleScanView = {
  scanId: string
  erstelltAm: string | null
  kilometerstand: number | null
  fotos: ScanGalerieFoto[]
  vorschaeden: ScanVorschaden[]
}

/**
 * Letzter abgeschlossener Zustandsdoku-Scan eines Fahrzeugs (read-only) — fuer die SV-Galerie
 * im Claim (Vorzustand beim Begutachten -> Neuschaden vs. Vorschaden). null = kein
 * abgeschlossener Scan. Ownership/Sichtbarkeit MUSS der Caller vorher pruefen (hier kein Gate).
 */
export async function getLetzterScanFuerVehicle(
  db: AnyDb,
  vehicleId: string,
): Promise<VehicleScanView | null> {
  if (!vehicleId) return null

  const { data: scanRow } = await db
    .from('vehicle_scans')
    .select('id, erstellt_am, kilometerstand')
    .eq('vehicle_id', vehicleId)
    .eq('status', 'abgeschlossen')
    .order('erstellt_am', { ascending: false })
    .limit(1)
    .maybeSingle()
  const scan = scanRow as
    | { id: string; erstellt_am: string | null; kilometerstand: number | null }
    | null
  if (!scan?.id) return null

  // Perspektiv-Fotos (keine Nahaufnahmen) + Qualitaets-Spalten. Signierte URLs parallel aufloesen.
  const { data: fotoRows } = await db
    .from('vehicle_scan_fotos')
    .select('id, storage_path, perspektive, qualitaet_prozent, qualitaet_hinweis')
    .eq('scan_id', scan.id)
    .eq('ist_nahaufnahme', false)
  const rows = (fotoRows ?? []) as Array<{
    id: string
    storage_path: string
    perspektive: string
    qualitaet_prozent: number | null
    qualitaet_hinweis: string | null
  }>

  const fotosRaw = await Promise.all(
    rows.map(async (f): Promise<ScanGalerieFoto | null> => {
      const url = await getStorageUrl(db, BUCKET, f.storage_path, { context: 'ui' })
      if (!url) return null // nicht aufloesbare URL -> Kachel weglassen statt kaputtes Bild
      return {
        id: f.id,
        perspektive: f.perspektive,
        label: PERSPEKTIVE_LABEL[f.perspektive] ?? f.perspektive,
        url,
        prozent: f.qualitaet_prozent ?? null,
        hinweis: f.qualitaet_hinweis ?? null,
      }
    }),
  )
  const fotos = fotosRaw.filter((x): x is ScanGalerieFoto => x !== null)
  fotos.sort(
    (a, b) => (PERSPEKTIVE_ORDER[a.perspektive] ?? 999) - (PERSPEKTIVE_ORDER[b.perspektive] ?? 999),
  )

  // Im Scan dokumentierte Vorschaeden (scan_id-gescopt — der Snapshot dieses Scans).
  const { data: vsRows } = await db
    .from('vehicle_vorschaeden')
    .select('id, art, schwere, beschreibung')
    .eq('scan_id', scan.id)
  const vorschaeden = ((vsRows ?? []) as Array<{
    id: string
    art: string | null
    schwere: string | null
    beschreibung: string | null
  }>).map((v) => ({
    id: v.id,
    art: v.art ?? null,
    schwere: v.schwere ?? null,
    beschreibung: v.beschreibung ?? null,
  }))

  return {
    scanId: scan.id,
    erstelltAm: scan.erstellt_am ?? null,
    kilometerstand: scan.kilometerstand ?? null,
    fotos,
    vorschaeden,
  }
}
