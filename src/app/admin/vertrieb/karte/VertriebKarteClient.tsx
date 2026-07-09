// Token-Audit-Skip: Mapbox-GL erwartet raw hex fuer paint properties.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ensureMapboxInitialized, mapboxgl } from '@/lib/mapbox/client'
import { MAPBOX_STYLE_STANDARD } from '@/lib/mapbox/styles'
import type { Map as MapboxMap, MapMouseEvent, MapboxGeoJSONFeature } from 'mapbox-gl'
import ErrorState from '@/components/shared/ErrorState'
import { Card } from '@/components/primitives'
import type { VertriebKontakt, VertriebKind } from '@/lib/vertrieb/vertrieb-kontakt.types'

// ------------------------------------------------------------------ Konstanten

const SRC_KONTAKTE = 'vk-kontakte'
const LAYER_KONTAKTE = 'vk-kontakte-circle'

/** Farben je Kind (raw hex ok — Token-Audit-Skip-Header oben; Mapbox-Paint-Property). */
const KIND_COLORS: Record<VertriebKind, string> = {
  sv: '#0D1B3E',           // claimondo-navy — aktive Sachverstaendige
  makler: '#4573A2',       // claimondo-secondary
  werkstatt: '#7BA3CC',    // claimondo-accent
  'partner-lead': '#f59e0b', // Amber — Partner-Lead noch nicht konvertiert
  'sv-lead': '#10b981',    // Emerald — SV-Lead noch nicht verifiziert
}

/** Deutsche Labels je Kind. */
const KIND_LABELS: Record<VertriebKind, string> = {
  sv: 'Sachverständige',
  makler: 'Makler',
  werkstatt: 'Werkstätten',
  'partner-lead': 'Partner-Leads',
  'sv-lead': 'SV-Leads',
}

// Match-Expression fuer circle-color (raw hex ok — Token-Audit-Skip-Header oben)
const KIND_COLOR_EXPR = [
  'match',
  ['get', 'kind'],
  'sv', KIND_COLORS.sv,
  'makler', KIND_COLORS.makler,
  'werkstatt', KIND_COLORS.werkstatt,
  'partner-lead', KIND_COLORS['partner-lead'],
  'sv-lead', KIND_COLORS['sv-lead'],
  /* default */ '#94a3b8',
] as unknown as mapboxgl.Expression

// ------------------------------------------------------------------ Props

export interface VertriebKarteClientProps {
  kontakte: VertriebKontakt[]
}

// ------------------------------------------------------------------ Hilfsfunktionen

function buildFeatureCollection(
  kontakte: VertriebKontakt[],
): GeoJSON.FeatureCollection<GeoJSON.Point, { kind: VertriebKind; name: string }> {
  const features: GeoJSON.Feature<GeoJSON.Point, { kind: VertriebKind; name: string }>[] = []
  for (const k of kontakte) {
    if (k.lat == null || k.lng == null) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [k.lng, k.lat] },
      properties: { kind: k.kind, name: k.name ?? '(unbekannt)' },
    })
  }
  return { type: 'FeatureCollection', features }
}

// ------------------------------------------------------------------ Komponente

export default function VertriebKarteClient({ kontakte }: VertriebKarteClientProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const mountedRef = useRef(false)

  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  // Geplottete Kontakte (nur die mit Koordinaten) — fuer Legende
  const plotted = useMemo(
    () => kontakte.filter((k) => k.lat != null && k.lng != null),
    [kontakte],
  )

  // Anzahl je Kind (nur geplottete)
  const countByKind = useMemo(() => {
    const counts = new Map<VertriebKind, number>()
    for (const k of plotted) {
      counts.set(k.kind, (counts.get(k.kind) ?? 0) + 1)
    }
    return counts
  }, [plotted])

  const ohneStandort = kontakte.length - plotted.length

  // ---- Map-Init

  useEffect(() => {
    if (!containerRef.current) return
    mountedRef.current = true

    const ok = ensureMapboxInitialized()
    if (!ok) {
      setError('kein Token')
      return
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE_STANDARD,
      center: [10.4, 51.2],
      zoom: 5.2,
      attributionControl: false,
    })

    map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: false }),
      'top-right',
    )

    map.on('load', () => {
      if (!mountedRef.current) return

      const fc = buildFeatureCollection(kontakte)

      map.addSource(SRC_KONTAKTE, {
        type: 'geojson',
        data: fc,
      })

      map.addLayer({
        id: LAYER_KONTAKTE,
        type: 'circle',
        source: SRC_KONTAKTE,
        paint: {
          'circle-color': KIND_COLOR_EXPR,
          'circle-radius': 6,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      } as Parameters<typeof map.addLayer>[0])

      // Klick → Popup mit Name + Art
      map.on(
        'click',
        LAYER_KONTAKTE,
        (e: MapMouseEvent & { features?: MapboxGeoJSONFeature[] }) => {
          const feature = e.features?.[0]
          if (!feature) return
          const { name, kind } = feature.properties as { name: string; kind: VertriebKind }
          const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number]
          const label = KIND_LABELS[kind] ?? kind

          // Popup-Inhalt als einfaches HTML (kein React-Root noetig fuer diesen simplen Fall)
          const html = `<div style="font-family:inherit;padding:2px 0"><strong style="color:#0D1B3E">${name}</strong><br/><span style="color:#64748b;font-size:12px">${label}</span></div>`

          new mapboxgl.Popup({ offset: 10, closeButton: true })
            .setLngLat(coords)
            .setHTML(html)
            .addTo(map)
        },
      )

      // Cursor: pointer beim Hover
      map.on('mouseenter', LAYER_KONTAKTE, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', LAYER_KONTAKTE, () => {
        map.getCanvas().style.cursor = ''
      })
    })

    map.on('error', (e) => {
      console.error('[VertriebKarteClient] Mapbox-Fehler', e)
      if (mountedRef.current) {
        setError('Kartenfehler: ' + (e.error?.message ?? 'unbekannt'))
      }
    })

    mapRef.current = map

    return () => {
      mountedRef.current = false
      map.remove()
      mapRef.current = null
    }
    // retryKey steuert Re-Mount bei Retry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey])

  // ---- Fehler-Zustand

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-claimondo-bg">
        <ErrorState
          title="Karte konnte nicht geladen werden"
          description={
            error === 'kein Token'
              ? 'Mapbox-Token fehlt — bitte NEXT_PUBLIC_MAPBOX_TOKEN setzen.'
              : 'Ein Fehler ist aufgetreten. Bitte erneut versuchen.'
          }
          retry={() => { setError(null); setRetryKey((k) => k + 1) }}
          retryLabel="Erneut versuchen"
          className="max-w-sm"
        />
      </div>
    )
  }

  // ---- Render

  // Reihenfolge fuer die Legende (feste Reihenfolge statt Map-Iteration)
  const legendKinds: VertriebKind[] = ['sv', 'makler', 'werkstatt', 'partner-lead', 'sv-lead']

  return (
    <div className="relative h-full w-full">
      {/* Mapbox-Container — inline style statt Tailwind-inset (verhindert Klassen-Konflikt mit Mapbox) */}
      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0 }}
        aria-label="Vertrieb-Kontakte-Karte"
      />

      {/* Legende — primitives.Card (Schwebe-Panel über der Karte) */}
      <Card radius="md" shadow="lg" p={3} className="absolute left-3 bottom-3 z-10 text-body-xs">
        {legendKinds.map((kind) => {
          const count = countByKind.get(kind) ?? 0
          if (count === 0) return null
          return (
            <div key={kind} className="flex items-center gap-2 mb-1 last:mb-0">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: KIND_COLORS[kind] }}
              />
              <span className="text-claimondo-navy">
                {KIND_LABELS[kind]}
              </span>
              <span className="ml-auto pl-3 text-claimondo-navy font-medium tabular-nums">
                {count}
              </span>
            </div>
          )
        })}

        {ohneStandort > 0 && (
          <p className="mt-2 text-claimondo-ondo/60 border-t border-claimondo-border pt-1.5">
            {ohneStandort} ohne Standort
          </p>
        )}
      </Card>
    </div>
  )
}
