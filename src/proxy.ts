import { type NextRequest } from 'next/server'
import { updateSession } from './lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // 2026-05-07 (Aaron-Smoke MAP3): .glb fehlte im Exclude → /3d/sv-car.glb
  // wurde durch updateSession gefangen und nach /login redirected. Mapbox
  // lud das 3D-Auto-Modell nie, fiel auf 2D-SVG-Marker zurück.
  // 2026-05-08 (Aaron-Smoke /sw.js): Service-Worker-Registration scheiterte
  // mit „script resource is behind a redirect" — /sw.js wurde durch
  // updateSession gefangen und ohne Session nach /login redirected. Browser
  // verbieten Redirects bei SW-Registration aus Sicherheitsgründen. Fix:
  // .js + .json zur Exclude-Liste, damit /sw.js und /manifest.json roh
  // ausgeliefert werden. /_next/static-Chunks sind ohnehin schon raus, also
  // kein Risiko dass authenticated Server-JS hier rauspurzelt.
  matcher: [
    // 2026-05-08 (C11b): .obj + .mtl ergänzt — Three.js OBJLoader für
    // /3d/porsche.obj wurde sonst auf /login redirected.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb|gltf|obj|mtl|hdr|ktx2|woff|woff2|mp4|webm|js|json|txt|xml)$).*)',
  ],
}
