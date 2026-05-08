// Turn-by-Turn Navigation Helpers — basiert auf Mapbox Directions API.
//
// Liefert pro Route ein steps[]-Array mit:
//   - maneuver.instruction      "In 200 m rechts auf Hauptstraße"
//   - maneuver.type/modifier    Klassifikation für Pfeil-Icons
//   - maneuver.location         [lng,lat] des Maneuver-Punkts
//   - voiceInstructions[]       Text + distanceAlongGeometry
//   - bannerInstructions[]      Strukturiertes Banner mit primary/secondary
//   - geometry                  GeoJSON-LineString-Coords
//
// Web-Speech-API (window.speechSynthesis) übernimmt das Vorlesen.

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

export type TbtManeuverType =
  | 'turn'
  | 'depart'
  | 'arrive'
  | 'merge'
  | 'on ramp'
  | 'off ramp'
  | 'fork'
  | 'roundabout'
  | 'rotary'
  | 'roundabout turn'
  | 'continue'
  | 'end of road'
  | 'notification'
  | 'use lane'
  | string

export type TbtVoiceInstruction = {
  /** Distance entlang der Step-Geometry an der die Voice gesprochen werden soll. */
  distanceAlongGeometry: number
  announcement: string
  ssmlAnnouncement?: string
}

export type TbtLane = {
  /** True wenn diese Lane für den nächsten Maneuver genutzt werden muss. */
  active: boolean
  /** Erlaubte Richtungen aus dieser Spur (z.B. ['straight'], ['left', 'straight']). */
  directions: string[]
}

export type TbtBannerInstruction = {
  distanceAlongGeometry: number
  primary: { text: string; type?: string; modifier?: string }
  secondary?: { text: string } | null
  /** Spur-Anweisungen aus dem `sub`-Banner. Leer wenn die Route keine Spuren hat. */
  lanes?: TbtLane[]
}

export type TbtStep = {
  /** Mensch-lesbare Anweisung */
  instruction: string
  /** Maneuver-Typ (z.B. 'turn', 'roundabout', 'arrive') */
  maneuverType: TbtManeuverType
  /** Modifier (z.B. 'left', 'right', 'sharp left', 'straight') */
  maneuverModifier: string | null
  /** [lng, lat] des Maneuver-Punkts */
  maneuverLocation: [number, number]
  /** Strecke des Steps in Metern */
  distance: number
  /** Dauer des Steps in Sekunden */
  duration: number
  /** Straßenname nach dem Maneuver (für Banner) */
  name: string | null
  /** Voice-Anweisungen mit Trigger-Distance */
  voiceInstructions: TbtVoiceInstruction[]
  /** Banner-Instruktionen */
  bannerInstructions: TbtBannerInstruction[]
}

export type TbtRoute = {
  /** Gesamt-Strecke in Metern */
  distance: number
  /** Gesamt-Dauer in Sekunden */
  duration: number
  /** GeoJSON-LineString der gesamten Route */
  geometry: Array<[number, number]>
  steps: TbtStep[]
}

type RawStep = {
  maneuver: {
    instruction: string
    type: string
    modifier?: string
    location: [number, number]
  }
  distance: number
  duration: number
  name?: string
  voiceInstructions?: Array<{
    distanceAlongGeometry: number
    announcement: string
    ssmlAnnouncement?: string
  }>
  bannerInstructions?: Array<{
    distanceAlongGeometry: number
    primary: { text: string; type?: string; modifier?: string }
    secondary?: { text: string } | null
    sub?: {
      text?: string
      components?: Array<{
        type?: string
        active?: boolean
        directions?: string[]
      }>
    } | null
  }>
}

/**
 * Fetched Turn-by-Turn-Route via Mapbox Directions API. Liefert null wenn
 * keine Route gefunden oder API-Fehler.
 */
export async function fetchTurnByTurnRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  language: 'de' | 'en' = 'de',
): Promise<TbtRoute | null> {
  if (!MAPBOX_TOKEN) return null
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`
  const params = new URLSearchParams({
    geometries: 'geojson',
    overview: 'full',
    steps: 'true',
    voice_instructions: 'true',
    banner_instructions: 'true',
    voice_units: 'metric',
    language,
    access_token: MAPBOX_TOKEN,
  })
  try {
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?${params}`,
    )
    if (!res.ok) return null
    const data = await res.json()
    const route = data?.routes?.[0]
    if (!route) return null
    const leg = route.legs?.[0]
    if (!leg) return null
    const steps: TbtStep[] = ((leg.steps ?? []) as RawStep[]).map((s) => ({
      instruction: s.maneuver.instruction,
      maneuverType: s.maneuver.type,
      maneuverModifier: s.maneuver.modifier ?? null,
      maneuverLocation: s.maneuver.location,
      distance: s.distance,
      duration: s.duration,
      name: s.name ?? null,
      voiceInstructions: s.voiceInstructions ?? [],
      bannerInstructions: (s.bannerInstructions ?? []).map((b) => {
        const components = b.sub?.components ?? []
        const lanes: TbtLane[] = components
          .filter((c) => c.type === 'lane')
          .map((c) => ({
            active: c.active === true,
            directions: c.directions ?? [],
          }))
        return {
          distanceAlongGeometry: b.distanceAlongGeometry,
          primary: b.primary,
          secondary: b.secondary ?? null,
          lanes: lanes.length > 0 ? lanes : undefined,
        }
      }),
    }))
    return {
      distance: route.distance,
      duration: route.duration,
      geometry: route.geometry?.coordinates ?? [],
      steps,
    }
  } catch {
    return null
  }
}

// ─── Distance-Helper (Haversine, m) ──────────────────────────────────────

const EARTH_RADIUS_M = 6371000

export function haversineMetersLngLat(
  a: [number, number],
  b: [number, number],
): number {
  const [lng1, lat1] = a
  const [lng2, lat2] = b
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const sa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(sa))
}

/**
 * Minimale Distanz vom Punkt zu einer Polyline (in Metern).
 *
 * 2026-05-08 PR B2: Wird für Hazard-on-Route-Detection genutzt — wenn ein
 * HERE-Hazard (Unfall, Sperrung) innerhalb 50 m der aktiven Polyline liegt,
 * triggert das Reroute-Toast. Naive Local-Plane-Approximation: für die
 * Distanzen die wir hier prüfen (≤ 200 m, Strecken-Längen ≤ 50 km) ist der
 * Fehler durch Erdkrümmung unter 1 % — vernachlässigbar.
 */
export function pointToPolylineDistanceMLngLat(
  point: [number, number],
  polyline: Array<[number, number]>,
): number {
  if (polyline.length === 0) return Infinity
  if (polyline.length === 1) return haversineMetersLngLat(point, polyline[0])

  // Local equirectangular projection — zentriert auf den Punkt selbst.
  const lat0Rad = (point[1] * Math.PI) / 180
  const cosLat0 = Math.cos(lat0Rad)
  const M_PER_DEG_LAT = 111_320 // ≈ Konstante in mittleren Breiten
  const M_PER_DEG_LNG = 111_320 * cosLat0

  const px = point[0] * M_PER_DEG_LNG
  const py = point[1] * M_PER_DEG_LAT

  let minSq = Infinity
  for (let i = 0; i < polyline.length - 1; i++) {
    const ax = polyline[i][0] * M_PER_DEG_LNG
    const ay = polyline[i][1] * M_PER_DEG_LAT
    const bx = polyline[i + 1][0] * M_PER_DEG_LNG
    const by = polyline[i + 1][1] * M_PER_DEG_LAT

    const dx = bx - ax
    const dy = by - ay
    const lenSq = dx * dx + dy * dy
    let t = 0
    if (lenSq > 0) {
      t = ((px - ax) * dx + (py - ay) * dy) / lenSq
      if (t < 0) t = 0
      if (t > 1) t = 1
    }
    const cx = ax + t * dx
    const cy = ay + t * dy
    const ddx = px - cx
    const ddy = py - cy
    const distSq = ddx * ddx + ddy * ddy
    if (distSq < minSq) minSq = distSq
  }
  return Math.sqrt(minSq)
}

// ─── Voice-Speech (Web-Speech-API) ───────────────────────────────────────

let cachedVoice: SpeechSynthesisVoice | null = null

/**
 * 2026-05-08 Aaron-Smoke (übergangsweise free-Voice bis ElevenLabs Plan
 * upgraded ist): wir picken aus den im Browser verfügbaren TTS-Stimmen
 * die jeweils beste deutsche Variante. Reihenfolge nach Qualität:
 *
 *   1. iOS-Premium (Anna, Markus, Petra, Yannick)        — natürlich, neural
 *   2. macOS-Enhanced (Anna (Enhanced), Petra (Premium)) — natürlich
 *   3. Android-Google (Google Deutsch / Google de-DE)    — gut, neural
 *   4. Microsoft-Online-Voices (Hedda, Stefan, Katja)    — gut, neural
 *   5. Standard de-DE (Microsoft offline, Espeak etc.)   — Computer-typisch
 *   6. de-* fallback (de-AT, de-CH)
 *
 * `localService=false` bei Apple und Microsoft Voices markiert die
 * Online-/Cloud-Variante, die deutlich besser klingt als die Offline-
 * Stimme mit gleichem Namen. Wir bevorzugen sie, lassen sie aber als
 * letzten Schritt zu (offline funktioniert dann auch ohne Netz).
 */
function pickGermanVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  if (voices.length === 0) return null
  const isDe = (v: SpeechSynthesisVoice) => v.lang === 'de-DE'
  const isDeAny = (v: SpeechSynthesisVoice) => v.lang.startsWith('de')

  // Tier 1: explizit hochwertige Namen — meistens iOS Premium/Enhanced.
  const premiumNames = /(Anna|Petra|Markus|Yannick|Hedda|Stefan|Katja)/i
  cachedVoice =
    voices.find((v) => isDe(v) && premiumNames.test(v.name) && !v.localService) ??
    voices.find((v) => isDe(v) && premiumNames.test(v.name)) ??
    // Tier 2: Google Deutsch (Android Chrome / Desktop Chrome)
    voices.find((v) => isDe(v) && /Google/i.test(v.name)) ??
    // Tier 3: Microsoft Online Neural Voices (Edge)
    voices.find((v) => isDe(v) && /Microsoft.*Online/i.test(v.name)) ??
    // Tier 4: irgendeine de-DE
    voices.find((v) => isDe(v) && !v.localService) ??
    voices.find((v) => isDe(v)) ??
    // Tier 5: de-AT / de-CH als letzter Fallback (besser als Englisch
    // mit deutschem Text)
    voices.find((v) => isDeAny(v)) ??
    null
  return cachedVoice
}

/**
 * Liest einen Text laut vor. Cancelt vorherigen Speech.
 * 2026-05-07: ElevenLabs als Premium-Voice (wenn NEXT_PUBLIC_ELEVENLABS_
 * API_KEY gesetzt) → Fallback auf Web Speech API.
 * Failt silent wenn beide nicht verfügbar.
 *
 * 2026-05-08 Repeat-Guard: Aaron-Smoke-Test ergab dass speakInstruction()
 * bei manchen Render-Cycles dieselbe Anweisung mehrfach sprach (z.B. der
 * Blitzer-Effect feuerte erneut bei jedem GPS-Tick mit unverändertem Set,
 * weil set-mutations in einem Ref nicht automatisch die useEffect-Closure
 * neu evaluieren). Hier eine letzte Verteidigungslinie: identische Texte
 * innerhalb von 8 Sekunden nicht doppelt aussprechen — egal ob Caller-
 * Dedup vergeigt war.
 */
const recentlySpoken = new Map<string, number>()
const REPEAT_COOLDOWN_MS = 8_000

export function speakInstruction(text: string): void {
  if (typeof window === 'undefined') return
  const trimmed = text.trim()
  if (!trimmed) return

  const now = Date.now()
  const lastAt = recentlySpoken.get(trimmed)
  if (lastAt != null && now - lastAt < REPEAT_COOLDOWN_MS) return
  recentlySpoken.set(trimmed, now)
  // Map nicht beliebig wachsen lassen — alte Einträge nach Cooldown-Ablauf
  // wegputzen wenn der Map-Footprint > 64 Einträge ist.
  if (recentlySpoken.size > 64) {
    for (const [k, ts] of recentlySpoken) {
      if (now - ts > REPEAT_COOLDOWN_MS) recentlySpoken.delete(k)
    }
  }

  // Priority: 1. Google TTS (Neural2-D), 2. ElevenLabs, 3. Web Speech API
  void import('./google-tts').then(({ speakViaGoogleTts, isGoogleTtsEnabled }) => {
    if (isGoogleTtsEnabled()) {
      void speakViaGoogleTts(trimmed).then((ok) => {
        if (ok) return
        // Fallback: ElevenLabs
        void import('./elevenlabs-tts').then(({ speakViaElevenLabs, isElevenLabsEnabled }) => {
          if (isElevenLabsEnabled()) {
            void speakViaElevenLabs(trimmed).then((ok2) => {
              if (!ok2) fastSpeechSynthesis(trimmed)
            })
          } else {
            fastSpeechSynthesis(trimmed)
          }
        }).catch(() => fastSpeechSynthesis(trimmed))
      })
    } else {
      fastSpeechSynthesis(trimmed)
    }
  }).catch(() => fastSpeechSynthesis(trimmed))
}

function fastSpeechSynthesis(text: string): void {
  if (!window.speechSynthesis) return
  try {
    // 2026-05-08: Voice-Liste kann beim ersten Aufruf leer sein und wird
    // asynchron befüllt. Wenn pickGermanVoice null returnt, einmal
    // voiceschanged abwarten und retry — sonst spricht der Browser mit
    // Default-Englisch.
    const voice = pickGermanVoice()
    if (!voice && window.speechSynthesis.getVoices().length === 0) {
      const onChange = () => {
        window.speechSynthesis.removeEventListener('voiceschanged', onChange)
        cachedVoice = null
        fastSpeechSynthesis(text)
      }
      window.speechSynthesis.addEventListener('voiceschanged', onChange, { once: true })
      return
    }
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    if (voice) utter.voice = voice
    utter.lang = 'de-DE'
    // 2026-05-08 Aaron-Feedback Free-Voice-Polish: leicht langsamer +
    // minimal höher klingt natürlicher als Default 1.0/1.0 — vor allem
    // auf Microsoft- und Espeak-Stimmen die sonst hektisch wirken.
    utter.rate = 0.95
    utter.pitch = 1.05
    utter.volume = 1.0
    window.speechSynthesis.speak(utter)
  } catch {
    /* noop */
  }
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined') return
  try {
    window.speechSynthesis?.cancel()
  } catch { /* noop */ }
  void import('./google-tts').then(({ stopGoogleTts }) => stopGoogleTts()).catch(() => { /* noop */ })
  void import('./elevenlabs-tts').then(({ stopElevenLabs }) => stopElevenLabs()).catch(() => { /* noop */ })
}
