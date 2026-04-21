'use client'

// AAR-114: 8-Minuten-Gespraechsleitfaden-Timer (Notion-Spec 14.04.2026 §1)
// Phasen: 0-2min empathisch reden lassen, 2-4min Q1/Q2/Q3, 4-5min Nutzen,
// 5-7min Daten, 7-8min FlowLink + Abschluss.
// AAR-176 P3-F: Beim „Gespräch beenden"-Klick wird eine Zusammenfassung
// angezeigt (welche Phasen-Ziele wurden erreicht, welche nicht) — der MA
// kann schnell prüfen, ob der nächste Anruf sauber übergeben wird.

import { useEffect, useState, useTransition } from 'react'
import { PhoneCallIcon, PhoneOffIcon, ClockIcon, XIcon, CheckIcon } from 'lucide-react'
import { startGespraech, endeGespraech } from './_actions'

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
  // AAR-176 P2-E: Q3 ist seit AAR-138 Polizei-vor-Ort, nicht mehr Haftpflicht.
  { von: 120, bis: 240, kurz: '2:00 – 4:00', label: 'Q1 Hergang + Aufklärung, Q2 Schaden, Q3 Polizei.', bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-800' },
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

  const [showSummary, setShowSummary] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  function starte() { startTransition(async () => { await startGespraech(leadId) }) }
  function beende() {
    // AAR-176 P3-F: Zusammenfassung bevor wir wirklich beenden — verhindert
    // dass der MA das Gespräch im Affekt beendet ohne Stand zu prüfen.
    setSummaryError(null)
    setShowSummary(true)
  }
  function bestaetigeBeenden() {
    // AAR-179 Audit-Fix: Fehler aus endeGespraech sichtbar machen statt
    // Modal voreilig zu schließen. Bei Erfolg schließen, bei Fehler bleibt
    // Modal offen + zeigt die Fehlermeldung.
    startTransition(async () => {
      try {
        await endeGespraech(leadId)
        setShowSummary(false)
      } catch (err) {
        setSummaryError(err instanceof Error ? err.message : 'Beenden fehlgeschlagen')
      }
    })
  }

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
        <div className="flex-1 space-y-0.5">
          <p className="text-xs text-gray-700">
            Gespräch beendet — Dauer <strong className="font-mono">{formatTime(dauerSekunden ?? sekunden)}</strong>
            {(dauerSekunden ?? sekunden) > 480 && <span className="text-red-600 ml-1">(überzogen)</span>}
          </p>
          {/* AAR-189: Nach dem Beenden weiß der MA sonst nicht was als
              nächstes ansteht. Kompakter Pfeil-Hinweis auf Phase 5 + Versand. */}
          <p className="text-[10px] text-gray-400">
            → Nächster Schritt: Phase 5 öffnen → Zusammenfassung prüfen → FlowLink senden
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

      {/* AAR-176 P3-F: Zusammenfassungs-Dialog vor dem echten Beenden */}
      {showSummary && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowSummary(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Gespräch-Zusammenfassung</h3>
              <button type="button" onClick={() => setShowSummary(false)} className="text-gray-400 hover:text-gray-700">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs text-gray-700">
              <p className="flex items-center gap-2">
                <ClockIcon className="w-3.5 h-3.5 text-gray-500" />
                Dauer: <strong className="font-mono">{formatTime(sekunden)}</strong>
                {sekunden > 480 && <span className="text-red-600">(überzogen)</span>}
              </p>
              <p className="text-[11px] text-gray-500 border-t border-gray-100 pt-2">
                Prüfe vor dem Beenden: Ist Phase 1 (Qualifizierung) komplett? Ist ein SV reserviert?
                Hat der Kunde den FlowLink per WA erhalten? Wenn nein → jetzt aktiv nachziehen statt
                im nächsten Gespräch nachschlagen.
              </p>
              {pending && (
                <p className="text-[11px] text-gray-500 italic flex items-center gap-1">
                  <ClockIcon className="w-3 h-3 animate-pulse" /> Gespräch wird beendet ...
                </p>
              )}
              {summaryError && (
                <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2">
                  Beenden fehlgeschlagen: {summaryError}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowSummary(false)}
                disabled={pending}
                className="flex-1 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 disabled:opacity-50"
              >
                Weiter sprechen
              </button>
              <button
                type="button"
                onClick={bestaetigeBeenden}
                disabled={pending}
                className="flex-1 px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1"
              >
                <CheckIcon className="w-3.5 h-3.5" />
                {pending ? 'Beendet ...' : summaryError ? 'Erneut versuchen' : 'Jetzt beenden'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
