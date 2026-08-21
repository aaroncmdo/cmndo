/**
 * Prueft jede Datei-Referenz der Datenbank gegen den tatsaechlichen Storage-Inhalt.
 *
 * ANLASS (21.08.2026): 6 von 18 Pflichtdokumenten zeigten auf Dateien, die es nicht mehr gab.
 * Zwei Sachverstaendige galten als `verifiziert` mit `status='geprueft'` — hinter dem Vermerk
 * lag nichts. Das lief **drei Monate** unbemerkt, weil nichts danach schaut. Zusaetzlich fehlen
 * 5 unterzeichnete Nutzungsbedingungen-PDFs (22.04.–07.05.) und 5 Gegner-Unterschriften.
 *
 * ⭐ Die Fehlerklasse ist „Eintrag ≠ Datei": Eine `dokument_url`-Zeile belegt, dass ein Upload
 * einmal GEMELDET wurde — nicht, dass die Datei heute noch existiert. Der Eintrag ist dabei
 * schaedlicher als gar keiner: Er behauptet einen Nachweis, den niemand vorlegen kann.
 */

/** Eine Tabellenspalte, die auf eine Storage-Datei zeigt. */
export type ReferenzQuelle = {
  tabelle: string
  spalte: string
  /** Ziel-Bucket bei relativen Pfaden. `null` = die Spalte traegt eine volle URL. */
  bucket: string | null
  /** Zusatzfelder, die im Befund mit ausgegeben werden (Komma-getrennt, PostgREST-Syntax). */
  kontext: string
}

export const REFERENZ_QUELLEN: ReferenzQuelle[] = [
  { tabelle: 'pflichtdokumente', spalte: 'dokument_url', bucket: 'fall-dokumente', kontext: 'sv_id,dokument_typ,status' },
  { tabelle: 'fall_dokumente', spalte: 'storage_path', bucket: 'fall-dokumente', kontext: 'fall_id,dokument_typ' },
  { tabelle: 'vertraege_unterzeichnet', spalte: 'pdf_storage_path', bucket: 'vertraege', kontext: 'sv_id,vorlage_typ,unterschrift_name' },
  { tabelle: 'sachverstaendige', spalte: 'logo_url', bucket: null, kontext: 'id,firmenname' },
  { tabelle: 'sachverstaendige', spalte: 'unterschrift_url', bucket: null, kontext: 'id,firmenname' },
  { tabelle: 'sachverstaendige', spalte: 'vertrag_pdf_url', bucket: null, kontext: 'id,firmenname' },
  { tabelle: 'profiles', spalte: 'avatar_url', bucket: null, kontext: 'id' },
  { tabelle: 'auftraege', spalte: 'gutachten_url', bucket: null, kontext: 'id,sv_id' },
  { tabelle: 'leads', spalte: 'polizeibericht_url', bucket: null, kontext: 'id' },
  { tabelle: 'leads', spalte: 'zb1_url', bucket: null, kontext: 'id' },
  { tabelle: 'leads', spalte: 'unfallskizze_url', bucket: null, kontext: 'id' },
  { tabelle: 'leads', spalte: 'zeugenaussage_url', bucket: null, kontext: 'id' },
  { tabelle: 'claims', spalte: 'sa_pdf_url', bucket: null, kontext: 'id' },
  { tabelle: 'claims', spalte: 'sa_unterschrift_url', bucket: null, kontext: 'id' },
  { tabelle: 'claims', spalte: 'unfallskizze_url', bucket: null, kontext: 'id' },
  { tabelle: 'claims', spalte: 'mietwagen_rechnung_url', bucket: null, kontext: 'id' },
  { tabelle: 'gutachten', spalte: 'bericht_pdf_url', bucket: null, kontext: 'id,sv_id' },
  { tabelle: 'gutachten', spalte: 'unterschrift_sv_url', bucket: null, kontext: 'id,sv_id' },
  { tabelle: 'kanzlei_faelle', spalte: 'anschlussschreiben_url', bucket: null, kontext: 'id' },
  { tabelle: 'nachrichten', spalte: 'anhang_url', bucket: null, kontext: 'id' },
]

export type ToteReferenz = {
  tabelle: string
  spalte: string
  bucket: string
  pfad: string
  kontext: string
  http: number
}

export type ReferenzBefund = {
  geprueft: number
  tot: ToteReferenz[]
  /** Zeilen, die eine ABLAUFENDE signierte URL speichern statt eines Pfades. */
  signierte: Array<{ tabelle: string; spalte: string; kontext: string }>
  extern: number
  dataUris: number
}

/**
 * Zerlegt eine volle Supabase-Storage-URL in Bucket + Pfad.
 * Erkennt die drei Formen `/object/<bucket>/`, `/object/public/<bucket>/`,
 * `/object/sign/<bucket>/` sowie `/authenticated/`.
 */
export function ausStorageUrl(wert: string): { bucket: string; pfad: string } | null {
  const m = wert.match(/\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([^/]+)\/(.+?)(?:\?|$)/)
  if (!m) return null
  return { bucket: m[1], pfad: decodeURIComponent(m[2]) }
}

/**
 * Bestimmt Bucket + Pfad fuer einen Spaltenwert.
 *
 * ⚠ Der Format-Mix ist die eigentliche Falle: Spalten, die einen RELATIVEN Pfad tragen sollen,
 * enthalten teilweise volle (signierte) URLs. Wer stur `bucket + wert` zusammensetzt, erzeugt
 * Unsinn und meldet gesunde Dateien als tot — beim ersten Lauf am 21.08. waren 9 von 19
 * „Treffern“ genau solche Fehlalarme.
 */
export function aufloesen(
  wert: string,
  quellenBucket: string | null,
): { art: 'storage'; bucket: string; pfad: string; signiert: boolean } | { art: 'extern' | 'data' } {
  if (wert.startsWith('data:')) return { art: 'data' }
  if (/^https?:\/\//i.test(wert)) {
    const zerlegt = ausStorageUrl(wert)
    if (!zerlegt) return { art: 'extern' }
    return {
      art: 'storage',
      bucket: zerlegt.bucket,
      pfad: zerlegt.pfad,
      signiert: /\/object\/sign\//.test(wert) || wert.includes('token='),
    }
  }
  if (!quellenBucket) return { art: 'extern' }
  return { art: 'storage', bucket: quellenBucket, pfad: wert, signiert: false }
}
