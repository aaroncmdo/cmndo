/**
 * Pure GeoJSON-Builder fuer die LiveOps-Karte.
 *
 * Alle Funktionen sind seiteneffektfrei (pure) und vollstaendig
 * durch geo.test.ts abgesichert. Sie transformieren Chunk-1-Typen
 * in Mapbox-kompatible GeoJSON-FeatureCollections.
 *
 * WICHTIG: GeoJSON-Koordinaten sind immer [lng, lat] (nicht [lat, lng])!
 */

import type { SvLiveOps, TerminPin, DeadPin } from '@/lib/live-ops'

/**
 * SV-Standort-Pins. SVs ohne standortLat/Lng werden gefiltert.
 */
export function svPinsFC(svs: SvLiveOps[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: svs
      .filter((sv) => sv.standortLat != null && sv.standortLng != null)
      .map((sv) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [sv.standortLng as number, sv.standortLat as number],
        },
        properties: {
          __id: sv.id,
          __type: 'sv',
          typ: sv.typ,
          status: sv.gesperrt ? 'gesperrt' : sv.urlaub ? 'urlaub' : 'aktiv',
          verifiziert: sv.verifiziert,
          paket: sv.paket,
        },
      })),
  }
}

/**
 * Termin-Pins.
 */
export function terminPinsFC(termine: TerminPin[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: termine.map((t) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [t.lng, t.lat],
      },
      properties: {
        __id: t.id,
        __type: 'termin',
        status: t.status,
        svId: t.svId,
        svName: t.svName,
        kundeName: t.kundeName,
        startZeit: t.startZeit,
        claimNummer: t.claimNummer,
      },
    })),
  }
}

/**
 * Dead-Pins (inaktive/potenzielle SVs aus sv_leads).
 */
export function deadPinsFC(pins: DeadPin[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pins.map((dp) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [dp.lng, dp.lat],
      },
      properties: {
        __id: dp.id,
        __type: 'deadpin',
        status: dp.status,
        name: dp.name,
        firma: dp.firma,
        region: dp.region,
        quelle: dp.quelle,
      },
    })),
  }
}

/**
 * Isochrone-Polygone. Nur SVs mit `isochrone`-Payload werden inkludiert.
 */
export function isochroneFC(svs: SvLiveOps[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: svs
      .filter((sv) => sv.isochrone != null)
      .map((sv) => ({
        type: 'Feature' as const,
        geometry: sv.isochrone as GeoJSON.Polygon,
        properties: {
          __id: sv.id,
          __type: 'isochrone',
          typ: sv.typ,
        },
      })),
  }
}
