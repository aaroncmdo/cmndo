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

// ─── Voice-Speech (Web-Speech-API) ───────────────────────────────────────

let cachedVoice: SpeechSynthesisVoice | null = null

function pickGermanVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  cachedVoice =
    voices.find((v) => v.lang === 'de-DE' && /(Anna|Markus|Petra)/i.test(v.name)) ??
    voices.find((v) => v.lang === 'de-DE') ??
    voices.find((v) => v.lang.startsWith('de')) ??
    null
  return cachedVoice
}

/**
 * Liest einen Text laut vor. Cancelt vorherigen Speech.
 * 2026-05-07: ElevenLabs als Premium-Voice (wenn NEXT_PUBLIC_ELEVENLABS_
 * API_KEY gesetzt) → Fallback auf Web Speech API.
 * Failt silent wenn beide nicht verfügbar.
 */
export function speakInstruction(text: string): void {
  if (typeof window === 'undefined') return
  if (!text.trim()) return

  // ElevenLabs zuerst probieren — fire-and-forget. Bei Fehler oder
  // disabled Feature fällt fastSpeechSynthesis() unten als Fallback ein.
  void import('./elevenlabs-tts').then(({ speakViaElevenLabs, isElevenLabsEnabled }) => {
    if (isElevenLabsEnabled()) {
      void speakViaElevenLabs(text).then((ok) => {
        if (!ok) fastSpeechSynthesis(text)
      })
    } else {
      fastSpeechSynthesis(text)
    }
  }).catch(() => fastSpeechSynthesis(text))
}

function fastSpeechSynthesis(text: string): void {
  if (!window.speechSynthesis) return
  try {
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    const voice = pickGermanVoice()
    if (voice) utter.voice = voice
    utter.lang = 'de-DE'
    utter.rate = 1.0
    utter.pitch = 1.0
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
  void import('./elevenlabs-tts').then(({ stopElevenLabs }) => stopElevenLabs()).catch(() => { /* noop */ })
}
