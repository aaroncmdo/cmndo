// Shared image-compression helper for client-side use.
// Resizes to max 2400px on the longest side and re-encodes as JPEG 0.85 quality.
// Returns raw base64 (no data-URI prefix) + contentType.
// Call from a 'use client' component only (uses browser Canvas/createImageBitmap/FileReader).
//
// HEIC-/Grossfoto-Fix (22.07.): dekodiert bevorzugt via createImageBitmap(file, …) — das
// dekodiert das File/Blob DIREKT (kein grosser base64-Zwischenstring wie beim <img>+dataURL-
// Weg), unterstuetzt HEIC/HEIF nativ auf iOS/WebKit und ist speichereffizient bei sehr grossen
// Fotos (48MP), inkl. EXIF-Orientierung. Der alte <img>-Weg dekodierte iPhone-HEIC + Riesenfotos
// nicht -> `img.onerror` -> harter Fehler "Foto konnte nicht verarbeitet werden". <img> bleibt
// als Fallback fuer die seltenen Browser ohne createImageBitmap(options)-Support.

const MAX_DIMENSION = 2400
const JPEG_QUALITY = 0.85

type Komprimiert = { base64: string; contentType: string }

/** Zielmasse: laengste Seite auf MAX_DIMENSION begrenzen, Seitenverhaeltnis erhalten. Pure. */
export function zielMasse(width: number, height: number): { width: number; height: number } {
  if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) return { width, height }
  if (width >= height) {
    return { width: MAX_DIMENSION, height: Math.round((height / width) * MAX_DIMENSION) }
  }
  return { width: Math.round((width / height) * MAX_DIMENSION), height: MAX_DIMENSION }
}

function blobZuBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = (ev) => resolve(((ev.target?.result as string) ?? '').split(',')[1] ?? '')
    r.onerror = () => reject(new Error('Base64-Konvertierung fehlgeschlagen'))
    r.readAsDataURL(blob)
  })
}

/** Zeichnet die dekodierte Quelle downscaliert auf ein Canvas und gibt JPEG-base64 zurueck. */
function zeichneUndKodiere(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Komprimiert> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Canvas-Context nicht verfuegbar'))
  ctx.drawImage(source, 0, 0, width, height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Komprimierung fehlgeschlagen'))
        blobZuBase64(blob).then(
          (base64) => resolve({ base64, contentType: 'image/jpeg' }),
          reject,
        )
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

/** Bevorzugter Pfad: createImageBitmap dekodiert File/Blob direkt UND downscalet BEIM Dekodieren
 *  (resizeWidth) — ein Riesenfoto (48-200 MP Android/Samsung) landet damit NIE in voller Aufloesung
 *  im Speicher (sonst OOM -> Decode wirft -> "Foto konnte nicht verarbeitet werden"; genau die
 *  Grossfoto-Klasse, die BEIDE alten Wege — <img> UND voll-dekodierendes createImageBitmap — nicht
 *  packten). Portrait-Ueberhang (Hoehe > MAX nach Breiten-Cap) faengt zielMasse im Canvas-Schritt.
 *  HEIC nativ auf iOS/WebKit; EXIF-orientiert. Wirft, wenn nicht verfuegbar / Format nicht
 *  dekodierbar (z.B. HEIC auf Android-Chrome -> Fallback viaImgElement). */
async function viaImageBitmap(file: File): Promise<Komprimiert> {
  if (typeof createImageBitmap !== 'function') throw new Error('createImageBitmap nicht verfuegbar')
  // resizeWidth deckelt die Breite proportional schon beim Dekodieren -> Speicher gebunden statt
  // full-res. Landscape: Breite = laengste Seite (fertig). Portrait: Hoehe ggf. noch > MAX -> zielMasse.
  const bmp = await createImageBitmap(file, {
    resizeWidth: MAX_DIMENSION,
    resizeQuality: 'high',
    imageOrientation: 'from-image',
  })
  try {
    const { width, height } = zielMasse(bmp.width, bmp.height)
    return await zeichneUndKodiere(bmp, width, height)
  } finally {
    bmp.close()
  }
}

/** Fallback (aeltere Browser ohne createImageBitmap-Options): FileReader -> <img> -> Canvas. */
function viaImgElement(file: File): Promise<Komprimiert> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const { width, height } = zielMasse(img.width, img.height)
        zeichneUndKodiere(img, width, height).then(resolve, reject)
      }
      img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'))
    reader.readAsDataURL(file)
  })
}

export async function compressImage(file: File): Promise<Komprimiert> {
  try {
    return await viaImageBitmap(file)
  } catch {
    // createImageBitmap fehlt / Optionsobjekt nicht unterstuetzt / Format -> alter <img>-Weg.
    return await viaImgElement(file)
  }
}
