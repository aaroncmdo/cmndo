'use client'

// Turn-by-Turn-Hook: lädt Route → trackt aktuellen Step + Voice.
// Voice ist standardmäßig an, kann via `voiceEnabled`-Param toggled werden.
//
// Step-Wechsel-Heuristik:
//   GPS-Distance zur nächsten Maneuver-Position < 30m → next step.
// Off-Route-Detection ist MVP-out — erkannte Abweichungen führen aktuell
// nicht zu Re-Routing, der SV sieht weiter den nächsten Step.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchTurnByTurnRoute,
  haversineMetersLngLat,
  speakInstruction,
  stopSpeaking,
  type TbtRoute,
  type TbtStep,
} from '@/lib/mapbox/turn-by-turn'

export interface UseTurnByTurnArgs {
  origin: { lat: number; lng: number } | null
  destination: { lat: number; lng: number } | null
  /** SV-Live-Position aus useFieldTracking. */
  position: { lat: number; lng: number } | null
  /** Voice an/aus. Default true. */
  voiceEnabled?: boolean
  /** Distance in Metern bei der next-step ausgelöst wird. Default 30. */
  stepAdvanceMeters?: number
  /** Distance in Metern bei der Off-Route erkannt + Re-Routing getriggert wird. Default 60. */
  offRouteThresholdMeters?: number
}

export interface UseTurnByTurnResult {
  route: TbtRoute | null
  loading: boolean
  /** Aktiver Step (Index). */
  currentStepIndex: number
  /** Nächster zu erreichender Maneuver-Step (= currentStepIndex + 1 typisch). */
  upcomingStep: TbtStep | null
  /** Distance in Metern zum nächsten Maneuver-Punkt. */
  distanceToNextManeuver: number | null
  /** Wird aktuell automatisch neu geroutet (kurzfristig nach Off-Route). */
  rerouting: boolean
  /** Manuell neu fetchen. */
  refresh: () => void
}

/**
 * Distance vom Punkt p zum nächsten Punkt einer Polyline (geometry).
 * Approximation: minimale Haversine-Distance zu den Vertex-Punkten —
 * gut genug für Off-Route-Detection bei dichten Routen-Geometrien.
 */
function distanceToRoute(
  p: { lat: number; lng: number },
  geometry: Array<[number, number]>,
): number {
  if (geometry.length === 0) return Infinity
  let min = Infinity
  for (const [lng, lat] of geometry) {
    const d = haversineMetersLngLat([p.lng, p.lat], [lng, lat])
    if (d < min) min = d
  }
  return min
}

export function useTurnByTurn({
  origin,
  destination,
  position,
  voiceEnabled = true,
  stepAdvanceMeters = 30,
  offRouteThresholdMeters = 60,
}: UseTurnByTurnArgs): UseTurnByTurnResult {
  const [route, setRoute] = useState<TbtRoute | null>(null)
  const [loading, setLoading] = useState(false)
  const [rerouting, setRerouting] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [refreshTick, setRefreshTick] = useState(0)
  // Trackt gesprochene Voice-IDs damit jede nur einmal kommt
  const spokenVoiceKeys = useRef<Set<string>>(new Set())
  // Off-Route-State: wann zuletzt Re-Routing getriggert (Throttle 15s)
  const lastReroutedAt = useRef<number>(0)
  // Trackt N-aufeinanderfolgende Off-Route-Frames damit ein einzelner GPS-
  // Jitter nicht direkt re-routet
  const offRouteCount = useRef<number>(0)

  // Route laden bei Origin/Destination-Wechsel oder Refresh-Trigger
  useEffect(() => {
    if (!origin || !destination) {
      setRoute(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setCurrentStepIndex(0)
    spokenVoiceKeys.current.clear()
    fetchTurnByTurnRoute(origin, destination, 'de').then((r) => {
      if (cancelled) return
      setRoute(r)
      setLoading(false)
      // Initial-Voice: erste Anweisung sofort
      if (r && voiceEnabled && r.steps[0]?.voiceInstructions[0]) {
        const v = r.steps[0].voiceInstructions[0]
        speakInstruction(v.announcement)
        spokenVoiceKeys.current.add(`0-${v.distanceAlongGeometry}`)
      }
    })
    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, refreshTick])

  // Step-Tracking: bei jeder Position-Änderung Distance zum nächsten Maneuver
  // prüfen und ggf. Step weiter. Voice-Instructions auswerten + Off-Route
  // detect → Re-Routing nach 3 aufeinanderfolgenden Off-Route-Frames mit
  // mind. 15s Cooldown zwischen Re-Routes.
  useEffect(() => {
    if (!route || !position) return

    // Off-Route-Detection
    const dRoute = distanceToRoute(position, route.geometry)
    if (dRoute > offRouteThresholdMeters) {
      offRouteCount.current += 1
      const cooldownOk = Date.now() - lastReroutedAt.current > 15_000
      if (offRouteCount.current >= 3 && cooldownOk && destination) {
        offRouteCount.current = 0
        lastReroutedAt.current = Date.now()
        setRerouting(true)
        if (voiceEnabled) speakInstruction('Neue Route wird berechnet')
        fetchTurnByTurnRoute(
          { lat: position.lat, lng: position.lng },
          destination,
          'de',
        ).then((r) => {
          setRerouting(false)
          if (r) {
            setRoute(r)
            setCurrentStepIndex(0)
            spokenVoiceKeys.current.clear()
            // Erste Voice der neuen Route direkt
            if (voiceEnabled && r.steps[0]?.voiceInstructions[0]) {
              const v = r.steps[0].voiceInstructions[0]
              speakInstruction(v.announcement)
              spokenVoiceKeys.current.add(`0-${v.distanceAlongGeometry}`)
            }
          }
        })
        return // Beim Re-Routing aktuelle Step-Logik überspringen
      }
    } else {
      offRouteCount.current = 0
    }

    const nextStep = route.steps[currentStepIndex + 1]
    if (!nextStep) return // Letzter Step — Ziel wird erreicht

    const dist = haversineMetersLngLat(
      [position.lng, position.lat],
      nextStep.maneuverLocation,
    )

    // Voice-Instructions des aktuellen Steps prüfen
    if (voiceEnabled) {
      const cur = route.steps[currentStepIndex]
      if (cur) {
        for (const v of cur.voiceInstructions) {
          // Heuristik: wenn Distance zum nächsten Maneuver <= v.distanceAlongGeometry
          // (= Restdistance des Steps), dann Voice playen — einmal pro Trigger-Punkt
          const key = `${currentStepIndex}-${v.distanceAlongGeometry}`
          if (spokenVoiceKeys.current.has(key)) continue
          if (dist <= v.distanceAlongGeometry + 5) {
            speakInstruction(v.announcement)
            spokenVoiceKeys.current.add(key)
          }
        }
      }
    }

    // Step-Übergang
    if (dist < stepAdvanceMeters) {
      setCurrentStepIndex((idx) => idx + 1)
    }
  }, [position, route, currentStepIndex, voiceEnabled, stepAdvanceMeters, offRouteThresholdMeters, destination])

  // Voice abschalten cancelt alle pending Utterances
  useEffect(() => {
    if (!voiceEnabled) stopSpeaking()
  }, [voiceEnabled])

  // Cleanup beim Unmount
  useEffect(() => {
    return () => {
      stopSpeaking()
    }
  }, [])

  const distanceToNextManeuver = useMemo(() => {
    if (!route || !position) return null
    const nextStep = route.steps[currentStepIndex + 1]
    if (!nextStep) return null
    return Math.round(
      haversineMetersLngLat([position.lng, position.lat], nextStep.maneuverLocation),
    )
  }, [route, position, currentStepIndex])

  const upcomingStep = useMemo(() => {
    if (!route) return null
    return route.steps[currentStepIndex + 1] ?? route.steps[currentStepIndex] ?? null
  }, [route, currentStepIndex])

  return {
    route,
    loading,
    rerouting,
    currentStepIndex,
    upcomingStep,
    distanceToNextManeuver,
    refresh: () => setRefreshTick((t) => t + 1),
  }
}
