'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { confirmGutachterTermin } from './actions'
import {
  CalendarIcon,
  MapPinIcon,
  SearchIcon,
  UserCheckIcon,
  ClockIcon,
  CheckCircle2Icon,
} from 'lucide-react'

type GutachterSlot = {
  sv_id: string
  name: string
  entfernung_km: number | null
  auslastung: string
  offene_faelle: number
  max_faelle_monat: number
  paket: string | null
  termin: string
  wunschtermin_moeglich: boolean
}

type MatchResult = {
  empfohlen: GutachterSlot | null
  alternative_1: GutachterSlot | null
  alternative_2: GutachterSlot | null
}

export default function GutachterTermin({
  lead,
}: {
  lead: {
    id: string
    vorname: string | null
    nachname: string | null
    telefon: string | null
    schadenfall_typ: string | null
    fahrzeug_standort_plz: string | null
    fahrzeug_standort_adresse: string | null
    gutachter_termin: string | null
    sa_unterschrieben: boolean
  }
}) {
  const router = useRouter()
  const [plz, setPlz] = useState(lead.fahrzeug_standort_plz ?? '')
  const [adresse, setAdresse] = useState(lead.fahrzeug_standort_adresse ?? '')
  const [wunschtermin, setWunschtermin] = useState('')
  const [searching, setSearching] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [result, setResult] = useState<MatchResult | null>(null)
  const [confirmed, setConfirmed] = useState(!!lead.gutachter_termin)
  const [error, setError] = useState<string | null>(null)
  const [showAltPicker, setShowAltPicker] = useState(false)

  if (!lead.sa_unterschrieben) return null
  if (confirmed) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle2Icon className="w-4 h-4 text-green-400" />
          </div>
          <div>
            <h2 className="text-sm font-medium text-green-400">Gutachter-Termin bestaetigt</h2>
            {lead.gutachter_termin && (
              <p className="text-gray-500 text-xs mt-0.5">
                {new Date(lead.gutachter_termin).toLocaleString('de-DE', {
                  weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  async function handleSearch() {
    if (!plz || !wunschtermin) return
    setSearching(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/gutachter-matching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plz,
          wunschtermin: new Date(wunschtermin).toISOString(),
          schadenfall_typ: lead.schadenfall_typ,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Suche fehlgeschlagen')
      }
      const data: MatchResult = await res.json()
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler bei der Suche')
    } finally {
      setSearching(false)
    }
  }

  async function handleConfirm(slot: GutachterSlot) {
    setConfirming(slot.sv_id + slot.termin)
    setError(null)
    try {
      await confirmGutachterTermin(lead.id, slot.sv_id, slot.termin, plz, adresse)
      setConfirmed(true)

      // Open WhatsApp with confirmation
      const phone = (lead.telefon ?? '').replace(/[^0-9+]/g, '')
      if (phone) {
        const name = [lead.vorname, lead.nachname].filter(Boolean).join(' ')
        const terminStr = new Date(slot.termin).toLocaleString('de-DE', {
          weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
        const msg = `Hallo ${name}, Ihr Gutachtertermin wurde bestaetigt:\n\nGutachter: ${slot.name}\nDatum: ${terminStr}\nAdresse: ${adresse || plz}\n\nIhr Claimondo-Team`
        const { sendWhatsAppFromLead } = await import('./actions')
        await sendWhatsAppFromLead(phone, msg).catch(() => {})
      }

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bestaetigung fehlgeschlagen')
    } finally {
      setConfirming(null)
    }
  }

  const inputCls = 'w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-100 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-500 transition-colors'

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
      <h2 className="text-sm font-medium text-gray-500 mb-4 flex items-center gap-2">
        <CalendarIcon className="w-4 h-4" />
        Gutachter-Termin vereinbaren
      </h2>

      {/* Inputs */}
      <div className="space-y-3 mb-4">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Standort des Fahrzeugs</label>
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <MapPinIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                type="text"
                value={plz}
                onChange={e => setPlz(e.target.value)}
                placeholder="PLZ"
                className={`${inputCls} pl-9`}
              />
            </div>
            <input
              type="text"
              value={adresse}
              onChange={e => setAdresse(e.target.value)}
              placeholder="Adresse (optional)"
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">Wunschtermin</label>
          <input
            type="datetime-local"
            value={wunschtermin}
            onChange={e => setWunschtermin(e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
            className={`${inputCls} [color-scheme:dark]`}
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400 rounded-xl bg-red-500/10 border border-red-900/50 px-4 py-3 mb-4">
          {error}
        </p>
      )}

      {/* Search button */}
      {!result && (
        <button
          onClick={handleSearch}
          disabled={searching || !plz || !wunschtermin}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-[#1E3A5F] hover:bg-[#4573A2] text-white active:scale-[0.98] flex items-center justify-center gap-2"
        >
          {searching ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Suche Gutachter...
            </>
          ) : (
            <>
              <SearchIcon className="w-4 h-4" />
              Verfuegbare Gutachter suchen
            </>
          )}
        </button>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-3">
          {/* Recommended */}
          {result.empfohlen && (
            <SlotCard
              slot={result.empfohlen}
              variant="empfohlen"
              onConfirm={handleConfirm}
              confirming={confirming === result.empfohlen.sv_id + result.empfohlen.termin}
            />
          )}

          {/* Alternative 1 */}
          {result.alternative_1 && (
            <SlotCard
              slot={result.alternative_1}
              variant="alternative"
              label="Alternative 1"
              onConfirm={handleConfirm}
              confirming={confirming === result.alternative_1.sv_id + result.alternative_1.termin}
            />
          )}

          {/* Alternative 2 */}
          {result.alternative_2 && (
            <SlotCard
              slot={result.alternative_2}
              variant="alternative"
              label="Alternative 2"
              onConfirm={handleConfirm}
              confirming={confirming === result.alternative_2.sv_id + result.alternative_2.termin}
            />
          )}

          {/* Try different time */}
          {!showAltPicker ? (
            <button
              onClick={() => { setResult(null); setShowAltPicker(true) }}
              className="w-full py-2.5 text-center text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              Anderen Termin pruefen
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

// ─── Slot Card ───────────────────────────────────────────────────────────────

function SlotCard({
  slot,
  variant,
  label,
  onConfirm,
  confirming,
}: {
  slot: GutachterSlot
  variant: 'empfohlen' | 'alternative'
  label?: string
  onConfirm: (slot: GutachterSlot) => void
  confirming: boolean
}) {
  const isEmpfohlen = variant === 'empfohlen'
  const terminDate = new Date(slot.termin)

  return (
    <div className={`rounded-xl p-4 border ${
      isEmpfohlen
        ? 'bg-green-50/30 border-green-800/50'
        : 'bg-[#4573A2]/10 border-[#1E3A5F]/50'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-semibold uppercase tracking-wide ${
          isEmpfohlen ? 'text-green-400' : 'text-[#7BA3CC]'
        }`}>
          {isEmpfohlen ? 'Empfohlen' : label ?? 'Alternative'}
          {isEmpfohlen && slot.wunschtermin_moeglich && (
            <span className="ml-2 text-green-500">Wunschtermin moeglich</span>
          )}
        </span>
      </div>

      {/* Gutachter info */}
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
          isEmpfohlen ? 'bg-green-500/20' : 'bg-[#4573A2]/20'
        }`}>
          <UserCheckIcon className={`w-4 h-4 ${isEmpfohlen ? 'text-green-400' : 'text-[#7BA3CC]'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-gray-900 text-sm font-medium">{slot.name}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {slot.entfernung_km != null && (
              <span className="text-gray-500 text-[11px] flex items-center gap-1">
                <MapPinIcon className="w-3 h-3" />
                {slot.entfernung_km} km
              </span>
            )}
            <span className="text-gray-500 text-[11px] flex items-center gap-1">
              <ClockIcon className="w-3 h-3" />
              Auslastung {slot.auslastung}
            </span>
            {slot.paket && (
              <span className="text-gray-500 text-[11px]">{slot.paket}</span>
            )}
          </div>
        </div>
      </div>

      {/* Termin */}
      <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-gray-100/50">
        <CalendarIcon className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-gray-800 text-sm">
          {terminDate.toLocaleString('de-DE', {
            weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}
        </span>
      </div>

      {/* Confirm button */}
      <button
        onClick={() => onConfirm(slot)}
        disabled={confirming}
        className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 ${
          isEmpfohlen
            ? 'bg-green-600 hover:bg-green-500 text-white'
            : 'bg-[#1E3A5F] hover:bg-[#4573A2] text-white'
        }`}
      >
        {confirming ? 'Wird bestaetigt...' : 'Diesen Termin bestaetigen'}
      </button>
    </div>
  )
}
