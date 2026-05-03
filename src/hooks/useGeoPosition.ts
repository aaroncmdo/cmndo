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

import { useCallback, useEffect, useRef, useState } from 'react'
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

export type GeoPermission = 'granted' | 'prompt' | 'denied' | 'unsupported'

export type GeoPositionState = {
  permission: GeoPermission
  /** Triggert den Browser-Prompt; gibt zurueck wenn der User entschieden hat. */
  requestPermission: () => Promise<void>
}

export function useGeoPosition(svId: string | null): GeoPositionState {
  const watchIdRef = useRef<number | null>(null)
  const auftragRef = useRef<AktiverAuftrag>(null)
  const lastEtaCallRef = useRef<number>(0)
  const ankunftGefeuertRef = useRef<boolean>(false)
  const [, force] = useState(0)
  const [permission, setPermission] = useState<GeoPermission>('unsupported')
  const supabase = createClient()

  // Permission-State live spiegeln (Permissions-API hat onchange).
  // Damit kann der Browser nach dem Prompt automatisch starten ohne
  // dass wir pollen muessen; wenn der User in den Settings die
  // Permission widerruft, lassen wir auch das mitlaufen.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPermission('unsupported')
      return
    }
    // iOS Safari < 16 hat permissions.query fuer geolocation nicht — wir
    // nehmen 'prompt' als sicheren Default und ueberlassen die Entscheidung
    // dem User-Klick auf den Aktivieren-Button (der dann getCurrentPosition
    // ruft und der iOS-Sheet erscheint).
    if (!navigator.permissions?.query) {
      setPermission('prompt')
      return
    }
    let cancelled = false
    let statusRef: PermissionStatus | null = null
    const handler = () => {
      if (cancelled || !statusRef) return
      setPermission(statusRef.state as GeoPermission)
    }
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        if (cancelled) return
        statusRef = status
        setPermission(status.state as GeoPermission)
        status.addEventListener('change', handler)
      })
      .catch(() => setPermission('prompt'))
    return () => {
      cancelled = true
      if (statusRef) statusRef.removeEventListener('change', handler)
    }
  }, [])

  const requestPermission = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    return new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          setPermission('granted')
          resolve()
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) setPermission('denied')
          resolve()
        },
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
      )
    })
  }, [])

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

  // GPS-Watch — startet erst sobald die Permission auf 'granted' steht.
  // Damit triggert der watchPosition-Aufruf nicht selbst den Prompt; das
  // uebernimmt requestPermission() per User-Klick (oder ein bereits
  // erteilter Persistent-Grant). Wechselt der Permission-State auf
  // 'granted', startet der Watch automatisch ohne weitere Interaktion.
  useEffect(() => {
    if (!svId || typeof navigator === 'undefined' || !navigator.geolocation) return
    if (permission !== 'granted') return

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
  }, [svId, permission]) // eslint-disable-line react-hooks/exhaustive-deps

  return { permission, requestPermission }
}
