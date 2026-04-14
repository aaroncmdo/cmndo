'use client'

// AAR-114: 8-Minuten-Gespraechsleitfaden-Timer (Notion-Spec 14.04.2026 §1)
// Phasen: 0-2min empathisch reden lassen, 2-4min Q1/Q2/Q3, 4-5min Nutzen,
// 5-7min Daten, 7-8min FlowLink + Abschluss.

import { useEffect, useState, useTransition } from 'react'
import { PhoneCallIcon, PhoneOffIcon, ClockIcon } from 'lucide-react'
import { startGespraech, endeGespraech } from './actions'

type Phase = {
  von: number
  bis: number
  label: string
  kurz: string
  bg: string
  border: string
  text: string
}

const PHASEN: Phase[] = [
  { von: 0, bis: 120, kurz: '0:00 – 2:00', label: 'Kunde erzählen lassen. Empathie. Claimondo kurz vorstellen.', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800' },
  { von: 120, bis: 240, kurz: '2:00 – 4:00', label: 'Q1 Hergang + Aufklärung, Q2 Schaden, Q3 Haftpflicht.', bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-800' },
  { von: 240, bis: 300, kurz: '4:00 – 5:00', label: 'Nutzenversprechen + SV-Termin vormerken.', bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-800' },
  { von: 300, bis: 420, kurz: '5:00 – 7:00', label: 'Daten erfassen (Name, Tel, Kennzeichen, Schadentyp, Hergang).', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800' },
  { von: 420, bis: 480, kurz: '7:00 – 8:00', label: 'FlowLink senden + Abschluss.', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800' },
]

function formatTime(sekunden: number): string {
  const m = Math.floor(sekunden / 60)
  const s = sekunden % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function GespraechsleitfadenTimer({
  leadId,
  gestartetAm,
  beendetAm,
  dauerSekunden,
}: {
  leadId: string
  gestartetAm: string | null
  beendetAm: string | null
  dauerSekunden: number | null
}) {
  const [pending, startTransition] = useTransition()
  const [sekunden, setSekunden] = useState<number>(() => {
    if (beendetAm && dauerSekunden) return dauerSekunden
    if (gestartetAm) return Math.floor((Date.now() - new Date(gestartetAm).getTime()) / 1000)
    return 0
  })

  const running = !!gestartetAm && !beendetAm

  useEffect(() => {
    if (!running || !gestartetAm) return
    const start = new Date(gestartetAm).getTime()
    const tick = () => setSekunden(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [running, gestartetAm])

  const aktivePhase = PHASEN.find(p => sekunden >= p.von && sekunden < p.bis)
  const istUeberzogen = sekunden >= 480 && running
  const progressPct = Math.min(100, (sekunden / 480) * 100)

  function starte() { startTransition(async () => { await startGespraech(leadId) }) }
  function beende() { startTransition(async () => { await endeGespraech(leadId) }) }

  if (!gestartetAm) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <PhoneCallIcon className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Gespräch noch nicht gestartet</p>
            <p className="text-[11px] text-gray-500">8-Minuten-Leitfaden mit Phasen-Anzeige</p>
          </div>
        </div>
        <button type="button" disabled={pending} onClick={starte}
          className="px-4 py-2 rounded-lg bg-[#4573A2] text-white text-sm font-medium hover:bg-[#3a6290] disabled:opacity-50">
          {pending ? '...' : 'Gespräch starten'}
        </button>
      </div>
    )
  }

  if (beendetAm) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-3">
        <PhoneOffIcon className="w-4 h-4 text-gray-500 shrink-0" />
        <div className="flex-1">
          <p className="text-xs text-gray-700">
            Gespräch beendet — Dauer <strong className="font-mono">{formatTime(dauerSekunden ?? sekunden)}</strong>
            {(dauerSekunden ?? sekunden) > 480 && <span className="text-red-600 ml-1">(überzogen)</span>}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`border rounded-xl p-4 space-y-3 ${istUeberzogen ? 'bg-red-50 border-red-300' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClockIcon className={`w-4 h-4 ${istUeberzogen ? 'text-red-600' : 'text-green-600'} animate-pulse`} />
          <span className={`text-lg font-mono font-bold ${istUeberzogen ? 'text-red-700' : 'text-gray-900'}`}>
            {formatTime(sekunden)}
          </span>
          <span className="text-xs text-gray-400">/ 08:00</span>
          {istUeberzogen && (
            <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide">
              Überzogen
            </span>
          )}
        </div>
        <button type="button" disabled={pending} onClick={beende}
          className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 disabled:opacity-50">
          Gespräch beenden
        </button>
      </div>

      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-1000 ${istUeberzogen ? 'bg-red-500' : 'bg-[#4573A2]'}`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {aktivePhase && (
        <div className={`${aktivePhase.bg} ${aktivePhase.border} border rounded-lg px-3 py-2`}>
          <p className={`text-[10px] font-mono uppercase tracking-wider ${aktivePhase.text} opacity-70`}>
            Phase {aktivePhase.kurz}
          </p>
          <p className={`text-xs ${aktivePhase.text} font-medium mt-0.5`}>{aktivePhase.label}</p>
        </div>
      )}

      {istUeberzogen && (
        <p className="text-[11px] text-red-700 italic">
          Gespräch dauert länger als 8 Minuten — Abschluss jetzt aktiv einleiten oder Rückruf vereinbaren.
        </p>
      )}
    </div>
  )
}
