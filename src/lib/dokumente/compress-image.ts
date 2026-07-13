// Shared image-compression helper for client-side use.
// Resizes to max 2400px on the longest side and re-encodes as JPEG 0.85 quality.
// Returns raw base64 (no data-URI prefix) + contentType.
// Extracted from MultiSlotUploadClient — call from a 'use client' component only
// (uses browser Canvas + FileReader APIs).

const MAX_DIMENSION = 2400
const JPEG_QUALITY = 0.85

export async function compressImage(file: File): Promise<{ base64: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height / width) * MAX_DIMENSION)
            width = MAX_DIMENSION
          } else {
            width = Math.round((width / height) * MAX_DIMENSION)
            height = MAX_DIMENSION
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas-Context nicht verfuegbar'))
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Komprimierung fehlgeschlagen'))
            const r2 = new FileReader()
            r2.onload = (ev) => {
              const dataUrl = ev.target?.result as string
              const base64 = dataUrl.split(',')[1] ?? ''
              resolve({ base64, contentType: 'image/jpeg' })
            }
            r2.onerror = () => reject(new Error('Base64-Konvertierung fehlgeschlagen'))
            r2.readAsDataURL(blob)
          },
          'image/jpeg',
          JPEG_QUALITY,
        )
      }
      img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'))
    reader.readAsDataURL(file)
  })
}
