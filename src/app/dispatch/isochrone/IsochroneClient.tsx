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
      <div className="bg-white rounded-xl border border-claimondo-border lg:col-span-1">
        <div className="px-4 py-3 border-b border-claimondo-border">
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-claimondo-ondo/70" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Lead suchen (Name, PLZ, Schadentyp)"
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-[#f8f9fb] border border-claimondo-border rounded-lg focus:outline-none focus:ring-1 focus:ring-claimondo-ondo"
            />
          </div>
          <p className="text-[10px] text-claimondo-ondo/70 mt-1.5">{filtered.length} / {leads.length} Leads mit Koordinaten</p>
        </div>
        <div className="divide-y divide-claimondo-border max-h-[620px] overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-xs text-claimondo-ondo/70 text-center">Keine Leads gefunden</p>
          )}
          {filtered.map((l) => {
            const sel = selectedLead?.id === l.id
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => pickLead(l)}
                className={`w-full text-left px-4 py-3 transition-colors ${
                  sel ? 'bg-claimondo-ondo/10 border-l-2 border-claimondo-ondo' : 'hover:bg-[#f8f9fb]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-claimondo-navy">{l.name}</span>
                  <span className="text-[9px] text-claimondo-ondo/70 uppercase">{l.phase}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-claimondo-ondo">
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
          <div className="bg-[#f8f9fb] rounded-xl border-2 border-dashed border-claimondo-border p-12 text-center">
            <TargetIcon className="w-10 h-10 text-claimondo-ondo/50 mx-auto mb-2" />
            <p className="text-sm text-claimondo-ondo">Wähle einen Lead links um die SV-Vorschläge zu laden.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-claimondo-border">
            <div className="px-5 py-3 border-b border-claimondo-border flex items-center justify-between">
              <div>
                <p className="text-[10px] text-claimondo-ondo/70 uppercase">Lead</p>
                <h2 className="text-sm font-semibold text-claimondo-navy">{selectedLead.name}</h2>
                <p className="text-[10px] text-claimondo-ondo">
                  {selectedLead.plz ?? '—'} · {selectedLead.lat?.toFixed(3)}, {selectedLead.lng?.toFixed(3)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => pickLead(selectedLead)}
                  className="text-[11px] text-claimondo-ondo hover:text-[#3a6290] flex items-center gap-1"
                >
                  <RefreshCwIcon className="w-3 h-3" /> neu laden
                </button>
                <Link
                  href={`/dispatch/leads/${selectedLead.id}`}
                  className="text-[11px] bg-claimondo-navy text-white px-3 py-1.5 rounded-lg hover:bg-claimondo-shield flex items-center gap-1"
                >
                  Reservieren im Lead <ArrowRightIcon className="w-3 h-3" />
                </Link>
              </div>
            </div>

            <div className="divide-y divide-claimondo-border">
              {pending && (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 border-2 border-claimondo-border border-t-claimondo-ondo rounded-full animate-spin" />
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
                  <div className="px-5 py-2 bg-[#f8f9fb] text-[10px] uppercase tracking-wider text-claimondo-ondo grid grid-cols-[2fr_1fr_1fr_1fr_1fr_2fr] gap-3">
                    <span>Name</span>
                    <span>Paket</span>
                    <span>Distanz</span>
                    <span>Score</span>
                    <span>Frei</span>
                    <span>Gründe</span>
                  </div>
                  {suggestions.map((s) => (
                    <div key={s.svId} className="px-5 py-3 grid grid-cols-[2fr_1fr_1fr_1fr_1fr_2fr] gap-3 items-center text-sm hover:bg-[#f8f9fb]">
                      <Link href={`/dispatch/sachverstaendige/${s.svId}`} className="text-claimondo-ondo hover:underline font-medium truncate">
                        {s.name}
                      </Link>
                      <span className="text-xs text-claimondo-ondo">{s.paket}</span>
                      <span className="text-xs tabular-nums">{s.distanzKm.toFixed(1)} km</span>
                      <span className="text-xs tabular-nums font-semibold">{s.score.toFixed(1)}</span>
                      <span className={`text-xs tabular-nums ${s.kontingentFrei <= 2 ? 'text-red-600 font-semibold' : 'text-claimondo-navy'}`}>
                        {s.kontingentFrei}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {(s.reasons ?? []).slice(0, 3).map((r, i) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-[#f8f9fb] text-claimondo-ondo">{r}</span>
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
