'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  ReceiptIcon, AlertTriangleIcon, CheckCircle2Icon, ClockIcon, RefreshCwIcon,
  ExternalLinkIcon, XIcon,
} from 'lucide-react'
import { retryEinzug, markBezahlt } from './actions'

// KFZ-149 Hund-D: Listing aller SV-Monatsabrechnungen mit Filter,
// Detail-Modal, manuellem Retry und Manuell-bezahlt Button.

type Row = {
  id: string
  abrechnungs_nr: string
  empfaenger_typ: string | null
  empfaenger_name: string | null
  empfaenger_email: string | null
  summe_netto: number
  summe_brutto: number
  status: string
  faellig_am: string | null
  versand_datum: string | null
  bezahlt_am: string | null
  bezahlt_betrag: number | null
  einzug_versucht_am: string | null
  einzug_fehler: string | null
  stripe_payment_intent_id: string | null
  reminder_gesendet_am: string | null
  storniert_am: string | null
  created_at: string | null
  notiz: string | null
}

type FilterKey = 'offen' | 'faellig' | 'bezahlt' | 'fehlgeschlagen' | 'alle'

function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function isFaellig(row: Row): boolean {
  if (row.bezahlt_am || row.storniert_am) return false
  if (!row.faellig_am) return false
  return new Date(row.faellig_am) <= new Date()
}

function statusBadge(row: Row): { label: string; bg: string; text: string; dot: string } {
  if (row.storniert_am) return { label: 'Storniert', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' }
  if (row.bezahlt_am) return { label: 'Bezahlt', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' }
  if (row.status === 'fehlgeschlagen' || row.einzug_fehler) return { label: 'Fehlgeschlagen', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' }
  if (isFaellig(row)) return { label: 'Faellig', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' }
  if (row.status === 'versendet') return { label: 'Versendet', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' }
  return { label: 'Offen', bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' }
}

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: 'offen', label: 'Offen' },
  { key: 'faellig', label: 'Faellig' },
  { key: 'fehlgeschlagen', label: 'Fehlgeschlagen' },
  { key: 'bezahlt', label: 'Bezahlt' },
  { key: 'alle', label: 'Alle' },
]

export default function AbrechnungenListClient({ rows }: { rows: Row[] }) {
  const [filter, setFilter] = useState<FilterKey>('offen')
  const [selected, setSelected] = useState<Row | null>(null)
  const [actionMsg, setActionMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const [confirmMarkBezahlt, setConfirmMarkBezahlt] = useState(false)
  const [bezahltNotiz, setBezahltNotiz] = useState('')

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filter === 'alle') return true
      if (filter === 'bezahlt') return !!r.bezahlt_am
      if (filter === 'fehlgeschlagen') return r.status === 'fehlgeschlagen' || (!!r.einzug_fehler && !r.bezahlt_am)
      if (filter === 'faellig') return isFaellig(r) && r.status !== 'fehlgeschlagen'
      // offen: noch nicht bezahlt, nicht storniert, nicht fehlgeschlagen
      return !r.bezahlt_am && !r.storniert_am && r.status !== 'fehlgeschlagen'
    }).sort((a, b) => {
      // sortiert nach faellig_am desc (default), null nach hinten
      const av = a.faellig_am ?? ''
      const bv = b.faellig_am ?? ''
      if (av === bv) return 0
      if (!av) return 1
      if (!bv) return -1
      return av < bv ? 1 : -1
    })
  }, [rows, filter])

  const counts = useMemo(() => ({
    offen: rows.filter(r => !r.bezahlt_am && !r.storniert_am && r.status !== 'fehlgeschlagen').length,
    faellig: rows.filter(r => isFaellig(r) && r.status !== 'fehlgeschlagen').length,
    fehlgeschlagen: rows.filter(r => r.status === 'fehlgeschlagen' || (!!r.einzug_fehler && !r.bezahlt_am)).length,
    bezahlt: rows.filter(r => !!r.bezahlt_am).length,
    alle: rows.length,
  }), [rows])

  function handleRetry(row: Row) {
    setActionMsg(null)
    startTransition(async () => {
      const r = await retryEinzug(row.id)
      if (r.success) {
        setActionMsg({ kind: 'success', text: `Einzug erfolgreich (PaymentIntent ${r.payment_intent_id?.slice(0, 18)}…)` })
        setSelected(null)
      } else {
        setActionMsg({ kind: 'error', text: r.error ?? 'Unbekannter Fehler' })
      }
    })
  }

  function handleMarkBezahlt(row: Row) {
    setActionMsg(null)
    startTransition(async () => {
      const r = await markBezahlt(row.id, bezahltNotiz || undefined)
      if (r.success) {
        setActionMsg({ kind: 'success', text: `${row.abrechnungs_nr} als bezahlt markiert` })
        setConfirmMarkBezahlt(false)
        setBezahltNotiz('')
        setSelected(null)
      } else {
        setActionMsg({ kind: 'error', text: r.error ?? 'Unbekannter Fehler' })
      }
    })
  }

  return (
    <div className="px-8 py-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Abrechnungen</h1>
          <p className="text-sm text-gray-500 mt-1">SV-Monatsabrechnungen, Reminder + Lastschrift-Einzug</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <ReceiptIcon className="w-4 h-4" />
          {rows.length} Eintrag(e) insgesamt
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-5">
        {FILTER_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === t.key
                ? 'bg-[#1E3A5F] text-white'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
            }`}
          >
            {t.label} <span className="opacity-70 ml-1">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {/* Action message */}
      {actionMsg && (
        <div className={`mb-4 px-3 py-2.5 rounded-xl text-sm border ${
          actionMsg.kind === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {actionMsg.text}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">Keine Eintraege im Filter <strong>{FILTER_TABS.find(t => t.key === filter)?.label}</strong>.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">Rechnung</th>
                <th className="text-left px-4 py-3">Empfaenger</th>
                <th className="text-right px-4 py-3">Betrag</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Faellig</th>
                <th className="text-left px-4 py-3">Bezahlt</th>
                <th className="text-right px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(r => {
                const badge = statusBadge(r)
                return (
                  <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-gray-900">{r.abrechnungs_nr}</div>
                      <div className="text-[10px] text-gray-400">erstellt {fmtDate(r.created_at)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900">{r.empfaenger_name ?? '—'}</div>
                      <div className="text-[10px] text-gray-400">{r.empfaenger_email ?? '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtEur(r.summe_brutto)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-medium ${badge.bg} ${badge.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{fmtDate(r.faellig_am)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{fmtDate(r.bezahlt_am)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { setSelected(r); setConfirmMarkBezahlt(false); setBezahltNotiz('') }}
                        className="text-xs text-[#1E3A5F] hover:text-[#4573A2] underline"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail Modal */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-400">Abrechnung</p>
                <h2 className="text-lg font-semibold text-gray-900 font-mono">{selected.abrechnungs_nr}</h2>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-sm">
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-4">
                <Info label="Empfaenger" value={selected.empfaenger_name ?? '—'} />
                <Info label="Email" value={selected.empfaenger_email ?? '—'} />
                <Info label="Betrag (netto)" value={fmtEur(selected.summe_netto)} />
                <Info label="Betrag (brutto)" value={fmtEur(selected.summe_brutto)} highlight />
                <Info label="Faellig am" value={fmtDate(selected.faellig_am)} />
                <Info label="Versendet am" value={fmtDate(selected.versand_datum)} />
                <Info label="Bezahlt am" value={fmtDate(selected.bezahlt_am)} />
                <Info label="Reminder gesendet" value={fmtDate(selected.reminder_gesendet_am)} />
              </div>

              {/* Status */}
              {(() => {
                const b = statusBadge(selected)
                return (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">Status</p>
                    <span className={`inline-flex items-center gap-2 text-sm px-3 py-1 rounded-full font-medium ${b.bg} ${b.text}`}>
                      <span className={`w-2 h-2 rounded-full ${b.dot}`} />
                      {b.label}
                    </span>
                    {selected.einzug_versucht_am && (
                      <p className="text-xs text-gray-500 mt-2 flex items-center gap-1.5">
                        <ClockIcon className="w-3.5 h-3.5" /> Letzter Einzugs-Versuch: {fmtDate(selected.einzug_versucht_am)}
                      </p>
                    )}
                  </div>
                )
              })()}

              {/* Fehler-Details */}
              {selected.einzug_fehler && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangleIcon className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-red-700">
                      <p className="font-semibold mb-1">Einzugs-Fehler</p>
                      <p className="break-words">{selected.einzug_fehler}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Stripe link */}
              {selected.stripe_payment_intent_id && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Stripe PaymentIntent</p>
                  <a
                    href={`https://dashboard.stripe.com/payments/${selected.stripe_payment_intent_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#4573A2] hover:text-[#1E3A5F] underline font-mono"
                  >
                    {selected.stripe_payment_intent_id}
                    <ExternalLinkIcon className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* Notiz */}
              {selected.notiz && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Notiz</p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap">{selected.notiz}</p>
                </div>
              )}

              {/* Action buttons */}
              {!selected.bezahlt_am && !selected.storniert_am && (
                <div className="pt-4 border-t border-gray-200 space-y-3">
                  {(selected.status === 'fehlgeschlagen' || selected.einzug_fehler) && (
                    <button
                      onClick={() => handleRetry(selected)}
                      disabled={pending}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#4573A2] hover:bg-[#1E3A5F] text-white text-sm font-medium transition-colors disabled:opacity-40"
                    >
                      <RefreshCwIcon className="w-4 h-4" />
                      {pending ? 'Wird verarbeitet...' : 'Einzug erneut versuchen'}
                    </button>
                  )}

                  {!confirmMarkBezahlt ? (
                    <button
                      onClick={() => setConfirmMarkBezahlt(true)}
                      disabled={pending}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-sm font-medium transition-colors disabled:opacity-40"
                    >
                      <CheckCircle2Icon className="w-4 h-4" />
                      Manuell als bezahlt markieren
                    </button>
                  ) : (
                    <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50/50 space-y-2">
                      <p className="text-xs text-emerald-800">
                        <strong>Bestaetigung:</strong> {fmtEur(selected.summe_brutto)} als bezahlt markieren?
                        Optional: kurze Notiz (z.B. „Bank-Ueberweisung 09.04.2026").
                      </p>
                      <textarea
                        value={bezahltNotiz}
                        onChange={e => setBezahltNotiz(e.target.value)}
                        placeholder="Notiz (optional)..."
                        rows={2}
                        className="w-full bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-300"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setConfirmMarkBezahlt(false); setBezahltNotiz('') }}
                          disabled={pending}
                          className="flex-1 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          Abbrechen
                        </button>
                        <button
                          onClick={() => handleMarkBezahlt(selected)}
                          disabled={pending}
                          className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium disabled:opacity-40"
                        >
                          {pending ? '...' : 'Ja, als bezahlt'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Info({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`text-sm mt-0.5 ${highlight ? 'font-semibold text-[#1E3A5F]' : 'text-gray-800'}`}>{value}</p>
    </div>
  )
}
