'use client'

// AAR-112: Isochrone-Client — Lead-Auswahl + SV-Vorschlagsliste via findBestSV
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { SearchIcon, TargetIcon, MapPinIcon, ArrowRightIcon, RefreshCwIcon } from 'lucide-react'
import { listSvSuggestionsForLead, type SvSuggestion } from '../leads/[id]/actions'

type LeadOption = {
  id: string
  name: string
  plz: string | null
  lat: number | null
  lng: number | null
  schadentyp: string | null
  phase: string
}

export default function IsochroneClient({ leads }: { leads: LeadOption[] }) {
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(null)
  const [suggestions, setSuggestions] = useState<SvSuggestion[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filtered = search.trim()
    ? leads.filter((l) =>
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        (l.plz ?? '').includes(search.trim()) ||
        (l.schadentyp ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : leads

  function pickLead(lead: LeadOption) {
    setSelectedLead(lead)
    setSuggestions(null)
    setError(null)
    startTransition(async () => {
      const r = await listSvSuggestionsForLead(lead.id)
      if (!r.success) {
        setError(r.error ?? 'Fehler')
        setSuggestions([])
        return
      }
      setSuggestions(r.suggestions ?? [])
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Leads-Liste */}
      <div className="bg-white rounded-xl border border-gray-200 lg:col-span-1">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Lead suchen (Name, PLZ, Schadentyp)"
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#4573A2]"
            />
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">{filtered.length} / {leads.length} Leads mit Koordinaten</p>
        </div>
        <div className="divide-y divide-gray-50 max-h-[620px] overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-xs text-gray-400 text-center">Keine Leads gefunden</p>
          )}
          {filtered.map((l) => {
            const sel = selectedLead?.id === l.id
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => pickLead(l)}
                className={`w-full text-left px-4 py-3 transition-colors ${
                  sel ? 'bg-[#4573A2]/10 border-l-2 border-[#4573A2]' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">{l.name}</span>
                  <span className="text-[9px] text-gray-400 uppercase">{l.phase}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
                  <MapPinIcon className="w-3 h-3" />
                  <span>{l.plz ?? '—'}</span>
                  {l.schadentyp && (
                    <>
                      <span>·</span>
                      <span className="capitalize">{l.schadentyp}</span>
                    </>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* SV-Vorschlaege */}
      <div className="lg:col-span-2 space-y-4">
        {!selectedLead ? (
          <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
            <TargetIcon className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Wähle einen Lead links um die SV-Vorschläge zu laden.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-400 uppercase">Lead</p>
                <h2 className="text-sm font-semibold text-gray-900">{selectedLead.name}</h2>
                <p className="text-[10px] text-gray-500">
                  {selectedLead.plz ?? '—'} · {selectedLead.lat?.toFixed(3)}, {selectedLead.lng?.toFixed(3)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => pickLead(selectedLead)}
                  className="text-[11px] text-[#4573A2] hover:text-[#3a6290] flex items-center gap-1"
                >
                  <RefreshCwIcon className="w-3 h-3" /> neu laden
                </button>
                <Link
                  href={`/dispatch/leads/${selectedLead.id}`}
                  className="text-[11px] bg-[#0D1B3E] text-white px-3 py-1.5 rounded-lg hover:bg-[#1E3A5F] flex items-center gap-1"
                >
                  Reservieren im Lead <ArrowRightIcon className="w-3 h-3" />
                </Link>
              </div>
            </div>

            <div className="divide-y divide-gray-50">
              {pending && (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 border-2 border-gray-300 border-t-[#4573A2] rounded-full animate-spin" />
                </div>
              )}

              {!pending && error && (
                <p className="px-5 py-6 text-xs text-red-700 bg-red-50">{error}</p>
              )}

              {!pending && suggestions && suggestions.length === 0 && !error && (
                <p className="px-5 py-6 text-xs text-amber-800 bg-amber-50">
                  Keine SVs in Reichweite. Prüfe Kontingent, Urlaubs-Status oder Isochrone-Polygone der SVs.
                </p>
              )}

              {!pending && suggestions && suggestions.length > 0 && (
                <>
                  <div className="px-5 py-2 bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 grid grid-cols-[2fr_1fr_1fr_1fr_1fr_2fr] gap-3">
                    <span>Name</span>
                    <span>Paket</span>
                    <span>Distanz</span>
                    <span>Score</span>
                    <span>Frei</span>
                    <span>Gründe</span>
                  </div>
                  {suggestions.map((s) => (
                    <div key={s.svId} className="px-5 py-3 grid grid-cols-[2fr_1fr_1fr_1fr_1fr_2fr] gap-3 items-center text-sm hover:bg-gray-50">
                      <Link href={`/dispatch/sachverstaendige/${s.svId}`} className="text-[#4573A2] hover:underline font-medium truncate">
                        {s.name}
                      </Link>
                      <span className="text-xs text-gray-600">{s.paket}</span>
                      <span className="text-xs tabular-nums">{s.distanzKm.toFixed(1)} km</span>
                      <span className="text-xs tabular-nums font-semibold">{s.score.toFixed(1)}</span>
                      <span className={`text-xs tabular-nums ${s.kontingentFrei <= 2 ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
                        {s.kontingentFrei}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {(s.reasons ?? []).slice(0, 3).map((r, i) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{r}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
