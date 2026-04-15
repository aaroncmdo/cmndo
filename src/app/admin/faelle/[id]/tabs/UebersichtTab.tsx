'use client'

// AAR-162 / W2: Übersicht-Tab — Status + Stammdaten-Sections.
// AAR-169: Videotermin-Buchen-Button für KB (Video solo, nicht mit LexDrive).

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { VideoIcon } from 'lucide-react'
import { FALL_STATUS_LABELS, FALL_STATUS_COLORS } from '@/lib/statusLabels'
import { useFall } from '../FallContext'
import { createKbVideoterminByKb } from '../actions/termine'
import type { StammdatenSection } from '@/lib/fall/phase-config'
import {
  KundendatenSection,
  FahrzeugdatenSection,
  UnfallSection,
  GegnerSection,
  VorschaedenSection,
  BesichtigungSection,
  KernwerteSection,
  VsStatusSection,
} from '../stammdaten/Sections'

const SECTION_COMPONENTS: Partial<Record<StammdatenSection, () => React.JSX.Element>> = {
  kunde: KundendatenSection,
  fahrzeug: FahrzeugdatenSection,
  unfall: UnfallSection,
  gegner: GegnerSection,
  vorschaeden: VorschaedenSection,
  besichtigung: BesichtigungSection,
  kernwerte: KernwerteSection,
  'as-status': VsStatusSection,
  // kuerzung/ruege/stellungnahme/nachbesichtigung/regulierung/klage/auszahlung
  // → werden im ProzessTab (W4) gerendert, nicht in der Übersicht
}

export default function UebersichtTab() {
  const { fall, visibleSections, refreshFall } = useFall()
  const status = fall.status ?? 'ersterfassung'
  const statusLabel = FALL_STATUS_LABELS[status] ?? status
  const statusCls =
    FALL_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'

  // AAR-169: KB-Videotermin-Buchen
  const [showBuchen, setShowBuchen] = useState(false)
  const [buchenDatum, setBuchenDatum] = useState('')
  const [buchenUhrzeit, setBuchenUhrzeit] = useState('')
  const [buchenKanal, setBuchenKanal] = useState<'video' | 'telefon'>('video')
  const [buchenNotiz, setBuchenNotiz] = useState('')
  const [pending, startTransition] = useTransition()

  function buchen() {
    if (!buchenDatum || !buchenUhrzeit) {
      toast.error('Datum und Uhrzeit erforderlich')
      return
    }
    const iso = new Date(`${buchenDatum}T${buchenUhrzeit}:00`).toISOString()
    startTransition(async () => {
      const r = await createKbVideoterminByKb(
        fall.id,
        iso,
        buchenKanal,
        buchenNotiz.trim() || undefined,
      )
      if (r.success) {
        toast.success(
          buchenKanal === 'video'
            ? `Videotermin gebucht${r.videoLink ? ` — Link: ${r.videoLink}` : ''}`
            : 'Telefontermin gebucht',
        )
        setShowBuchen(false)
        setBuchenDatum('')
        setBuchenUhrzeit('')
        setBuchenNotiz('')
        refreshFall()
      } else {
        toast.error(r.error ?? 'Buchung fehlgeschlagen')
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* Status-Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400">Fall-Nummer</p>
          <h1 className="text-xl font-bold text-gray-900">{fall.fall_nummer ?? fall.id.slice(0, 8)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-medium px-2 py-1 rounded-full border ${statusCls}`}
          >
            {statusLabel}
          </span>
          <button
            type="button"
            onClick={() => setShowBuchen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-[#4573A2] text-white hover:bg-[#0D1B3E]"
          >
            <VideoIcon className="w-3.5 h-3.5" /> Videotermin buchen
          </button>
        </div>
      </div>

      {/* AAR-169: Videotermin-Buchen-Dialog (KB solo) */}
      {showBuchen && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <VideoIcon className="w-4 h-4 text-[#4573A2]" />
            <h3 className="text-sm font-semibold text-gray-900">Videotermin mit Kunde buchen</h3>
          </div>
          <p className="text-[11px] text-gray-500">
            KB-solo-Termin (nicht mit LexDrive). Kunde bekommt WA-Einladung mit Link.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-400 block mb-1">
                Datum
              </label>
              <input
                type="date"
                value={buchenDatum}
                onChange={(e) => setBuchenDatum(e.target.value)}
                className="w-full text-sm border-b border-gray-200 focus:border-[#4573A2] outline-none py-1"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-400 block mb-1">
                Uhrzeit
              </label>
              <input
                type="time"
                value={buchenUhrzeit}
                onChange={(e) => setBuchenUhrzeit(e.target.value)}
                className="w-full text-sm border-b border-gray-200 focus:border-[#4573A2] outline-none py-1"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-gray-400 block mb-1">
                Kanal
              </label>
              <div className="flex gap-2">
                {(['video', 'telefon'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setBuchenKanal(k)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border ${
                      buchenKanal === k
                        ? 'bg-[#4573A2] text-white border-[#4573A2]'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {k === 'video' ? 'Video' : 'Telefon'}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-gray-400 block mb-1">
                Notiz (intern)
              </label>
              <input
                type="text"
                value={buchenNotiz}
                onChange={(e) => setBuchenNotiz(e.target.value)}
                placeholder="Optional — worum geht's im Termin?"
                className="w-full text-sm border-b border-gray-200 focus:border-[#4573A2] outline-none py-1"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowBuchen(false)}
              className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={buchen}
              disabled={pending}
              className="px-3 py-1.5 rounded-md bg-[#4573A2] text-white text-xs font-medium hover:bg-[#0D1B3E] disabled:opacity-50"
            >
              {pending ? 'Buche ...' : 'Buchen'}
            </button>
          </div>
        </div>
      )}

      {/* Stammdaten — phase-abhängige Reihenfolge */}
      {visibleSections.map((id) => {
        const Comp = SECTION_COMPONENTS[id]
        if (!Comp) return null
        return <Comp key={id} />
      })}
    </div>
  )
}
