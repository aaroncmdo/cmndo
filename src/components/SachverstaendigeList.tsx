'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { SearchIcon, HardHatIcon, MapPinIcon } from 'lucide-react'
import { getSvStatus } from '@/lib/sv-status'
import { KundeAvatar } from '@/components/shared/KundeAvatar'
import { StatusBadge } from '@/components/shared/StatusBadge'

// AAR-54: Tabellen-Ansicht für Sachverständige (statt Karte).
// AAR-151: Aus src/app/admin/sachverstaendige/ verschoben in src/components/,
// weil /admin/sachverstaendige jetzt direkt die Karte rendert. Das Dispatch-
// Portal (/dispatch/sachverstaendige) nutzt die Liste weiterhin als Read-Only-
// Sicht — shared Component statt cross-route-Import.

type SV = {
  id: string
  name: string
  email: string
  telefon: string
  gebietPlz: string[]
  paket: string
  offeneFaelle: number
  maxFaelleMonat: number
  standortLat: number | null
  standortLng: number | null
  standortAdresse: string | null
  gutachterTyp: string
  istAktiv: boolean
  deaktiviertGrund: string | null
  deaktiviertAm: string | null
  portalZugangFreigeschaltet: boolean | null
  vertragUnterschrieben: boolean | null
  gesperrtSeit: string | null
  ablehnungen30Tage: number
  anzahlungStatus: string
}

const TYP_BADGE: Record<string, { label: string; cls: string }> = {
  'kfz-gutachter': { label: 'KFZ-SV', cls: 'bg-claimondo-bg text-claimondo-ondo' },
  'dat-gutachter': { label: 'DAT', cls: 'bg-orange-50 text-orange-700' },
  akademie: { label: 'Akademie', cls: 'bg-green-50 text-green-700' },
  gutachterbuero: { label: 'Büro', cls: 'bg-purple-50 text-purple-700' },
}

const PAKET_BADGE: Record<string, string> = {
  'starter-10': 'Standard', standard: 'Standard',
  'standard-25': 'Pro', pro: 'Pro',
  'premium-50': 'Premium', premium: 'Premium',
}

// AAR-112: basePath erlaubt Wiederverwendung unter /dispatch/sachverstaendige
export default function SachverstaendigeList({
  sachverstaendige,
  basePath = '/admin',
}: {
  sachverstaendige: SV[]
  basePath?: string
}) {
  const [svFilter, setSvFilter] = useState<'aktive' | 'deaktivierte' | 'gesperrt' | 'alle'>('aktive')
  const [search, setSearch] = useState('')
  const [density] = useDensityPreference('sv-liste')
  const compact = density === 'compact'
  const cellPad = compact ? 'px-3 py-1.5' : 'px-4 py-3'

  const filtered = useMemo(() => {
    return sachverstaendige.filter(sv => {
      const istGesperrt = !!sv.gesperrtSeit
      const istDeaktiviert = sv.istAktiv === false
      // AAR-53: Aktiv = nicht gesperrt UND nicht deaktiviert (portal_zugang spielt keine Rolle)
      if (svFilter === 'gesperrt' && !istGesperrt) return false
      if (svFilter === 'aktive' && (istGesperrt || istDeaktiviert)) return false
      if (svFilter === 'deaktivierte' && (istGesperrt || !istDeaktiviert)) return false

      if (search) {
        const q = search.toLowerCase()
        if (!sv.name.toLowerCase().includes(q) &&
            !(sv.email ?? '').toLowerCase().includes(q) &&
            !(sv.standortAdresse ?? '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [sachverstaendige, svFilter, search])

  const tabs: { k: typeof svFilter; label: string; count: number }[] = [
    { k: 'aktive', label: 'Aktiv', count: sachverstaendige.filter(s => !s.gesperrtSeit && s.istAktiv !== false).length },
    { k: 'deaktivierte', label: 'Deaktiviert', count: sachverstaendige.filter(s => !s.gesperrtSeit && s.istAktiv === false).length },
    { k: 'gesperrt', label: 'Gesperrt', count: sachverstaendige.filter(s => !!s.gesperrtSeit).length },
    { k: 'alle', label: 'Alle', count: sachverstaendige.length },
  ]

  return (
    <div className="h-full flex flex-col bg-claimondo-bg">
      {/* Header */}
      <div className="px-4 py-3 border-b border-claimondo-border bg-white flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <HardHatIcon className="w-4 h-4 text-claimondo-ondo" />
          <h1 className="text-sm font-semibold text-claimondo-navy">Sachverständige</h1>
          <span className="text-xs text-claimondo-ondo/70">({filtered.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-claimondo-ondo/70" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Suche..."
              className="pl-7 pr-2 py-1.5 text-xs bg-claimondo-bg border border-claimondo-border rounded-lg w-48 focus:outline-none focus:ring-1 focus:ring-claimondo-ondo"
            />
          </div>
          {/* AAR-151: „Karte öffnen" zeigt für Admin auf den Hub (dort IST die Karte),
              für Dispatch auf die Isochrone-Ansicht (die Karte mit Lead-Auswahl). */}
          <Link
            href={basePath === '/admin' ? '/admin/sachverstaendige' : '/dispatch/isochrone'}
            className="text-xs text-claimondo-ondo hover:underline"
          >
            Karte öffnen →
          </Link>
          <DensityToggle listKey="sv-liste" />
        </div>
      </div>

      {/* Filter-Tabs */}
      <div className="px-4 py-2 border-b border-claimondo-border bg-white flex gap-1 flex-shrink-0">
        {tabs.map(t => (
          <Chip
            key={t.k}
            variant={svFilter === t.k ? 'selected' : 'ghost'}
            count={t.count}
            onClick={() => setSvFilter(t.k)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              svFilter === t.k ? 'bg-claimondo-bg text-claimondo-navy' : 'text-claimondo-ondo hover:text-claimondo-navy'
            }`}
          >
            {t.label} <span className="text-claimondo-ondo/70 ml-1">{t.count}</span>
          </Chip>
        ))}
      </div>

      {/* Tabelle (Desktop ab lg) — Mobile/Tablet rendern Card-Liste, Portal-Review D3 */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-claimondo-bg border-b border-claimondo-border sticky top-0">
            <tr className="text-left text-[10px] uppercase tracking-wider text-claimondo-ondo">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Typ</th>
              <th className="px-4 py-2.5 font-medium">Standort</th>
              <th className="px-4 py-2.5 font-medium">Paket</th>
              <th className="px-4 py-2.5 font-medium">Auslastung</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-claimondo-border bg-white">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-claimondo-ondo/70">Keine Sachverständige</td></tr>
            ) : filtered.map(sv => {
              const status = getSvStatus({
                portal_zugang_freigeschaltet: sv.portalZugangFreigeschaltet,
                vertrag_unterschrieben: sv.vertragUnterschrieben,
                gesperrt_seit: sv.gesperrtSeit,
              })
              const typ = TYP_BADGE[sv.gutachterTyp] ?? { label: sv.gutachterTyp, cls: 'bg-claimondo-bg text-claimondo-ondo' }
              const paket = PAKET_BADGE[sv.paket] ?? sv.paket
              const stadt = sv.standortAdresse ? sv.standortAdresse.split(',').slice(-2, -1)[0]?.trim() || sv.standortAdresse : '—'

              return (
                <tr key={sv.id} className="hover:bg-[#f0f4f8] transition-colors">
                  <td className={cellPad}>
                    <div className="flex items-center gap-2">
                      <KundeAvatar name={sv.name} size={28} tone="ondo-subtle" />
                      <div>
                        <p className="text-sm font-medium text-claimondo-navy">{sv.name}</p>
                        {sv.email && <p className="text-[10px] text-claimondo-ondo/70">{sv.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge colorCls={typ.cls}>{typ.label}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-xs text-claimondo-ondo">
                    <span className="flex items-center gap-1">
                      <MapPinIcon className="w-3 h-3 text-claimondo-ondo/70" />
                      {stadt}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-claimondo-navy font-medium">{paket}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className={sv.offeneFaelle >= sv.maxFaelleMonat ? 'text-red-600 font-semibold' : 'text-claimondo-navy'}>
                      {sv.offeneFaelle}/{sv.maxFaelleMonat}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge colorCls={`${status.bg} ${status.text}`}>{status.label}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`${basePath}/sachverstaendige/${sv.id}`} className="text-claimondo-ondo hover:underline text-xs">→</Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Mobile/Tablet-Card-Liste (<lg) — drei Felder primary (Name, Standort, Status), Tap = Detail */}
        <div className="lg:hidden divide-y divide-claimondo-border bg-white">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-claimondo-ondo/70">Keine Sachverständige</p>
          ) : filtered.map(sv => {
            const status = getSvStatus({
              portal_zugang_freigeschaltet: sv.portalZugangFreigeschaltet,
              vertrag_unterschrieben: sv.vertragUnterschrieben,
              gesperrt_seit: sv.gesperrtSeit,
            })
            const typ = TYP_BADGE[sv.gutachterTyp] ?? { label: sv.gutachterTyp, cls: 'bg-claimondo-bg text-claimondo-ondo' }
            const paket = PAKET_BADGE[sv.paket] ?? sv.paket
            const stadt = sv.standortAdresse ? sv.standortAdresse.split(',').slice(-2, -1)[0]?.trim() || sv.standortAdresse : '—'
            const auslastungTone = sv.offeneFaelle >= sv.maxFaelleMonat ? 'text-red-600 font-semibold' : 'text-claimondo-ondo'
            return (
              <Link
                key={sv.id}
                href={`${basePath}/sachverstaendige/${sv.id}`}
                className="flex items-start gap-3 px-4 py-3 hover:bg-claimondo-bg active:bg-claimondo-ondo/5 transition-colors"
              >
                <KundeAvatar name={sv.name} size={36} tone="ondo-subtle" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-claimondo-navy truncate">{sv.name}</p>
                    <StatusBadge colorCls={`${status.bg} ${status.text}`}>{status.label}</StatusBadge>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-claimondo-ondo">
                    <span className="inline-flex items-center gap-1">
                      <MapPinIcon className="w-3 h-3 text-claimondo-ondo/70" />
                      {stadt}
                    </span>
                    <span className="text-claimondo-ondo/40">·</span>
                    <span className="font-medium text-claimondo-navy">{paket}</span>
                    <span className="text-claimondo-ondo/40">·</span>
                    <span className={auslastungTone}>{sv.offeneFaelle}/{sv.maxFaelleMonat}</span>
                  </div>
                  <StatusBadge colorCls={typ.cls}>{typ.label}</StatusBadge>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
