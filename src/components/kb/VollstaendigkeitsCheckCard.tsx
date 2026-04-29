'use client'

// CMM-32e: KB-QC-Card. Zeigt Hauptgutachten + Anlagen + Pflichtdokumente-
// Status. „Kanzleipaket freigeben"-Button setzt den Auftrag final ab und
// startet den Regulierungs-Lifecycle.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircleIcon, AlertCircleIcon, FileTextIcon, DownloadIcon, ArrowLeftCircleIcon } from 'lucide-react'
import { gibKanzleipaketFrei, weiseGutachtenZurueck } from '@/lib/auftrag/qc'

type AnlageRow = {
  id: string
  filename: string
  url: string
  istHaupt: boolean
}

type PflichtItem = {
  slot_id: string
  label: string
  vorhanden: boolean
  pflicht: boolean
}

type Props = {
  auftragId: string
  hatGutachten: boolean
  bereitsFreigegeben: boolean
  hauptgutachten: AnlageRow | null
  anlagen: AnlageRow[]
  pflichtItems: PflichtItem[]
  /** CMM-32e: gesetzt wenn KB schon mal Nachbesserung gefordert hat. */
  zurueckgewiesenAm?: string | null
  zurueckweisungGrund?: string | null
}

export default function VollstaendigkeitsCheckCard({
  auftragId,
  hatGutachten,
  bereitsFreigegeben,
  hauptgutachten,
  anlagen,
  pflichtItems,
  zurueckgewiesenAm,
  zurueckweisungGrund,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectGrund, setRejectGrund] = useState('')
  const router = useRouter()

  if (bereitsFreigegeben) {
    return (
      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3">
        <CheckCircleIcon className="w-5 h-5 text-emerald-700 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-900">Kanzleipaket freigegeben</p>
          <p className="text-xs text-emerald-800">Regulierung läuft.</p>
        </div>
      </div>
    )
  }

  if (!hatGutachten) {
    return (
      <div className="rounded-2xl bg-[#f8f9fb] border border-claimondo-border px-4 py-3 text-sm text-claimondo-ondo">
        Vollständigkeits-Check erscheint sobald der Gutachter sein Gutachten hochgeladen hat.
      </div>
    )
  }

  // CMM-32e: Reject-Zustand — KB hat Nachbesserung gefordert, wartet auf SV.
  if (zurueckgewiesenAm) {
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-300 px-4 sm:px-6 py-4 space-y-2">
        <div className="flex items-start gap-3">
          <ArrowLeftCircleIcon className="w-5 h-5 shrink-0 text-amber-700 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">Nachbesserung angefordert</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Wartet auf korrigiertes Gutachten vom SV. Sobald die neue Version eintrifft, taucht hier wieder der Freigabe-Button auf.
            </p>
            {zurueckweisungGrund && (
              <p className="text-xs text-amber-900 mt-2 bg-white/60 border border-amber-200 rounded-lg px-3 py-2 whitespace-pre-line">
                <strong>Begründung:</strong> {zurueckweisungGrund}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  const fehlende = pflichtItems.filter((p) => p.pflicht && !p.vorhanden)
  // CMM-32e: Korrektur eingereicht — grund bleibt für Audit, _am ist null.
  const istKorrekturEingereicht = !!zurueckweisungGrund && !zurueckgewiesenAm

  function handleFreigeben() {
    setError(null)
    startTransition(async () => {
      const r = await gibKanzleipaketFrei(auftragId)
      if (!r.ok) setError(r.error ?? 'Freigabe fehlgeschlagen')
      else router.refresh()
    })
  }

  function handleZurueckweisen() {
    if (!rejectGrund.trim()) {
      setError('Bitte Begründung eingeben.')
      return
    }
    setError(null)
    startTransition(async () => {
      const r = await weiseGutachtenZurueck(auftragId, rejectGrund.trim())
      if (!r.ok) setError(r.error ?? 'Zurückweisung fehlgeschlagen')
      else {
        setRejectMode(false)
        setRejectGrund('')
        router.refresh()
      }
    })
  }

  return (
    <div className="rounded-2xl bg-white border border-violet-200 px-4 sm:px-6 py-5 space-y-4">
      <div className="flex items-start gap-3">
        <FileTextIcon className="w-5 h-5 shrink-0 text-violet-600 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-violet-900">
            {istKorrekturEingereicht ? 'Korrigierte Version eingereicht' : 'Vollständigkeits-Check'}
          </p>
          <p className="text-xs text-violet-700 mt-0.5">
            {istKorrekturEingereicht
              ? 'SV hat das Gutachten überarbeitet. Prüfe die neue Version und gib das Kanzleipaket frei oder fordere erneut Nachbesserung an.'
              : 'Prüfe ob das Gutachten + alle Pflichtdokumente vorliegen, dann gib das Kanzleipaket frei.'}
          </p>
          {istKorrekturEingereicht && zurueckweisungGrund && (
            <p className="text-[11px] text-violet-700/80 mt-1 italic">
              Vorherige Begründung: „{zurueckweisungGrund}"
            </p>
          )}
        </div>
      </div>

      {/* Hauptgutachten */}
      {hauptgutachten && (
        <div className="flex items-center gap-2 text-sm border-t border-claimondo-border pt-3">
          <FileTextIcon className="w-4 h-4 text-claimondo-navy shrink-0" />
          <span className="font-medium text-claimondo-navy flex-1 truncate">{hauptgutachten.filename}</span>
          <span className="text-[10px] uppercase tracking-wider text-violet-700 font-semibold">Hauptgutachten</span>
          <a
            href={hauptgutachten.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-claimondo-ondo hover:text-claimondo-navy"
            title="Öffnen"
          >
            <DownloadIcon className="w-4 h-4" />
          </a>
        </div>
      )}

      {/* Anlagen */}
      {anlagen.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo">
            Anlagen ({anlagen.length})
          </p>
          {anlagen.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-claimondo-ondo/40" />
              <span className="text-claimondo-navy flex-1 truncate">{a.filename}</span>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-claimondo-ondo hover:text-claimondo-navy"
              >
                <DownloadIcon className="w-3 h-3" />
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Pflichtdokumente */}
      <div className="space-y-1.5 border-t border-claimondo-border pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo">
          Pflichtdokumente
        </p>
        {pflichtItems.length === 0 && (
          <p className="text-xs text-claimondo-ondo/70">Keine Pflichtdokumente konfiguriert.</p>
        )}
        {pflichtItems.map((p) => (
          <div key={p.slot_id} className="flex items-center gap-2 text-xs">
            {p.vorhanden ? (
              <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircleIcon className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            )}
            <span
              className={
                p.vorhanden
                  ? 'text-claimondo-navy'
                  : p.pflicht
                    ? 'text-amber-700 font-medium'
                    : 'text-claimondo-ondo/70'
              }
            >
              {p.label}
            </span>
            {!p.pflicht && <span className="text-[10px] text-claimondo-ondo/60">(optional)</span>}
          </div>
        ))}
      </div>

      {/* Buttons (nur wenn nicht in Reject-Wartemodus) */}
      {!rejectMode ? (
        <div className="border-t border-claimondo-border pt-3 flex items-center justify-between gap-3 flex-wrap">
          {fehlende.length > 0 ? (
            <p className="text-xs text-amber-700 flex-1 min-w-[160px]">
              {fehlende.length} Pflichtdokument{fehlende.length === 1 ? '' : 'e'} fehl
              {fehlende.length === 1 ? 't' : 'en'} — Freigabe trotzdem möglich (Nachreichung wird beim Kunden angefordert).
            </p>
          ) : (
            <p className="text-xs text-emerald-700 flex-1 min-w-[160px]">Alles vollständig.</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setRejectMode(true)}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-claimondo-border hover:bg-[#f8f9fb] text-claimondo-navy text-sm font-semibold px-4 py-2 transition-colors"
            >
              <ArrowLeftCircleIcon className="w-4 h-4" />
              Nachbesserung anfordern
            </button>
            <button
              onClick={handleFreigeben}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-sm font-semibold px-4 py-2 transition-colors"
            >
              {pending ? 'Wird freigegeben…' : 'Kanzleipaket freigeben'}
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-claimondo-border pt-3 space-y-2">
          <label className="text-xs font-semibold text-claimondo-navy">
            Was muss der Gutachter korrigieren?
          </label>
          <textarea
            value={rejectGrund}
            onChange={(e) => setRejectGrund(e.target.value)}
            rows={3}
            placeholder="z.B. Kostenposition X fehlt, Foto Y unscharf …"
            className="w-full rounded-lg border border-claimondo-border bg-white px-3 py-2 text-sm placeholder:text-claimondo-ondo/60 focus:outline-none focus:ring-2 focus:ring-claimondo-navy/30"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setRejectMode(false); setRejectGrund(''); setError(null) }}
              disabled={pending}
              className="text-sm text-claimondo-ondo hover:text-claimondo-navy px-3 py-2"
            >
              Abbrechen
            </button>
            <button
              onClick={handleZurueckweisen}
              disabled={pending || !rejectGrund.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-semibold px-4 py-2 transition-colors"
            >
              {pending ? 'Wird gesendet…' : 'Nachbesserung anfordern'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
