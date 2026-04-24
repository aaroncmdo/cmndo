'use client'

// AAR-92: Maik-Provisionen Client UI mit Inline-CPL + Confirm/Reverse
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { setCpl, confirmProvision, reverseProvision, markMonthAsPaid } from './actions'

type Provision = {
  id: string
  lead_id: string
  monat: string
  basis_provision: number
  cpl_actual: number | null
  netto_provision: number
  status: string
  source_channel: string | null
  reversed_grund: string | null
  created_at: string
  paid_at: string | null
  leads: { vorname: string | null; nachname: string | null; source_channel: string | null } | { vorname: string | null; nachname: string | null; source_channel: string | null }[] | null
}

type Props = {
  provisionen: Provision[]
  monat: string
  months: string[]
  kpi: { total: number; pending: number; confirmed: number; sumPending: number; sumConfirmed: number }
}

export default function ProvisionenClient({ provisionen, monat, months, kpi }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState<Record<string, string>>({})

  function handleSetCpl(id: string) {
    const val = parseFloat(editing[id])
    if (isNaN(val)) return
    startTransition(async () => {
      await setCpl(id, val)
      setEditing(p => { const next = { ...p }; delete next[id]; return next })
    })
  }

  function handleConfirm(id: string) {
    startTransition(async () => { await confirmProvision(id) })
  }

  function handleReverse(id: string) {
    const grund = window.prompt('Grund für Reversion?')
    if (!grund) return
    startTransition(async () => { await reverseProvision(id, grund) })
  }

  // AAR-153: Bulk-Auszahlung pro Monat — markiert alle confirmed als paid.
  function handleMarkMonthPaid() {
    if (kpi.confirmed === 0) return
    const ok = window.confirm(
      `Alle ${kpi.confirmed} bestätigten Provisionen im Monat ${monat} als bezahlt markieren (${kpi.sumConfirmed.toFixed(2)} €)?`,
    )
    if (!ok) return
    startTransition(async () => {
      const r = await markMonthAsPaid(monat)
      if (!r.success && r.error) window.alert(`Fehler: ${r.error}`)
      else router.refresh()
    })
  }

  return (
    <div className="py-6 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-claimondo-navy">Maik-Provisionen (Google Ads)</h1>
          <p className="text-sm text-claimondo-ondo mt-1">
            150&nbsp;€ pro Lead minus tatsächlicher CPL. CPL aus Google-Ads-Reports nachtragen.
          </p>
        </div>
        {/* AAR-153: „Als bezahlt markieren"-Button pro Monat */}
        <button
          type="button"
          disabled={pending || kpi.confirmed === 0}
          onClick={handleMarkMonthPaid}
          className="px-4 py-2 rounded-xl bg-[#1E3A5F] text-white text-sm font-medium hover:bg-[#4573A2] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          title={
            kpi.confirmed === 0
              ? 'Keine bestätigten Provisionen in diesem Monat'
              : `Alle ${kpi.confirmed} bestätigten Einträge als bezahlt markieren`
          }
        >
          {pending ? 'Wird gespeichert...' : `Als bezahlt markieren (${kpi.confirmed})`}
        </button>
      </div>

      {/* Monatsfilter */}
      <div className="flex gap-2 flex-wrap">
        {months.map(m => (
          <Link key={m} href={`/admin/finance/provisionen?monat=${m}`}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
              monat === m ? 'bg-[#0D1B3E] text-white' : 'bg-white border border-claimondo-border text-claimondo-ondo hover:bg-[#f8f9fb]'
            }`}>
            {m}
          </Link>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiBox label="Leads" value={String(kpi.total)} color="blue" />
        <KpiBox label="Pending" value={`${kpi.pending} (${kpi.sumPending.toFixed(2)}€)`} color="amber" />
        <KpiBox label="Bestaetigt" value={`${kpi.confirmed} (${kpi.sumConfirmed.toFixed(2)}€)`} color="emerald" />
        <KpiBox label="Auszahlbar" value={`${kpi.sumConfirmed.toFixed(2)}€`} color="violet" />
      </div>

      {/* Tabelle */}
      <div className="bg-white rounded-ios-lg shadow-ios-md overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-[#f8f9fb] text-xs uppercase text-claimondo-ondo">
            <tr>
              <th className="text-left px-4 py-2">Lead</th>
              <th className="text-left px-4 py-2">Quelle</th>
              <th className="text-left px-4 py-2">Basis</th>
              <th className="text-left px-4 py-2">CPL</th>
              <th className="text-left px-4 py-2">Netto</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Aktion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-claimondo-border">
            {provisionen.map(p => {
              const leadJoin = Array.isArray(p.leads) ? p.leads[0] : p.leads
              const name = [leadJoin?.vorname, leadJoin?.nachname].filter(Boolean).join(' ') || p.lead_id.slice(0, 8)
              return (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <Link href={`/dispatch/leads/${p.lead_id}`} className="text-[#4573A2] hover:underline font-medium">
                      {name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-claimondo-ondo">{p.source_channel ?? '—'}</td>
                  <td className="px-4 py-3 tabular-nums">{Number(p.basis_provision).toFixed(2)}€</td>
                  <td className="px-4 py-3 tabular-nums">
                    {p.status === 'paid' || p.status === 'reversed' ? (
                      p.cpl_actual != null ? `${Number(p.cpl_actual).toFixed(2)}€` : '—'
                    ) : (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={p.cpl_actual ?? ''}
                          onChange={e => setEditing(prev => ({ ...prev, [p.id]: e.target.value }))}
                          onBlur={() => editing[p.id] !== undefined && handleSetCpl(p.id)}
                          className="w-20 px-2 py-1 border rounded text-sm"
                        />
                        <span className="text-xs text-claimondo-ondo/70">€</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums font-medium">{Number(p.netto_provision ?? 0).toFixed(2)}€</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      p.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                      p.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' :
                      p.status === 'paid' ? 'bg-[#f8f9fb] text-claimondo-ondo' :
                      'bg-red-100 text-red-700'
                    }`}>{p.status}</span>
                    {p.reversed_grund && <p className="text-[10px] text-claimondo-ondo/70 mt-0.5">{p.reversed_grund}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {p.status === 'pending' && p.cpl_actual != null && (
                        <button disabled={pending} onClick={() => handleConfirm(p.id)}
                          className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                          Bestaetigen
                        </button>
                      )}
                      {p.status !== 'paid' && p.status !== 'reversed' && (
                        <button disabled={pending} onClick={() => handleReverse(p.id)}
                          className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50">
                          Stornieren
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {provisionen.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-claimondo-ondo/70 text-sm">Keine Provisionen in {monat}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {/* Reload-Trigger */}
      {pending && <p className="text-xs text-claimondo-ondo/70 text-center">Speichere…</p>}
      {!pending && <button onClick={() => router.refresh()} className="text-xs text-[#4573A2] hover:underline">Liste aktualisieren</button>}
    </div>
  )
}

function KpiBox({ label, value, color }: { label: string; value: string; color: 'blue' | 'amber' | 'emerald' | 'violet' }) {
  const cls = {
    blue: 'bg-[#f8f9fb] border-claimondo-border text-claimondo-ondo',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    violet: 'bg-violet-50 border-violet-200 text-violet-700',
  }[color]
  return (
    <div className={`border rounded-xl p-3 ${cls}`}>
      <p className="text-xs font-semibold uppercase">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
    </div>
  )
}
