/**
 * Pure GeoJSON-Builder fuer die LiveOps-Karte.
 *
 * Alle Funktionen sind seiteneffektfrei (pure) und vollstaendig
 * durch geo.test.ts abgesichert. Sie transformieren Chunk-1-Typen
 * in Mapbox-kompatible GeoJSON-FeatureCollections.
 *
 * WICHTIG: GeoJSON-Koordinaten sind immer [lng, lat] (nicht [lat, lng])!
 */

import type { SvLiveOps, TerminPin, DeadPin, UnterwegsRoute, TagesRoute, LeadPin } from '@/lib/live-ops'

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
        fallId: t.fallId,
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
 * Unterwegs-Routen: jede UnterwegsRoute → LineString-Feature.
 * Routen mit weniger als 2 Koordinaten werden gefiltert.
 */
export function routenFC(routen: UnterwegsRoute[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: routen
      .filter((r) => r.coords.length >= 2)
      .map((r) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: r.coords,
        },
        properties: {
          __type: 'route',
          svId: r.svId,
        },
      })),
  }
}

/**
 * Tagesrouten: jede TagesRoute → LineString-Feature aus stops (reihenfolge-sortiert).
 * Routen mit weniger als 2 Stops werden gefiltert.
 */
export function tagesroutenFC(tagesrouten: TagesRoute[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: tagesrouten
      .map((tr) => {
        const sorted = [...tr.stops].sort((a, b) => a.reihenfolge - b.reihenfolge)
        return { tr, sorted }
      })
      .filter(({ sorted }) => sorted.length >= 2)
      .map(({ tr, sorted }) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: sorted.map((s) => [s.lng, s.lat]),
        },
        properties: {
          __type: 'tagesroute',
          svId: tr.svId,
          svName: tr.svName,
        },
      })),
  }
}

/**
 * Lead-Pins fuer die LiveOps-Karte (offene, lokalisierte Leads).
 * gapIds: optionale Menge von Lead-IDs ohne deckende SV-Isochrone.
 * Abwaertskompatibel — bestehende Aufrufer ohne gapIds erhalten __gap=0.
 */
export function leadsFC(leads: LeadPin[], gapIds?: Set<string>): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: leads.map((lead) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [lead.lng, lead.lat],
      },
      properties: {
        __id: lead.id,
        __type: 'lead',
        status: lead.status,
        name: lead.name,
        ort: lead.ort,
        kanal: lead.kanal,
        erstelltAm: lead.erstelltAm,
        __gap: gapIds?.has(lead.id) ? 1 : 0,
      },
    })),
  }
}

/**
 * Kandidaten-Halos fuer die Assign-from-Map-Interaktion.
 * Nur SVs die in candidateIds enthalten sind UND einen gueltigen Standort haben.
 */
export function candidateHaloFC(svs: SvLiveOps[], candidateIds: string[]): GeoJSON.FeatureCollection {
  const set = new Set(candidateIds)
  return {
    type: 'FeatureCollection',
    features: svs
      .filter((s) => set.has(s.id) && s.standortLat != null && s.standortLng != null)
      .map((s) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [s.standortLng as number, s.standortLat as number],
        },
        properties: {
          __id: s.id,
          __type: 'candidate',
          svId: s.id,
        },
      })),
  }
}

/**
 * Verbindungslinie vom geklickten Lead zum gewaehlten SV-Kandidaten.
 * Gibt 0 Features zurueck wenn from oder to fehlen (null).
 * Koordinaten sind immer [lng, lat].
 */
export function assignLineFC(
  from: [number, number] | null,
  to: [number, number] | null,
): GeoJSON.FeatureCollection {
  if (!from || !to) return { type: 'FeatureCollection', features: [] }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: [from, to],
        },
        properties: {},
      },
    ],
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
