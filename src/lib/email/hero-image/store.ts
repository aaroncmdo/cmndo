// P1b: Erzeugt den gebackenen Email-Hero EINMAL pro (make,modell,farbe) und legt ihn im
// public Bucket `email-hero` ab → stabile URL fürs Email-<img> (kein Regenerieren pro Open).
// Alles defensiv: jeder Fehler (kein imagin, kein Hersteller, Storage-/Compose-Fehler) → null,
// der Caller (KundeWelcome) fällt dann auf den flachen Navy-Hero zurück.
import type { SupabaseClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildImaginUrl, type LackfarbeCode } from '@/lib/fahrzeug/imagin'
import { composeHero, fetchImageBuffer } from './compose'

const BUCKET = 'email-hero'
// Vorab-Asset als Hintergrund-Basis (geblurrt im Compose). Austauschbar gegen ein
// dediziertes "Autowelt"-Foto, sobald vorhanden.
const BASE_ASSET = ['public', 'brand', 'hero-unfall-mann.png']
// Cache-Key des Blur-Heros OHNE Auto — eine gemeinsame Datei für alle Kunden.
// Der verschwommene Marken-Hero (Basis-Asset + Navy/Glow-Overlay) braucht kein
// imagin; nur das eingebettete Fahrzeug-Rendering braucht den Customer-Key.
const BASE_HERO_KEY = 'base-hero.jpg'
const HERO_W = 1200
const HERO_H = 640

export type Fahrzeug = {
  hersteller: string | null
  modell: string | null
  lackfarbe: LackfarbeCode | null
}

/** imagin erst nach Freischaltung (Prod-Customer) — sonst kein Auto-Bild (kein Wasserzeichen). */
function imaginLive(): boolean {
  return (process.env.NEXT_PUBLIC_IMAGIN_CUSTOMER ?? 'demo') !== 'demo'
}

function slug(s: string | null): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x'
}

/** Cache-Key = make_modell_farbe.jpg → ein Bild je Fahrzeug-Variante. */
export function heroCacheKey(fz: Fahrzeug): string {
  return `${slug(fz.hersteller)}_${slug(fz.modell)}_${slug(fz.lackfarbe)}.jpg`
}

/**
 * Liefert die stabile public URL des gebackenen Heros — generiert + lädt ihn beim
 * ersten Mal hoch, danach Cache-Hit. null, wenn nicht möglich (Caller → Navy-Hero).
 */
export async function getOrCreateHeroImageUrl(db: SupabaseClient, fz: Fahrzeug): Promise<string | null> {
  try {
    // Das personalisierte Fahrzeug-Rendering braucht imagin (Prod-Customer-Key)
    // UND einen bekannten Hersteller. Der verschwommene Marken-Hero (Basis +
    // Navy/Glow) NICHT — er wird IMMER gebacken, damit jede Kunden-Mail den
    // Marken-Hero statt des flachen Navy-Fallbacks bekommt. Ohne Auto teilen
    // sich alle Kunden EINE Basis-Datei (BASE_HERO_KEY), mit Auto gibt es je
    // Fahrzeug-Variante eine eigene Datei (heroCacheKey).
    const withCar = imaginLive() && !!fz.hersteller?.trim()
    const key = withCar ? heroCacheKey(fz) : BASE_HERO_KEY
    const storage = db.storage.from(BUCKET)
    const publicUrl = storage.getPublicUrl(key).data.publicUrl

    // Cache-Hit?
    const { data: existing } = await storage.list('', { search: key, limit: 1 })
    if (existing?.some((o) => o.name === key)) return publicUrl

    // Generieren: Basis (fs) immer, Fahrzeug (imagin) nur wenn withCar → composeHero → Upload.
    const carUrl = withCar
      ? buildImaginUrl({ hersteller: fz.hersteller, modell: fz.modell, lackfarbe: fz.lackfarbe, baujahr: null })
      : null
    const [base, car] = await Promise.all([
      readFile(join(process.cwd(), ...BASE_ASSET)),
      carUrl ? fetchImageBuffer(carUrl) : Promise.resolve(null),
    ])
    const jpg = await composeHero(base, car, { width: HERO_W, height: HERO_H })

    const { error } = await storage.upload(key, jpg, {
      contentType: 'image/jpeg',
      upsert: true,
      cacheControl: '31536000',
    })
    if (error) return null
    return publicUrl
  } catch {
    return null
  }
}
