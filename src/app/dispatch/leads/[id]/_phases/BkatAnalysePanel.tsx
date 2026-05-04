'use client'

// AAR-504/505: KI-Panel fuer Unfallart-Vorschlaege.
// OCR first (Polizeibericht, wenn vorhanden), LLM-Fallback auf
// unfallhergang-Text. Zeigt Top-3 TBNR-Vorschlaege + empfohlene Unfallart.
//
// WICHTIG: TBNRs sind nur Info-Anzeige — sie werden NICHT in die DB
// gespeichert (ausser bei echter Polizeibericht-OCR + polizei_vor_ort=true,
// dann ins fall_dokumente.ocr_result). Andernfalls koennte Kanzlei die TBNR
// als Polizei-bestaetigt missverstehen.

import { useState } from 'react'
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
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [autoSaved, setAutoSaved] = useState(false)

  async function analyze() {
    setLoading(true)
    setResult(null)
    setAutoSaved(false)
    try {
      const r = await analyzeBkatForLead(leadId)
      setResult(r)
      // Auto-Übernehmen wenn Unfallart mit ausreichender Konfidenz erkannt
      if (r.success && r.data?.unfallart) {
        const unfallart = r.data.unfallart
        const legacy = bkatToLegacySchadentyp(unfallart as Parameters<typeof bkatToLegacySchadentyp>[0])
        const saved = await saveBkatUnfallart(leadId, unfallart as Parameters<typeof saveBkatUnfallart>[1], legacy)
        if (saved.success) {
          setAutoSaved(true)
          setToast(`Schadentyp „${UNFALLART_LABEL[unfallart] ?? unfallart}" automatisch übernommen`)
          setTimeout(() => setToast(null), 4000)
          onSchadentypGesetzt?.()
        } else {
          setToast(saved.error ?? 'Auto-Speichern fehlgeschlagen')
          setTimeout(() => setToast(null), 5000)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const data = result?.data
  const sourceLabel =
    data?.source === 'ocr'
      ? 'Polizeibericht (OCR)'
      : data?.source === 'llm'
        ? 'Unfallhergang (KI)'
        : 'keine Daten'

  // Top-TBNR für Inline-Anzeige neben dem Schadentyp
  const topTbnr = data?.vorschlaege?.[0]

  return (
    <div className="rounded-xl border border-claimondo-ondo/30 bg-claimondo-ondo/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <SparklesIcon className="w-4 h-4 text-claimondo-ondo" />
        <h3 className="text-sm font-semibold text-claimondo-navy">KI-Klassifikation</h3>
        <span className="text-[10px] text-claimondo-ondo uppercase tracking-wider">BKat</span>
      </div>

      {!result && (
        <>
          <p className="text-xs text-claimondo-ondo">
            Analysiert den Unfallhergang + ggf. den Polizeibericht und wählt
            den Schadentyp automatisch aus.
          </p>
          <button
            type="button"
            onClick={analyze}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-claimondo-ondo text-white text-sm font-medium hover:bg-claimondo-shield disabled:opacity-50"
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
            oder KI ist unsicher. Bitte den Schadentyp unten manuell wählen.
          </span>
        </div>
      )}

      {data && data.unfallart && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-claimondo-ondo">
            <span>Quelle: <span className="font-medium text-claimondo-navy">{sourceLabel}</span></span>
            {data.schuld_hint && SCHULD_LABEL[data.schuld_hint] && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${SCHULD_LABEL[data.schuld_hint].cls}`}>
                <ScaleIcon className="w-3 h-3" />
                {SCHULD_LABEL[data.schuld_hint].label}
              </span>
            )}
          </div>

          <div className="bg-white rounded-lg border border-claimondo-ondo/30 p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo">Erkannter Schadentyp</p>
                <p className="text-sm font-semibold text-claimondo-navy">
                  {UNFALLART_LABEL[data.unfallart] ?? data.unfallart}
                </p>
              </div>
              {autoSaved && (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 font-medium">
                  <CheckCircleIcon className="w-3 h-3" />
                  Automatisch übernommen
                </span>
              )}
            </div>

            {/* Top-TBNR inline — nur Behördenkennzeichen + Kurzbezeichnung */}
            {topTbnr && (
              <div className="flex items-start gap-1.5 text-xs text-claimondo-navy/70 pt-1 border-t border-claimondo-border/50">
                <span className="font-mono text-claimondo-ondo shrink-0">{topTbnr.tbnr}</span>
                <span>{topTbnr.tatbestand.kurzform ?? topTbnr.tatbestand.bezeichnung}</span>
                {topTbnr.tatbestand.paragraph_num != null && (
                  <span className="shrink-0 text-claimondo-ondo/60">
                    · § {topTbnr.tatbestand.paragraph_num} {topTbnr.tatbestand.vorschrift}
                  </span>
                )}
                {data.source === 'ocr' && polizeiVorOrt && (
                  <span className="ml-auto shrink-0 text-emerald-700">aus Polizeibericht</span>
                )}
              </div>
            )}
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
