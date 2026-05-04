'use client'

// Shared Rückruftermin-Panel — wird sowohl als Modal-Inhalt (Rückrufe-Liste)
// als auch inline in der Lead-Sidebar gerendert.
// Features: Termin bearbeiten, vollständige Notiz, Anruf-Aktivität abhaken,
//           Dispatch-Link (weiterarbeiten), Anruf-Historie.

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { saveRueckruf } from './_actions/rueckruf'
import { markRueckrufErledigtMitErgebnis } from '@/app/dispatch/rueckrufe/actions'
import {
  PhoneCallIcon,
  CheckCircle2Icon,
  ArrowRightIcon,
  HistoryIcon,
  Loader2Icon,
  CalendarClockIcon,
  PhoneIncomingIcon,
  PhoneMissedIcon,
  PhoneOffIcon,
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

type VerlaufEntry = {
  id: string
  zeitpunkt: string
  /** 'termin' = admin_termine-Eintrag; 'anruf' = anruf_log-Eintrag */
  typ: 'termin' | 'anruf'
  status: string
  notiz: string | null
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
  const [history, setHistory] = useState<VerlaufEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Erledigen-Flow
  const [erledigenOffen, setErledigenOffen] = useState(false)
  const [ergebnis, setErgebnis] = useState<'erreicht' | 'nicht_erreicht'>('erreicht')
  const [ergebnisNotiz, setErgebnisNotiz] = useState('')
  const [folgetermin, setFolgetermin] = useState('')

  const loadVerlauf = useCallback(async () => {
    const supabase = createClient()
    const [termineRes, anrufRes] = await Promise.all([
      supabase
        .from('admin_termine')
        .select('id, start_zeit, status, notizen')
        .eq('lead_id', leadId)
        .eq('typ', 'rueckruf')
        .neq('status', 'offen')
        .order('start_zeit', { ascending: false })
        .limit(20),
      supabase
        .from('anruf_log')
        .select('id, zeitpunkt, status, notiz')
        .eq('lead_id', leadId)
        .order('zeitpunkt', { ascending: false })
        .limit(30),
    ])
    const termine: VerlaufEntry[] = (termineRes.data ?? []).map((t) => ({
      id: t.id as string,
      zeitpunkt: t.start_zeit as string,
      typ: 'termin' as const,
      status: t.status as string,
      notiz: t.notizen as string | null,
    }))
    const anrufe: VerlaufEntry[] = (anrufRes.data ?? []).map((a) => ({
      id: a.id as string,
      zeitpunkt: a.zeitpunkt as string,
      typ: 'anruf' as const,
      status: a.status as string,
      notiz: a.notiz as string | null,
    }))
    // Zusammenführen, absteigend nach Zeitpunkt sortieren
    const merged = [...termine, ...anrufe].sort(
      (a, b) => new Date(b.zeitpunkt).getTime() - new Date(a.zeitpunkt).getTime(),
    )
    setHistory(merged)
  }, [leadId])

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

    const alle = (termineRes.data ?? []) as Array<{ id: string; start_zeit: string; status: string; notizen: string | null }>
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

    if (leadRes.data) {
      setAnrufVersuche(leadRes.data.anruf_versuche ?? 0)
    }

    await loadVerlauf()
    setLoading(false)
  }, [leadId, loadVerlauf])

  useEffect(() => {
    if (!initial) {
      void load()
    } else {
      void loadVerlauf()
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

  async function handleErledigenAbschicken() {
    setError(null)
    startTransition(async () => {
      const r = await markRueckrufErledigtMitErgebnis(
        leadId,
        ergebnis,
        ergebnisNotiz || null,
        ergebnis === 'nicht_erreicht' && folgetermin ? new Date(folgetermin).toISOString() : null,
      )
      if (r.ok) {
        setErledigenOffen(false)
        setErgebnisNotiz('')
        setFolgetermin('')
        if (ergebnis === 'nicht_erreicht') setAnrufVersuche((v) => v + 1)
        await load()
        router.refresh()
        if (ergebnis === 'erreicht') onActionDone?.()
      } else {
        setError(r.error ?? 'Fehler')
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
        {saved && <span className="text-xs text-emerald-600 font-medium">Gespeichert ✓</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      <div className="border-t border-claimondo-border" />

      {/* Rückruf erledigen */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo mb-2">
          Anruf durchgeführt
        </p>

        {!erledigenOffen ? (
          <button
            onClick={() => setErledigenOffen(true)}
            disabled={pending || loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            <CheckCircle2Icon className="w-3.5 h-3.5" />
            Rückruf erledigt
            {anrufVersuche > 0 && (
              <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full ml-1">
                {anrufVersuche} Versuch{anrufVersuche !== 1 ? 'e' : ''}
              </span>
            )}
          </button>
        ) : (
          <div className="rounded-xl border border-claimondo-border bg-[#f8f9fb] p-3 space-y-3">
            {/* Ergebnis */}
            <div>
              <p className="text-[11px] font-medium text-claimondo-ondo mb-1.5">Ergebnis</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setErgebnis('erreicht')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    ergebnis === 'erreicht'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-claimondo-navy border-claimondo-border hover:bg-emerald-50'
                  }`}
                >
                  <PhoneIncomingIcon className="w-3 h-3" />
                  Erreicht
                </button>
                <button
                  onClick={() => setErgebnis('nicht_erreicht')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    ergebnis === 'nicht_erreicht'
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-claimondo-navy border-claimondo-border hover:bg-red-50'
                  }`}
                >
                  <PhoneOffIcon className="w-3 h-3" />
                  Nicht erreicht
                </button>
              </div>
            </div>

            {/* Notiz */}
            <div>
              <label className="text-[11px] font-medium text-claimondo-ondo block mb-1">
                Notiz (Gesprächsinhalt / Ergebnis)
              </label>
              <textarea
                value={ergebnisNotiz}
                onChange={(e) => setErgebnisNotiz(e.target.value)}
                rows={2}
                placeholder="z.B. Kunde bestätigt Termin am Freitag …"
                className="w-full bg-white border border-claimondo-border text-claimondo-navy text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-claimondo-ondo placeholder-claimondo-ondo/40 resize-none"
              />
            </div>

            {/* Folgetermin nur wenn nicht erreicht */}
            {ergebnis === 'nicht_erreicht' && (
              <div>
                <label className="text-[11px] font-medium text-claimondo-ondo block mb-1">
                  Nächsten Rückruf planen (optional)
                </label>
                <input
                  type="datetime-local"
                  value={folgetermin}
                  onChange={(e) => setFolgetermin(e.target.value)}
                  className="w-full bg-white border border-claimondo-border text-claimondo-navy text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-claimondo-ondo"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={handleErledigenAbschicken}
                disabled={pending}
                className="px-4 py-1.5 rounded-lg bg-claimondo-ondo hover:bg-claimondo-navy text-white text-xs font-medium disabled:opacity-50 transition-colors"
              >
                {pending ? 'Speichert …' : 'Speichern'}
              </button>
              <button
                onClick={() => { setErledigenOffen(false); setErgebnisNotiz(''); setFolgetermin('') }}
                disabled={pending}
                className="px-3 py-1.5 rounded-lg border border-claimondo-border text-claimondo-navy text-xs font-medium hover:bg-[#f8f9fb] disabled:opacity-50 transition-colors"
              >
                Abbrechen
              </button>
            </div>
          </div>
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
              {history.map((h) => {
                const isAnruf = h.typ === 'anruf'
                const Icon = isAnruf
                  ? h.status === 'erreicht'
                    ? PhoneIncomingIcon
                    : PhoneMissedIcon
                  : CalendarClockIcon
                const iconColor = isAnruf
                  ? h.status === 'erreicht'
                    ? 'text-emerald-600'
                    : 'text-red-500'
                  : 'text-claimondo-ondo/50'

                let badgeText: string
                let badgeClass: string
                if (isAnruf) {
                  if (h.status === 'erreicht') {
                    badgeText = 'Erreicht'
                    badgeClass = 'bg-emerald-100 text-emerald-800'
                  } else {
                    badgeText = 'Nicht erreicht'
                    badgeClass = 'bg-red-100 text-red-700'
                  }
                } else {
                  if (h.status === 'erledigt') {
                    badgeText = 'Termin erledigt'
                    badgeClass = 'bg-emerald-100 text-emerald-800'
                  } else if (h.status === 'abgesagt') {
                    badgeText = 'Termin abgesagt'
                    badgeClass = 'bg-red-100 text-red-700'
                  } else {
                    badgeText = 'Termin'
                    badgeClass = 'bg-amber-100 text-amber-700'
                  }
                }

                return (
                  <li
                    key={`${h.typ}-${h.id}`}
                    className="flex items-start gap-2 rounded-xl bg-[#f8f9fb] border border-claimondo-border px-3 py-2"
                  >
                    <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${iconColor}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-medium text-claimondo-navy">
                          {fmtDt(h.zeitpunkt)}
                        </span>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${badgeClass}`}>
                          {badgeText}
                        </span>
                      </div>
                      {h.notiz && (
                        <p className="text-[11px] text-claimondo-ondo mt-0.5 whitespace-pre-line">
                          {h.notiz}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
