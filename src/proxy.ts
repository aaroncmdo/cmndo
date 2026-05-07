import { type NextRequest } from 'next/server'
import { updateSession } from './lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // 2026-05-07 (Aaron-Smoke MAP3): .glb fehlte im Exclude → /3d/sv-car.glb
  // wurde durch updateSession gefangen und nach /login redirected. Mapbox
  // lud das 3D-Auto-Modell nie, fiel auf 2D-SVG-Marker zurück.
  // Plus weitere static asset extensions (gltf, hdr, ktx2, woff/woff2 etc.)
  // damit ähnliche Fälle künftig nicht wiederkommen.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb|gltf|hdr|ktx2|woff|woff2|mp4|webm)$).*)',
  ],
}
