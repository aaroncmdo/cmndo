'use client'

// CMM-36: Always-on GPS-Hook im Gutachter-Layout.
//
// Schreibt jede Position in sv_live_location und — wenn ein aktiver Auftrag
// im Anfahrts-Fenster existiert — berechnet ETA und spiegelt sie auf
// gutachter_termine (sv_unterwegs_seit + sv_eta_minuten). Bei Distanz < 100 m
// wird die Ankunft automatisch markiert (arrived()).
//
// Damit ist die Tracking-Funktion nicht mehr davon abhängig dass der SV die
// Fallseite öffnet — sie läuft sobald irgendeine Gutachter-Portal-Seite offen
// ist.

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { berechneEta } from '@/lib/mapbox/eta'
import { haversineMeters } from '@/lib/gps/geofence'
import { arrived, markTerminDurchgefuehrt, updateAuftragLive } from '@/lib/termine/actions'
import { getAktiverAuftrag, type AktiverAuftrag } from '@/lib/auftrag/aktiver-auftrag'

const AKTIVER_AUFTRAG_REFRESH_MS = 5 * 60 * 1000  // alle 5 min Termin-Liste neu prüfen
const ETA_RECALC_MIN_INTERVAL_MS = 30_000           // nicht häufiger als alle 30 s
const FENSTER_PUFFER_MIN = 15
const FENSTER_FALLBACK_MIN = 90
const ANKUNFT_RADIUS_M = 100
const ABFAHRT_RADIUS_M = 2000  // >2 km weg vom Ziel = Termin durchgeführt

function imAnfahrtsFenster(auftrag: NonNullable<AktiverAuftrag>): boolean {
  const start = new Date(auftrag.startZeit).getTime()
  if (Number.isNaN(start)) return false
  const fahrtzeit = Math.max(auftrag.geschaetzteFahrtzeitMin ?? FENSTER_FALLBACK_MIN, FENSTER_FALLBACK_MIN)
  const fensterStart = start - (fahrtzeit + FENSTER_PUFFER_MIN) * 60_000
  const fensterEnde = start + 60 * 60_000
  const now = Date.now()
  return now >= fensterStart && now <= fensterEnde
}

export type GeoPermission = PermissionState | 'unsupported'

export function useGeoPosition(svId: string | null) {
  const watchIdRef = useRef<number | null>(null)
  const auftragRef = useRef<AktiverAuftrag>(null)
  const lastEtaCallRef = useRef<number>(0)
  const ankunftGefeuertRef = useRef<boolean>(false)
  const [, force] = useState(0)
  const supabase = createClient()

  // Aktiven Auftrag laden + periodisch refreshen
  useEffect(() => {
    if (!svId) return
    let stopped = false
    const load = async () => {
      try {
        const a = await getAktiverAuftrag(svId)
        if (stopped) return
        auftragRef.current = a
        ankunftGefeuertRef.current = false
        force((n) => n + 1)
      } catch (err) {
        console.warn('[CMM-36] getAktiverAuftrag fehlgeschlagen:', err)
      }
    }
    void load()
    const t = setInterval(load, AKTIVER_AUFTRAG_REFRESH_MS)
    return () => {
      stopped = true
      clearInterval(t)
    }
  }, [svId])

  // GPS-Watch
  useEffect(() => {
    if (!svId || typeof navigator === 'undefined' || !navigator.geolocation) return

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const now = new Date().toISOString()

        // Position immer schreiben (kein ETA-Kontext nötig)
        await supabase.from('sv_live_location').upsert(
          {
            sv_id: svId,
            fall_id: null,
            lat,
            lng,
            accuracy: pos.coords.accuracy,
            updated_at: now,
          },
          { onConflict: 'sv_id' },
        )

        const auftrag = auftragRef.current
        if (!auftrag) return

        // ── Vor-Ort-Modus: SV ist angekommen, prüfe Geofence-Out (>2 km) ──────
        if (auftrag.modus === 'vor-ort') {
          if (auftrag.zielLat == null || auftrag.zielLng == null) return
          const dist = haversineMeters(lat, lng, auftrag.zielLat, auftrag.zielLng)
          if (dist >= ABFAHRT_RADIUS_M) {
            try {
              await markTerminDurchgefuehrt(auftrag.terminId)
              auftragRef.current = null
            } catch (err) {
              console.warn('[CMM-32] markTerminDurchgefuehrt failed:', err)
            }
          }
          return
        }

        // ── Anfahrts-Modus: ETA + Auto-Ankunft ────────────────────────────────
        if (!imAnfahrtsFenster(auftrag)) return

        // Auto-Ankunft wenn nahe genug
        if (
          !ankunftGefeuertRef.current &&
          auftrag.zielLat != null &&
          auftrag.zielLng != null
        ) {
          const dist = haversineMeters(lat, lng, auftrag.zielLat, auftrag.zielLng)
          if (dist <= ANKUNFT_RADIUS_M) {
            ankunftGefeuertRef.current = true
            try {
              const r = await arrived(auftrag.terminId)
              if (r?.error) {
                console.warn('[CMM-36] Auto-Ankunft fehlgeschlagen:', r.error)
                ankunftGefeuertRef.current = false
              } else {
                auftragRef.current = null  // Banner endet
              }
            } catch (err) {
              console.warn('[CMM-36] arrived() fehler:', err)
              ankunftGefeuertRef.current = false
            }
            return
          }
        }

        // ETA berechnen + auf den Termin spiegeln (Throttle 30 s)
        if (Date.now() - lastEtaCallRef.current < ETA_RECALC_MIN_INTERVAL_MS) return
        if (!auftrag.zielAdresse) return
        lastEtaCallRef.current = Date.now()
        try {
          const eta = await berechneEta(lat, lng, auftrag.zielAdresse)
          if (eta) {
            await updateAuftragLive(auftrag.terminId, eta.etaMinuten)
          }
        } catch (err) {
          console.warn('[CMM-36] ETA-Update fehlgeschlagen:', err)
        }
      },
      (err) => console.warn('[CMM-36] GPS-Fehler:', err.message),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    )

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [svId]) // eslint-disable-line react-hooks/exhaustive-deps
}
