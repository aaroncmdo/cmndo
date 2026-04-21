'use client'

// AAR-690: Karten-Rückbau. Google Maps statt Mapbox-3D. Ein Pin pro SV am
// Büro-Standort, Isochrone-Polygon in derselben Typ-Farbe, Klick →
// Detail-Drawer rechts mit allen Aktionen. Ersetzt den früheren 1100-Z.-
// Hub mit Sidebar/Filter/FreeBusy/Live-Tracking.

import { useEffect, useRef, useState, useTransition, useCallback } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  XIcon, MapPinIcon, PhoneIcon, MailIcon, ExternalLinkIcon,
  RefreshCwIcon, ShieldOffIcon, ShieldCheckIcon, TrashIcon, Loader2Icon,
} from 'lucide-react'
import {
  reactivateGutachter,
  deactivateGutachter,
  softDeleteGutachter,
  deleteGutachter,
  recalculateIsochrone,
  getOpenCasesCount,
} from './actions'

// ─── Types (Shape bleibt kompatibel zur page.tsx-Query) ─────────────────────

export type GeoPolygon = { type: 'Polygon'; coordinates: number[][][] } | null

export type SvMarker = {
  id: string
  name: string
  vorname?: string | null
  nachname?: string | null
  avatarUrl?: string | null
  paket: string | null
  lat: number | null
  lng: number | null
  istAktiv: boolean
  isochrone?: GeoPolygon
  einsatzKm?: number | null
  gutachterTyp?: string | null
  offeneFaelle?: number
  maxFaelleMonat?: number
  ablehnungen30Tage?: number
  portalZugangFreigeschaltet?: boolean | null
  vertragUnterschrieben?: boolean | null
  gesperrtSeit?: string | null
  urlaubVon?: string | null
  urlaubBis?: string | null
  verifiziert?: boolean | null
  saVorlageStatus?: string | null
  bvskNr?: string | null
  ihkNr?: string | null
  oebuvNr?: string | null
  notizen?: string | null
}

export type CommunityMarker = {
  id: string
  name: string
  exklusiv: boolean
  maxFaelle: number | null
  lat: number | null
  lng: number | null
  isochrone?: GeoPolygon
  einsatzKm?: number | null
}

export type OrgMarker = {
  id: string
  name: string
  typ: 'buero' | 'akademie'
  lat: number | null
  lng: number | null
  isochrone?: GeoPolygon
  einsatzKm?: number | null
}

// ─── Typ-Farben (Pin + Isochrone in derselben Farbe pro Gutachter-Typ) ──────

const TYP_COLORS: Record<string, { fill: string; label: string }> = {
  'kfz-gutachter': { fill: '#3b82f6', label: 'KFZ-SV' },
  'dat-gutachter': { fill: '#f97316', label: 'DAT' },
  akademie: { fill: '#22c55e', label: 'Akademie' },
  gutachterbuero: { fill: '#a855f7', label: 'Büro' },
}

function typColor(typ: string | null | undefined): { fill: string; label: string } {
  return TYP_COLORS[typ ?? 'kfz-gutachter'] ?? TYP_COLORS['kfz-gutachter']
}

// ─── Google-Maps-Loader (gleiches Pattern wie IsochronePreviewMap) ──────────

function loadMaps(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof google !== 'undefined' && google.maps) { resolve(); return }
    const existing = document.querySelector('script[src*="maps.googleapis.com"]')
    if (existing) {
      const check = setInterval(() => {
        if (typeof google !== 'undefined' && google.maps) { clearInterval(check); resolve() }
      }, 100)
      return
    }
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`
    s.async = true; s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Maps load failed'))
    document.head.appendChild(s)
  })
}

// Deutschland-Mittelpunkt als Fallback-Center
const GERMANY_CENTER = { lat: 51.1657, lng: 10.4515 }

type Props = {
  svs: SvMarker[]
  communities?: CommunityMarker[]
  organisationen?: OrgMarker[]
}

export default function KarteHubClient({ svs }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map())
  const polygonsRef = useRef<Map<string, google.maps.Polygon>>(new Map())
  const [mapReady, setMapReady] = useState(false)
  const [selectedSv, setSelectedSv] = useState<SvMarker | null>(null)

  // Nur SVs die auf der Karte sichtbar sein sollen:
  //   - freigeschaltet
  //   - nicht gesperrt
  //   - Koordinaten vorhanden
  const visibleSvs = svs.filter(
    (s) =>
      s.portalZugangFreigeschaltet === true &&
      !s.gesperrtSeit &&
      s.lat != null &&
      s.lng != null,
  )

  // ─── Map initialisieren ─────────────────────────────────────────────────

  useEffect(() => {
    if (!apiKey || !containerRef.current || mapRef.current) return
    let cancelled = false
    loadMaps(apiKey).then(() => {
      if (cancelled || !containerRef.current || mapRef.current) return
      mapRef.current = new google.maps.Map(containerRef.current, {
        center: GERMANY_CENTER,
        zoom: 6,
        gestureHandling: 'greedy',
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        styles: [
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        ],
      })
      setMapReady(true)
    }).catch(() => { /* silent — Fallback-Hinweis unten */ })
    return () => { cancelled = true }
  }, [apiKey])

  // ─── Pins + Polygone rendern / aktualisieren ─────────────────────────────

  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const map = mapRef.current

    // Aktuelle Marker/Polygone aus der Map entfernen
    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current.clear()
    polygonsRef.current.forEach((p) => p.setMap(null))
    polygonsRef.current.clear()

    if (visibleSvs.length === 0) return

    const bounds = new google.maps.LatLngBounds()

    for (const sv of visibleSvs) {
      if (sv.lat == null || sv.lng == null) continue
      const color = typColor(sv.gutachterTyp).fill

      // Pin
      const marker = new google.maps.Marker({
        position: { lat: sv.lat, lng: sv.lng },
        map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 3,
        },
        title: sv.name,
      })
      marker.addListener('click', () => setSelectedSv(sv))
      markersRef.current.set(sv.id, marker)

      // Isochrone-Polygon (nur wenn vorhanden + GeoJSON-Format)
      if (sv.isochrone && sv.isochrone.type === 'Polygon' && sv.isochrone.coordinates?.[0]) {
        const ring = sv.isochrone.coordinates[0].map(([lng, lat]) => ({ lat, lng }))
        const polygon = new google.maps.Polygon({
          paths: ring,
          strokeColor: color,
          strokeOpacity: 0.8,
          strokeWeight: 1.5,
          fillColor: color,
          fillOpacity: 0.12,
          map,
          clickable: false,
        })
        polygonsRef.current.set(sv.id, polygon)
        for (const p of ring) bounds.extend(p)
      } else {
        bounds.extend({ lat: sv.lat, lng: sv.lng })
      }
    }

    // Map auf alle Pins zentrieren
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 40)
    }
  }, [visibleSvs, mapReady])

  // ─── Early-Returns ───────────────────────────────────────────────────────

  if (!apiKey) {
    return (
      <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl m-4 text-sm text-amber-800">
        <strong>Karte nicht verfügbar:</strong> <code>NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> fehlt in den Env-Variablen.
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-xl overflow-hidden border border-gray-200 relative">
      {/* Header-Bar mit Legende + Anlegen-Button */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-[#f8f9fb]/60 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-900">Sachverständige</h2>
          <span className="text-xs text-gray-500">
            {visibleSvs.length} von {svs.length} aktiv
          </span>
        </div>
        <div className="flex items-center gap-4">
          {/* Typ-Legende */}
          <div className="hidden md:flex items-center gap-3 text-[11px] text-gray-600">
            {Object.entries(TYP_COLORS).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: v.fill }}
                />
                {v.label}
              </div>
            ))}
          </div>
          <Link
            href="/admin/sachverstaendige/anlegen"
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#4573A2] text-white hover:bg-[#0D1B3E]"
          >
            + Neuer SV
          </Link>
        </div>
      </div>

      {/* Map */}
      <div ref={containerRef} className="flex-1 min-h-0" />

      {/* Detail-Drawer rechts */}
      {selectedSv && (
        <SvDetailDrawer
          sv={selectedSv}
          onClose={() => setSelectedSv(null)}
        />
      )}
    </div>
  )
}

// ─── Detail-Drawer ─────────────────────────────────────────────────────────

function SvDetailDrawer({ sv, onClose }: { sv: SvMarker; onClose: () => void }) {
  const color = typColor(sv.gutachterTyp)
  const [pending, startTransition] = useTransition()
  const [openCases, setOpenCases] = useState<number | null>(null)

  useEffect(() => {
    getOpenCasesCount(sv.id).then(setOpenCases).catch(() => setOpenCases(null))
  }, [sv.id])

  // ESC schließt den Drawer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleRecalcIso = useCallback(() => {
    startTransition(async () => {
      const r = await recalculateIsochrone('sv', sv.id)
      if (r.success) {
        toast.success('Isochrone neu berechnet — Seite lädt neu')
        setTimeout(() => window.location.reload(), 500)
      } else {
        toast.error(r.error ?? 'Berechnung fehlgeschlagen')
      }
    })
  }, [sv.id])

  const handleDeactivate = useCallback(() => {
    const grund = window.prompt('Sperr-Grund:')
    if (!grund) return
    startTransition(async () => {
      try {
        await deactivateGutachter(sv.id, grund)
        toast.success('Gesperrt')
        window.location.reload()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Sperren fehlgeschlagen')
      }
    })
  }, [sv.id])

  const handleReactivate = useCallback(() => {
    startTransition(async () => {
      try {
        await reactivateGutachter(sv.id)
        toast.success('Entsperrt')
        window.location.reload()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Entsperren fehlgeschlagen')
      }
    })
  }, [sv.id])

  const handleSoftDelete = useCallback(() => {
    if (!window.confirm(`${sv.name} archivieren (Soft-Delete)?`)) return
    startTransition(async () => {
      try {
        await softDeleteGutachter(sv.id)
        toast.success('Archiviert')
        window.location.reload()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Archivieren fehlgeschlagen')
      }
    })
  }, [sv.id, sv.name])

  const handleHardDelete = useCallback(() => {
    if (!window.confirm(`${sv.name} endgültig löschen? Nicht umkehrbar.`)) return
    startTransition(async () => {
      const r = await deleteGutachter(sv.id)
      if (r.success) {
        toast.success('Gelöscht')
        window.location.reload()
      } else {
        toast.error(r.error ?? 'Löschen fehlgeschlagen')
      }
    })
  }, [sv.id, sv.name])

  const isGesperrt = !!sv.gesperrtSeit
  const einsatzKm = sv.einsatzKm ?? null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
        aria-hidden
      />
      {/* Drawer */}
      <aside
        role="dialog"
        aria-label={`Details zu ${sv.name}`}
        className="fixed right-0 top-0 h-screen w-full sm:w-[420px] bg-white shadow-2xl z-50 flex flex-col animate-[slideIn_180ms_ease-out]"
        style={{ animation: 'slideIn 180ms ease-out' }}
      >
        {/* Header mit Typ-Farbe */}
        <div
          className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3"
          style={{ borderTopColor: color.fill, borderTopWidth: 4 }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: color.fill }}
              />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                {color.label}
              </span>
              {sv.paket && (
                <span className="text-[10px] text-gray-400">· Paket {sv.paket}</span>
              )}
            </div>
            <h3 className="text-lg font-bold text-gray-900 truncate mt-0.5">{sv.name}</h3>
            {einsatzKm && (
              <p className="text-[11px] text-gray-500 mt-0.5">
                Einsatzgebiet {einsatzKm} km
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
            aria-label="Schließen"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body scrollbar */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Status-Grid */}
          <section>
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Status
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <StatusPill
                label="Portal freigeschaltet"
                on={sv.portalZugangFreigeschaltet === true}
              />
              <StatusPill
                label="Vertrag unterschrieben"
                on={sv.vertragUnterschrieben === true}
              />
              <StatusPill
                label="Verifiziert"
                on={sv.verifiziert === true}
              />
              <StatusPill
                label={isGesperrt ? 'Gesperrt' : 'Aktiv'}
                on={!isGesperrt}
                danger={isGesperrt}
              />
            </div>
            {sv.urlaubVon && sv.urlaubBis && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2">
                Urlaub {new Date(sv.urlaubVon).toLocaleDateString('de-DE')} –{' '}
                {new Date(sv.urlaubBis).toLocaleDateString('de-DE')}
              </p>
            )}
          </section>

          {/* Kontingent */}
          {(sv.maxFaelleMonat ?? 0) > 0 && (
            <section>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Fallkontingent
              </h4>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900">
                  {sv.offeneFaelle ?? 0}
                </span>
                <span className="text-gray-400">/</span>
                <span className="text-gray-600">{sv.maxFaelleMonat} im Monat</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                {openCases != null ? `${openCases} offene Fälle` : ''}
                {(sv.ablehnungen30Tage ?? 0) > 0 && (
                  <span className="ml-2 text-red-600">
                    · {sv.ablehnungen30Tage} Ablehnungen (30 T.)
                  </span>
                )}
              </p>
            </section>
          )}

          {/* Qualifikationen */}
          {(sv.bvskNr || sv.ihkNr || sv.oebuvNr) && (
            <section>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Qualifikationen
              </h4>
              <div className="space-y-1 text-xs text-gray-700">
                {sv.bvskNr && <div>BVSK: <span className="font-mono">{sv.bvskNr}</span></div>}
                {sv.ihkNr && <div>IHK: <span className="font-mono">{sv.ihkNr}</span></div>}
                {sv.oebuvNr && <div>öbuv: <span className="font-mono">{sv.oebuvNr}</span></div>}
              </div>
            </section>
          )}

          {/* Notizen */}
          {sv.notizen && (
            <section>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Notizen
              </h4>
              <p className="text-xs text-gray-700 whitespace-pre-wrap">{sv.notizen}</p>
            </section>
          )}

          {/* Aktionen */}
          <section>
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Aktionen
            </h4>
            <div className="grid grid-cols-1 gap-2">
              <Link
                href={`/admin/sachverstaendige/${sv.id}`}
                className="flex items-center justify-between text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700"
              >
                <span className="flex items-center gap-2">
                  <ExternalLinkIcon className="w-3.5 h-3.5" /> Profil öffnen
                </span>
              </Link>

              <button
                type="button"
                onClick={handleRecalcIso}
                disabled={pending}
                className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 disabled:opacity-50"
              >
                {pending ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <RefreshCwIcon className="w-3.5 h-3.5" />}
                Isochrone neu berechnen
              </button>

              {isGesperrt ? (
                <button
                  type="button"
                  onClick={handleReactivate}
                  disabled={pending}
                  className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 disabled:opacity-50"
                >
                  <ShieldCheckIcon className="w-3.5 h-3.5" /> Entsperren
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDeactivate}
                  disabled={pending}
                  className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 disabled:opacity-50"
                >
                  <ShieldOffIcon className="w-3.5 h-3.5" /> Sperren
                </button>
              )}

              <button
                type="button"
                onClick={handleSoftDelete}
                disabled={pending}
                className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 disabled:opacity-50"
              >
                <TrashIcon className="w-3.5 h-3.5" /> Archivieren (Soft-Delete)
              </button>

              <button
                type="button"
                onClick={handleHardDelete}
                disabled={pending}
                className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 disabled:opacity-50"
              >
                <TrashIcon className="w-3.5 h-3.5" /> Endgültig löschen
              </button>
            </div>
          </section>
        </div>
      </aside>

      <style jsx>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  )
}

// ─── UI-Helper ─────────────────────────────────────────────────────────────

function StatusPill({ label, on, danger }: { label: string; on: boolean; danger?: boolean }) {
  return (
    <div
      className={`px-2 py-1.5 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 ${
        danger
          ? 'bg-red-50 border-red-200 text-red-700'
          : on
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-gray-50 border-gray-200 text-gray-500'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          danger ? 'bg-red-500' : on ? 'bg-emerald-500' : 'bg-gray-400'
        }`}
      />
      {label}
    </div>
  )
}
