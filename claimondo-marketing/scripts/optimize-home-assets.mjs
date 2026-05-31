// Home-Premium-Rework — Asset-Pipeline (A1).
// Kuratierte 16:9-Quellbilder (Aaron-Batch 31.05.) -> grosse .webp in public/img/home/.
// Bestehende public/-Library (kfzgutachter-lp/, marketing-landing-koeln/, brand/) +
// echte Brand-SVGs (claimondo-shield.svg) bleiben unangetastet und werden im Code genutzt.
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const SRC = 'C:/Users/Aaron Sprafke/Downloads/ChatGPT Image 31. Mai 2026, '
const OUT = 'public/img/home'
mkdirSync(OUT, { recursive: true })

// [Quelle, Slot, Zielbreite] — gross fuer Full-Bleed-16:9-Baender (Art-Direction §13.8)
const MAP = [
  ['21_39_14.png', 'hero-paar', 1920],       // Hero B: Paar + App
  ['21_40_47.png', 'team-band', 1920],       // Section #7 "Ein Team hinter Ihrem Fall"
  ['21_33_05.png', 'sv-vor-ort', 1600],      // Wie es funktioniert: SV vor Ort
  ['21_07_32.png', 'sv-andreas-app', 1280],  // SV + App
  ['21_06_51.png', 'werkstatt-app', 1280],   // Partner-Werkstatt + App
  ['20_55_30.png', 'kundin-app', 1280],      // Kundin + App
  ['21_20_11.png', 'berater', 1100],         // Menschen: Berater
  ['21_36_45.png', 'sofa', 1500],            // Entlastung/ruhiges Band
]

let ok = 0
for (const [src, slot, width] of MAP) {
  try {
    const info = await sharp(SRC + src).resize({ width }).webp({ quality: 74 }).toFile(`${OUT}/${slot}.webp`)
    console.log(`ok  ${slot}.webp  ${width}w  ${Math.round(info.size / 1024)}kb`)
    ok++
  } catch (e) {
    console.log(`SKIP ${slot} (${src}): ${e.message}`)
  }
}
console.log(`\n${ok}/${MAP.length} Assets geschrieben nach ${OUT}/`)
