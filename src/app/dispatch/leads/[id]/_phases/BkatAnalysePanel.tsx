'use client'

// AAR-504/505: KI-Panel fuer Unfallart-Vorschlaege.
// OCR first (Polizeibericht, wenn vorhanden), LLM-Fallback auf
// unfallhergang-Text. Zeigt Top-3 TBNR-Vorschlaege + empfohlene Unfallart.
//
// WICHTIG: TBNRs sind nur Info-Anzeige — sie werden NICHT in die DB
// gespeichert (ausser bei echter Polizeibericht-OCR + polizei_vor_ort=true,
// dann ins fall_dokumente.ocr_result). Andernfalls koennte Kanzlei die TBNR
// als Polizei-bestaetigt missverstehen.

import { useState, useTransition } from 'react'
import { SparklesIcon, AlertTriangleIcon, CheckCircleIcon, ScaleIcon } from 'lucide-react'
import {
  analyzeBkatForLead,
  saveBkatUnfallart,
} from '../_actions/bkat-inference'
import { bkatToLegacySchadentyp } from '@/lib/bkat/lookup'

type Result = Awaited<ReturnType<typeof analyzeBkatForLead>>

const UNFALLART_LABEL: Record<string, string> = {
  auffahrunfall: 'Auffahrunfall',
  vorfahrt: 'Vorfahrt missachtet',
  kreuzung_rotlicht: 'Rotlicht-Unfall',
  spurwechsel: 'Spurwechsel',
  ueberholen: 'Überholunfall',
  abbiegen: 'Abbiege-Unfall',
  rueckwaerts_parken: 'Rückwärts-Parkschaden',
  einfahren_anfahren: 'Einfahren / Anfahren',
  dooring: 'Dooring (Tür geöffnet)',
  fussgaenger: 'Fußgänger-Unfall',
  geschwindigkeit: 'Geschwindigkeits-Unfall',
  fahrerflucht: 'Fahrerflucht',
  alkohol_drogen: 'Alkohol / Drogen',
  grundregeln: 'Grundregel-Verstoß (§ 1)',
  sonstiges: 'Sonstiges',
}

const SCHULD_LABEL: Record<string, { label: string; cls: string }> = {
  gegner_klar: { label: 'Gegner klar schuldig', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  gegner_wahrscheinlich: { label: 'Gegner wahrscheinlich schuldig', cls: 'bg-green-50 text-green-700 border-green-200' },
  geteilt: { label: 'Geteilte Schuld', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  kunde_verdacht: { label: '⚠ Kunde-Verdacht', cls: 'bg-red-50 text-red-700 border-red-200' },
}

export default function BkatAnalysePanel({
  leadId,
  polizeiVorOrt,
  onSchadentypGesetzt,
}: {
  leadId: string
  polizeiVorOrt: boolean | null
  onSchadentypGesetzt?: () => void
}) {
  const [, startTransition] = useTransition()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  async function analyze() {
    setLoading(true)
    setResult(null)
    try {
      const r = await analyzeBkatForLead(leadId)
      setResult(r)
    } finally {
      setLoading(false)
    }
  }

  async function uebernehmen(unfallart: string) {
    if (!unfallart) return
    setSaving(true)
    startTransition(async () => {
      const legacy = bkatToLegacySchadentyp(unfallart as Parameters<typeof bkatToLegacySchadentyp>[0])
      const r = await saveBkatUnfallart(leadId, unfallart as Parameters<typeof saveBkatUnfallart>[1], legacy)
      setSaving(false)
      if (r.success) {
        setToast(`Unfallart „${UNFALLART_LABEL[unfallart] ?? unfallart}" übernommen`)
        setTimeout(() => setToast(null), 3000)
        onSchadentypGesetzt?.()
      } else {
        setToast(r.error ?? 'Speichern fehlgeschlagen')
        setTimeout(() => setToast(null), 5000)
      }
    })
  }

  const data = result?.data
  const sourceLabel =
    data?.source === 'ocr'
      ? 'Polizeibericht (OCR)'
      : data?.source === 'llm'
        ? 'Unfallhergang (KI)'
        : 'keine Daten'

  return (
    <div className="rounded-xl border border-[#4573A2]/30 bg-[#4573A2]/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <SparklesIcon className="w-4 h-4 text-[#4573A2]" />
        <h3 className="text-sm font-semibold text-[#0D1B3E]">KI-Klassifikation</h3>
        <span className="text-[10px] text-claimondo-ondo uppercase tracking-wider">BKat</span>
      </div>

      {!result && (
        <>
          <p className="text-xs text-claimondo-ondo">
            Analysiert den Unfallhergang + ggf. den Polizeibericht und schlägt
            die passende Unfallart vor. TBNRs werden nur angezeigt — nicht
            gespeichert, ausser die Polizei war vor Ort.
          </p>
          <button
            type="button"
            onClick={analyze}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#4573A2] text-white text-sm font-medium hover:bg-[#1E3A5F] disabled:opacity-50"
          >
            <SparklesIcon className="w-3.5 h-3.5" />
            {loading ? 'Analysiere …' : 'Unfallart analysieren'}
          </button>
        </>
      )}

      {result && !result.success && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangleIcon className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{result.error ?? 'Analyse fehlgeschlagen'}</span>
        </div>
      )}

      {data && data.source === 'keine_daten' && (
        <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangleIcon className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Keine eindeutige Klassifikation möglich — Unfallhergang zu kurz
            oder KI ist unsicher. Bitte manuell wählen.
          </span>
        </div>
      )}

      {data && data.vorschlaege.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-claimondo-ondo">
            <span>Quelle: <span className="font-medium text-claimondo-navy">{sourceLabel}</span></span>
            {data.schuld_hint && SCHULD_LABEL[data.schuld_hint] && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${SCHULD_LABEL[data.schuld_hint].cls}`}>
                <ScaleIcon className="w-3 h-3" />
                {SCHULD_LABEL[data.schuld_hint].label}
              </span>
            )}
          </div>

          {data.unfallart && (
            <div className="bg-white rounded-lg border border-[#4573A2]/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo">Empfohlene Unfallart</p>
                  <p className="text-sm font-semibold text-claimondo-navy">
                    {UNFALLART_LABEL[data.unfallart] ?? data.unfallart}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => uebernehmen(data.unfallart!)}
                  disabled={saving}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircleIcon className="w-3.5 h-3.5" />
                  Übernehmen
                </button>
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo mb-1">
              TBNR-Kandidaten ({data.vorschlaege.length})
              {data.source !== 'ocr' && (
                <span className="ml-2 normal-case tracking-normal text-amber-700">
                  — nicht gespeichert (Polizei nicht vor Ort)
                </span>
              )}
              {data.source === 'ocr' && polizeiVorOrt && (
                <span className="ml-2 normal-case tracking-normal text-emerald-700">
                  — bestätigt aus Polizeibericht
                </span>
              )}
            </p>
            <ul className="space-y-1">
              {data.vorschlaege.map((v) => (
                <li
                  key={v.tbnr}
                  className="flex items-start gap-2 text-xs bg-white/70 rounded-md px-2 py-1.5 border border-claimondo-border"
                >
                  <span className="font-mono font-medium text-[#4573A2] shrink-0">{v.tbnr}</span>
                  <span className="text-claimondo-navy flex-1">
                    <span className="font-medium">{v.tatbestand.kurzform ?? v.tatbestand.bezeichnung}</span>
                    {v.tatbestand.paragraph_num != null && (
                      <span className="text-claimondo-ondo/70"> · § {v.tatbestand.paragraph_num} {v.tatbestand.vorschrift}</span>
                    )}
                  </span>
                  <span className="text-[10px] text-claimondo-ondo/70 shrink-0">{v.confidence}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {toast && (
        <div className="text-xs text-claimondo-navy bg-white border border-claimondo-border rounded-lg px-3 py-2">
          {toast}
        </div>
      )}
    </div>
  )
}
