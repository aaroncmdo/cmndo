'use client'

// Shared Rückruftermin-Panel — wird sowohl als Modal-Inhalt (Rückrufe-Liste)
// als auch inline in der Lead-Sidebar gerendert.
// Features: Termin bearbeiten, vollständige Notiz, Anruf-Aktivität abhaken,
//           Dispatch-Link (weiterarbeiten), Anruf-Historie.

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { saveRueckruf, markRueckrufErledigt } from './_actions/rueckruf'
import { markAngerufen, markNichtErreicht } from '@/app/dispatch/rueckrufe/actions'
import {
  PhoneCallIcon,
  CheckCircle2Icon,
  CheckIcon,
  XIcon,
  ArrowRightIcon,
  ClockIcon,
  HistoryIcon,
  Loader2Icon,
} from 'lucide-react'

export type RueckrufInitialData = {
  startZeit?: string | null
  notizen?: string | null
  terminStatus?: 'offen' | 'erledigt' | 'abgesagt' | null
  anrufVersuche?: number
  letzterAnrufAm?: string | null
  letzterAnrufStatus?: string | null
  qualifizierungsPhase?: string | null
}

type HistorieEntry = {
  id: string
  start_zeit: string
  status: string
  notizen: string | null
}

function fmtDt(iso: string) {
  return new Date(iso).toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function RueckrufTerminPanel({
  leadId,
  initial,
  onActionDone,
}: {
  leadId: string
  /** Optionale Schnell-Initialisierung — spart initialen Supabase-Fetch. */
  initial?: RueckrufInitialData
  /** Wird nach erfolgreicher Aktion aufgerufen (z.B. Modal schließen). */
  onActionDone?: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [datum, setDatum] = useState(initial?.startZeit ? toLocalInput(initial.startZeit) : '')
  const [notiz, setNotiz] = useState(initial?.notizen ?? '')
  const [terminStatus, setTerminStatus] = useState<string | null>(initial?.terminStatus ?? null)
  const [anrufVersuche, setAnrufVersuche] = useState(initial?.anrufVersuche ?? 0)
  const [letzterAnrufAm, setLetzterAnrufAm] = useState(initial?.letzterAnrufAm ?? null)
  const [letzterAnrufStatus, setLetzterAnrufStatus] = useState(initial?.letzterAnrufStatus ?? null)
  const [history, setHistory] = useState<HistorieEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [termineRes, leadRes] = await Promise.all([
      supabase
        .from('admin_termine')
        .select('id, start_zeit, status, notizen')
        .eq('lead_id', leadId)
        .eq('typ', 'rueckruf')
        .order('start_zeit', { ascending: false })
        .limit(20),
      supabase
        .from('leads')
        .select('anruf_versuche, letzter_anruf_am, letzter_anruf_status')
        .eq('id', leadId)
        .maybeSingle(),
    ])

    const alle = (termineRes.data ?? []) as HistorieEntry[]
    const offener = alle.find((t) => t.status === 'offen') ?? null

    if (offener) {
      setDatum(toLocalInput(offener.start_zeit))
      setNotiz(offener.notizen ?? '')
      setTerminStatus('offen')
    } else {
      setDatum('')
      setNotiz('')
      setTerminStatus(null)
    }

    setHistory(alle.filter((t) => t.status !== 'offen'))

    if (leadRes.data) {
      setAnrufVersuche(leadRes.data.anruf_versuche ?? 0)
      setLetzterAnrufAm(leadRes.data.letzter_anruf_am ?? null)
      setLetzterAnrufStatus(leadRes.data.letzter_anruf_status ?? null)
    }
    setLoading(false)
  }, [leadId])

  useEffect(() => {
    // Wenn keine initial-Daten: sofort laden. Ansonsten nur Verlauf nachladen.
    if (!initial) {
      void load()
    } else {
      const supabase = createClient()
      supabase
        .from('admin_termine')
        .select('id, start_zeit, status, notizen')
        .eq('lead_id', leadId)
        .eq('typ', 'rueckruf')
        .neq('status', 'offen')
        .order('start_zeit', { ascending: false })
        .limit(20)
        .then(({ data }) => setHistory((data ?? []) as HistorieEntry[]))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])

  async function handleSave() {
    setError(null)
    startTransition(async () => {
      const r = await saveRueckruf(
        leadId,
        datum ? new Date(datum).toISOString() : null,
        notiz || null,
      )
      if (r.success) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
        await load()
        router.refresh()
      } else {
        setError(r.error ?? 'Speichern fehlgeschlagen')
      }
    })
  }

  async function handleErledigt() {
    setError(null)
    startTransition(async () => {
      const r = await markRueckrufErledigt(leadId)
      if (r.success) {
        await load()
        router.refresh()
        onActionDone?.()
      } else {
        setError(r.error ?? 'Fehler')
      }
    })
  }

  async function handleAngerufen() {
    setError(null)
    startTransition(async () => {
      try {
        await markAngerufen(leadId)
        await load()
        router.refresh()
        onActionDone?.()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Fehler')
      }
    })
  }

  async function handleNichtErreicht() {
    setError(null)
    startTransition(async () => {
      try {
        await markNichtErreicht(leadId)
        await load()
        router.refresh()
        onActionDone?.()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Fehler')
      }
    })
  }

  const inPast = !!datum && new Date(datum) < new Date()

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <PhoneCallIcon className="w-4 h-4 text-amber-500 shrink-0" />
        <span className="text-sm font-semibold text-claimondo-navy">Rückruftermin</span>
        {loading && <Loader2Icon className="w-3.5 h-3.5 text-claimondo-ondo/60 animate-spin ml-auto" />}
        {!loading && terminStatus === 'erledigt' && (
          <span className="ml-auto text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
            Erledigt
          </span>
        )}
        {!loading && terminStatus === 'offen' && inPast && (
          <span className="ml-auto text-[10px] font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
            Überfällig
          </span>
        )}
      </div>

      {/* Bearbeitungsform */}
      <div className="space-y-2.5">
        <div>
          <label className="text-[11px] font-medium text-claimondo-ondo block mb-1">
            Datum &amp; Uhrzeit
          </label>
          <input
            type="datetime-local"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            disabled={pending || loading}
            className="w-full bg-[#f8f9fb] border border-claimondo-border text-claimondo-navy text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-claimondo-ondo disabled:opacity-60"
          />
        </div>
        <div>
          <label className="text-[11px] font-medium text-claimondo-ondo block mb-1">Notiz</label>
          <textarea
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            disabled={pending || loading}
            rows={3}
            placeholder="z.B. Kunde ab 14 Uhr erreichbar, fragt nach Kosten …"
            className="w-full bg-[#f8f9fb] border border-claimondo-border text-claimondo-navy text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-claimondo-ondo placeholder-claimondo-ondo/40 disabled:opacity-60 resize-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleSave}
          disabled={pending || loading}
          className="px-4 py-2 rounded-xl bg-claimondo-ondo hover:bg-claimondo-navy text-white text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {pending ? 'Speichert …' : 'Termin speichern'}
        </button>
        {terminStatus === 'offen' && (
          <button
            onClick={handleErledigt}
            disabled={pending || loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            <CheckCircle2Icon className="w-3.5 h-3.5" />
            Rückruf erledigt
          </button>
        )}
        {saved && <span className="text-xs text-emerald-600 font-medium">Gespeichert ✓</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      <div className="border-t border-claimondo-border" />

      {/* Anruf-Aktivität */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo mb-2">
          Anruf-Aktivität
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleAngerufen}
            disabled={pending || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium disabled:opacity-50 transition-colors"
          >
            <CheckIcon className="w-3.5 h-3.5" />
            Angerufen ✓
          </button>
          <button
            onClick={handleNichtErreicht}
            disabled={pending || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-claimondo-border text-claimondo-navy text-xs font-medium hover:bg-[#f8f9fb] disabled:opacity-50 transition-colors"
          >
            <XIcon className="w-3.5 h-3.5" />
            Nicht erreicht
            {anrufVersuche > 0 && (
              <span className="text-[9px] text-red-500 ml-0.5">
                ({anrufVersuche}/2)
              </span>
            )}
          </button>
        </div>
        {(letzterAnrufAm || anrufVersuche > 0) && (
          <p className="text-[11px] text-claimondo-ondo/70 mt-1.5">
            {anrufVersuche} Versuch{anrufVersuche !== 1 ? 'e' : ''} · Letzter:{' '}
            {letzterAnrufAm ? fmtDt(letzterAnrufAm) : '—'}
            {letzterAnrufStatus === 'erreicht' && ' (erreicht)'}
            {letzterAnrufStatus === 'nicht_erreicht' && ' (nicht erreicht)'}
          </p>
        )}
      </div>

      {/* Dispatch fortsetzen */}
      <Link
        href={`/dispatch/leads/${leadId}`}
        className="flex items-center justify-between gap-2 w-full rounded-xl border border-claimondo-border bg-[#f8f9fb] hover:border-claimondo-ondo hover:bg-white px-3 py-2.5 transition-colors group"
      >
        <div>
          <p className="text-xs font-semibold text-claimondo-navy">Dispatch fortsetzen</p>
          <p className="text-[11px] text-claimondo-ondo">Lead-Maske öffnen und weiterarbeiten</p>
        </div>
        <ArrowRightIcon className="w-4 h-4 text-claimondo-ondo/60 group-hover:translate-x-0.5 transition-transform shrink-0" />
      </Link>

      {/* Verlauf */}
      {history.length > 0 && (
        <>
          <div className="border-t border-claimondo-border" />
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <HistoryIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo">
                Verlauf
              </p>
            </div>
            <ul className="space-y-1.5">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="flex items-start gap-2 rounded-xl bg-[#f8f9fb] border border-claimondo-border px-3 py-2"
                >
                  <ClockIcon className="w-3.5 h-3.5 text-claimondo-ondo/50 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-medium text-claimondo-navy">
                        {fmtDt(h.start_zeit)}
                      </span>
                      <span
                        className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                          h.status === 'erledigt'
                            ? 'bg-emerald-100 text-emerald-800'
                            : h.status === 'abgesagt'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {h.status === 'erledigt'
                          ? 'Erledigt'
                          : h.status === 'abgesagt'
                            ? 'Abgesagt'
                            : 'Offen'}
                      </span>
                    </div>
                    {h.notizen && (
                      <p className="text-[11px] text-claimondo-ondo mt-0.5 whitespace-pre-line">
                        {h.notizen}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
