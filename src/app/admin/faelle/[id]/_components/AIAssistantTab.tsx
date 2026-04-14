'use client'

// AAR-104: Claimondo AI Assistant Tab - Fall-Zusammenfassung via Claude
import { useState, useEffect, useTransition, useCallback } from 'react'
import { SparklesIcon, ClockIcon, BotIcon } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { generateFallSummary } from '../ai-actions'

type FallSummary = {
  id: string
  fall_id: string
  kunden_anliegen: string | null
  zusammenfassung: string
  ai_modell: string
  prompt_tokens: number | null
  completion_tokens: number | null
  generated_at: string
  generated_by: { vorname: string | null; nachname: string | null } | { vorname: string | null; nachname: string | null }[] | null
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} Min`
  const h = Math.floor(min / 60)
  if (h < 24) return `vor ${h} Std`
  const d = Math.floor(h / 24)
  return `vor ${d} Tagen`
}

export default function AIAssistantTab({ fallId }: { fallId: string }) {
  const [summaries, setSummaries] = useState<FallSummary[]>([])
  const [selected, setSelected] = useState<FallSummary | null>(null)
  const [kundenAnliegen, setKundenAnliegen] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const loadSummaries = useCallback(async () => {
    try {
      const res = await fetch(`/api/fall-summaries?fall_id=${fallId}`)
      const data = await res.json() as { summaries?: FallSummary[]; error?: string }
      if (data.summaries) {
        setSummaries(data.summaries)
        setSelected(data.summaries[0] ?? null)
      }
    } catch { /* */ }
  }, [fallId])

  useEffect(() => { loadSummaries() }, [loadSummaries])

  function handleGenerate() {
    setError(null)
    startTransition(async () => {
      const result = await generateFallSummary(fallId, kundenAnliegen.trim() || null)
      if (!result.success) {
        setError(result.error ?? 'Fehler')
        return
      }
      setKundenAnliegen('')
      await loadSummaries()
    })
  }

  return (
    <div className="space-y-6">
      {/* Generator-Karte */}
      <div className="bg-gradient-to-br from-[#4573A2]/10 via-[#7BA3CC]/5 to-transparent border border-[#4573A2]/20 rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4573A2] to-[#0D1B3E] flex items-center justify-center">
            <SparklesIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#0D1B3E]">Claimondo AI Assistant</h2>
            <p className="text-xs text-gray-500">Powered by Claude Sonnet 4.5</p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-700 uppercase tracking-wider">
              Anliegen des Kunden (optional)
            </span>
            <textarea
              value={kundenAnliegen}
              onChange={e => setKundenAnliegen(e.target.value)}
              placeholder="z.B. Kunde fragt wann der Gutachter kommt und ob er schon einen Mietwagen bestellen kann..."
              rows={3}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-[#4573A2] resize-none"
              disabled={pending}
            />
          </label>

          <button
            onClick={handleGenerate}
            disabled={pending}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-[#4573A2] to-[#0D1B3E] text-white font-semibold disabled:opacity-50 hover:shadow-lg transition-shadow"
          >
            {pending ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analysiere Fallakte...
              </>
            ) : (
              <>
                <SparklesIcon className="w-4 h-4" />
                {summaries.length > 0 ? 'Neue Zusammenfassung generieren' : 'Erste Zusammenfassung generieren'}
              </>
            )}
          </button>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg p-3">{error}</p>
          )}
        </div>
      </div>

      {/* Aktuelle Summary */}
      {selected && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <ClockIcon className="w-4 h-4" />
              <span>
                Erstellt {formatRelative(selected.generated_at)}
                {(() => {
                  const g = Array.isArray(selected.generated_by) ? selected.generated_by[0] : selected.generated_by
                  return g?.vorname ? ` von ${g.vorname}` : ''
                })()}
              </span>
            </div>
            {summaries.length > 1 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="text-xs text-[#4573A2] hover:underline"
              >
                History ({summaries.length})
              </button>
            )}
          </div>

          {selected.kunden_anliegen && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <p className="text-xs uppercase tracking-wider text-amber-700 mb-1">Anliegen</p>
              <p className="text-sm text-amber-900">{selected.kunden_anliegen}</p>
            </div>
          )}

          <div className="prose prose-sm max-w-none prose-headings:text-[#0D1B3E] prose-headings:font-semibold prose-strong:text-[#0D1B3E]">
            <ReactMarkdown>{selected.zusammenfassung}</ReactMarkdown>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
            <span>{selected.ai_modell}</span>
            <span>{selected.prompt_tokens} → {selected.completion_tokens} Tokens</span>
          </div>
        </div>
      )}

      {/* History */}
      {showHistory && summaries.length > 1 && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
            Frühere Zusammenfassungen
          </h3>
          <div className="space-y-2">
            {summaries.map(s => {
              const g = Array.isArray(s.generated_by) ? s.generated_by[0] : s.generated_by
              return (
                <button
                  key={s.id}
                  onClick={() => { setSelected(s); setShowHistory(false) }}
                  className={`w-full text-left p-3 rounded-xl text-sm transition-colors ${
                    selected?.id === s.id
                      ? 'bg-[#4573A2]/10 border border-[#4573A2]/20'
                      : 'bg-white border border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#0D1B3E]">
                      {new Date(s.generated_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-xs text-gray-500">{g?.vorname ?? 'System'}</span>
                  </div>
                  {s.kunden_anliegen && (
                    <p className="text-xs text-gray-500 mt-1 truncate">{s.kunden_anliegen}</p>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty */}
      {summaries.length === 0 && !pending && (
        <div className="text-center py-12 text-gray-400">
          <BotIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">Noch keine Zusammenfassung für diesen Fall.</p>
          <p className="text-xs mt-1">Oben auf &quot;Generieren&quot; klicken um zu starten.</p>
        </div>
      )}
    </div>
  )
}
