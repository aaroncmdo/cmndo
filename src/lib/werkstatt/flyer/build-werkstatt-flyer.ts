// Werkstatt-Partner-Flyer (A5) mit eingesetztem QR-Code + lesbarer QR-Nummer.
// Setzt je Eintrag den QR (abgerundete weisse Karte, exakt im "Scannen & starten"-
// Platzhalter) in eine Kopie der Vorlagen-Seite; mehrere Eintraege -> Multi-Page-PDF
// (1 Flyer/Seite, direkt druckbar). Koordinaten sind per Pixel-Analyse der Vorlage
// ermittelt (A5-Export = 2165x3068pt, Origin unten-links).
//
// Token-Audit-Skip: QR-Generierung braucht konkrete Hex-Werte (kein CSS-Kontext);
//   analog src/lib/kanzlei/qr-code.ts. Siehe AGENTS.md §branding-rules.
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import QRCode from 'qrcode'

export type FlyerEntry = { token: string; url: string }

// Platzhalter-Box ("Scannen & starten"-Bildchen) im 2165x3068-Raum (Origin unten-links).
const CARD = { x: 1550, y: 655, w: 452, h: 484, radius: 30, pad: 22 }
// QR-Nummer: klein + dezent-grau, zentriert direkt unter der QR-Karte (fuegt sich ins
// Design ein, statt gross unten-rechts loszuloesen). gapBelowCard = Abstand unter CARD.y.
const TOKEN = { fontSize: 19, gapBelowCard: 62 }
const TOKEN_GREY = rgb(0.55, 0.57, 0.61)
const QR_DARK = '#0D1B3E' // Claimondo-Navy
const QR_LIGHT = '#ffffff'

function roundedRectPath(w: number, h: number, r: number): string {
  return `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${r} Q 0 0 ${r} 0 Z`
}

/**
 * Baut ein Flyer-PDF: je Eintrag eine A5-Seite mit eingesetztem QR + Nummer.
 * @param templateBytes  Bytes der A5-Vorlage (public/flyer-templates/werkstatt-partner-a5.pdf).
 * @param entries        Token + Ziel-URL je Flyer.
 */
export async function buildWerkstattFlyerPdf(
  templateBytes: Uint8Array,
  entries: FlyerEntry[],
): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  const tpl = await PDFDocument.load(templateBytes)
  const font = await out.embedFont(StandardFonts.Helvetica)
  const { x, y, w, h, radius, pad } = CARD
  const qs = Math.min(w, h) - 2 * pad

  // Alle Seiten in EINEM copyPages-Call kopieren -> pdf-lib dedupliziert das
  // grosse Vorlagen-Bild (sonst je Flyer eine 1MB-Kopie -> riesiges Bulk-PDF).
  const pages = await out.copyPages(tpl, entries.map(() => 0))
  for (let i = 0; i < entries.length; i++) {
    const { token, url } = entries[i]
    const page = pages[i]
    out.addPage(page)

    // Abgerundete weisse Karte deckt den Verlaufs-Platzhalter ab.
    page.drawSvgPath(roundedRectPath(w, h, radius), { x, y: y + h, color: rgb(1, 1, 1) })

    // QR zentriert auf der Karte.
    // 600px PNG reicht fuer den ~2.8cm-Druck-QR (crisp), ohne die Bulk-Erzeugung
    // unnoetig zu verlangsamen (qs*4 waere ~4x ueberdimensioniert).
    const pngBuf = await QRCode.toBuffer(url, {
      type: 'png',
      width: 600,
      margin: 1,
      color: { dark: QR_DARK, light: QR_LIGHT },
    })
    const png = await out.embedPng(pngBuf)
    page.drawImage(png, { x: x + (w - qs) / 2, y: y + (h - qs) / 2, width: qs, height: qs })

    // QR-Nummer klein + dezent grau, zentriert direkt unter der QR-Karte.
    const tw = font.widthOfTextAtSize(token, TOKEN.fontSize)
    page.drawText(token, {
      x: x + (w - tw) / 2,
      y: y - TOKEN.gapBelowCard,
      size: TOKEN.fontSize,
      font,
      color: TOKEN_GREY,
    })
  }

  return out.save()
}
