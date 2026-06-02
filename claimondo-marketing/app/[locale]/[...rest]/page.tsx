import { notFound } from 'next/navigation'

// Catch-all für unmatchte Pfade unter [locale]. Next.js zeigt für komplett
// unbekannte URLs sonst die GLOBALE Default-404 statt unserer lokalisierten
// not-found.tsx. Dieser Catch-all wirft notFound() -> rendert app/[locale]/
// not-found.tsx (Lead-Rettung). Spezifischere Routen gewinnen weiterhin gegen
// den Catch-all; er greift nur, wenn nichts anderes matcht.
// (next-intl-empfohlenes Pattern für lokalisierte 404.)

export default function CatchAllNotFound(): never {
  notFound()
}
