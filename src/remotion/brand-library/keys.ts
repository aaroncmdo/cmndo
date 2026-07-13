// Geteilter Vertrag zwischen registry.ts (server) und BrandVisual.tsx (Browser-Render):
// nur die Keys als Strings, keine Remotion-/React-Imports -> server-safe.
export const BRAND_KEYS = ['warndreieck', 'kennzeichen'] as const
export type BrandKey = (typeof BRAND_KEYS)[number]
