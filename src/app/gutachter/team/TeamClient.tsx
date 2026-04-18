'use client'

import { useState, useTransition } from 'react'
import { Building2Icon, GraduationCapIcon, MailIcon, ShieldOffIcon, ShieldCheckIcon, ArrowRightIcon, InboxIcon, UsersIcon, BarChart3Icon, WalletIcon, ActivityIcon } from 'lucide-react'
import { assignPoolLead, toggleSubSvSperre } from './actions'

export type SubSvData = {
  id: string
  paket: string
  rolle_in_organisation: string | null
  ist_aktiv: boolean
  portal_zugang_freigeschaltet: boolean
  gesperrt_seit: string | null
  max_faelle_monat: number
  paket_faelle_genutzt: number | null
  werbebudget_guthaben_netto: number | null
  vorname: string | null
  nachname: string | null
  email: string | null
}

export type PoolLeadData = {
  id: string
  fall_nummer: string
  status: string
  schadens_plz: string | null
  schadens_ort: string | null
  schadens_adresse: string | null
  kennzeichen: string | null
  fahrzeug: string | null
  spezifikation: string | null
  schadens_art: string | null
  created_at: string | null
}

export type OrgStats = {
  mitglieder_gesamt: number
  mitglieder_aktiv: number
  mitglieder_gesperrt: number
  faelle_genutzt: number
  faelle_max: number
  auslastung_pct: number
  werbebudget_gesamt: number
  pool_leads: number
}

export default function TeamClient({
  orgName, orgLabel, iconKey, subSvs, poolLeads, showPoolSection, stats,
}: {
  orgName: string
  orgLabel: string
  iconKey: 'akademie' | 'buero'
  subSvs: SubSvData[]
  poolLeads: PoolLeadData[]
  showPoolSection: boolean
  stats: OrgStats
}) {
  const Icon = iconKey === 'akademie' ? GraduationCapIcon : Building2Icon
  const [pending, startTransition] = useTransition()
  const [actionMsg, setActionMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [assignTargets, setAssignTargets] = useState<Record<string, string>>({})

  // Sub-SV Optionen fuer den Assign-Dropdown
  const eligibleTargets = subSvs.filter(s =>
    s.ist_aktiv && s.portal_zugang_freigeschaltet && !s.gesperrt_seit &&
    (s.paket_faelle_genutzt ?? 0) < s.max_faelle_monat
  )

  function handleAssign(fallId: string) {
    const target = assignTargets[fallId]
    if (!target) { setActionMsg({ kind: 'error', text: 'Bitte einen Sub-SV auswählen' }); return }
    setActionMsg(null)
    startTransition(async () => {
      const r = await assignPoolLead(fallId, target)
      if (r.success) setActionMsg({ kind: 'success', text: 'Lead zugewiesen' })
      else setActionMsg({ kind: 'error', text: r.error ?? 'Fehler' })
    })
  }

  function handleToggleSperre(svId: string, gesperrt: boolean) {
    setActionMsg(null)
    startTransition(async () => {
      const r = await toggleSubSvSperre(svId, !gesperrt)
      if (r.success) setActionMsg({ kind: 'success', text: gesperrt ? 'Mitarbeiter entsperrt' : 'Mitarbeiter gesperrt' })
      else setActionMsg({ kind: 'error', text: r.error ?? 'Fehler' })
    })
  }

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-3">
            <Icon className="w-6 h-6 text-[var(--brand-secondary)]" /> {orgName}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Team-Verwaltung — {orgLabel} mit {subSvs.length} Mitgliedern
          </p>
        </div>
      </div>

      {/* KFZ-152 Follow-up: Aggregierte Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard icon={UsersIcon} label="Mitglieder" value={`${stats.mitglieder_aktiv} aktiv`} sub={stats.mitglieder_gesperrt > 0 ? `${stats.mitglieder_gesperrt} gesperrt` : `${stats.mitglieder_gesamt} gesamt`} />
        <StatCard icon={BarChart3Icon} label="Fälle Monat" value={`${stats.faelle_genutzt} / ${stats.faelle_max}`} sub={`${stats.auslastung_pct}% Auslastung`} highlight={stats.auslastung_pct >= 80} />
        <StatCard icon={WalletIcon} label="Werbebudget" value={stats.werbebudget_gesamt.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })} sub="Gesamt-Guthaben" />
        {showPoolSection && (
          <StatCard icon={InboxIcon} label="Pool-Leads" value={String(stats.pool_leads)} sub="ohne Zuweisung" highlight={stats.pool_leads > 0} />
        )}
        {!showPoolSection && (
          <StatCard icon={ActivityIcon} label="Auslastung" value={`${stats.auslastung_pct}%`} sub={`${stats.faelle_max - stats.faelle_genutzt} Slots frei`} />
        )}
      </div>

      {actionMsg && (
        <div className={`mb-4 px-3 py-2.5 rounded-xl text-sm border ${
          actionMsg.kind === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {actionMsg.text}
        </div>
      )}

      {/* KFZ-152 Phase 2+3: Pool-Leads Section (nur fuer Akademie) */}
      {showPoolSection && (
        <div className="mb-6 bg-white border border-amber-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-amber-200 bg-gradient-to-r from-amber-50 to-white flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <InboxIcon className="w-4 h-4 text-amber-600" /> Eingehende Pool-Leads
              <span className="ml-2 text-xs text-amber-700 font-normal">{poolLeads.length} ohne Zuweisung</span>
            </h2>
          </div>
          {poolLeads.length === 0 ? (
            <div className="p-6 text-center text-xs text-gray-400">
              Keine offenen Pool-Leads. Neue Leads werden hier sichtbar sobald der Dispatcher sie deiner Organisation zuweist.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="text-left px-4 py-3">Fall</th>
                  <th className="text-left px-4 py-3">Standort</th>
                  <th className="text-left px-4 py-3">Spez/Schaden</th>
                  <th className="text-left px-4 py-3">Erstellt</th>
                  <th className="text-left px-4 py-3">Zuweisen an</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {poolLeads.map(l => (
                  <tr key={l.id} className="hover:bg-amber-50/30">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-gray-900">{l.fall_nummer}</div>
                      {l.kennzeichen && <div className="text-[10px] text-gray-400 font-mono">{l.kennzeichen}</div>}
                      {l.fahrzeug && <div className="text-[10px] text-gray-500">{l.fahrzeug}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">
                      {[l.schadens_adresse, l.schadens_plz, l.schadens_ort].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {l.spezifikation && <div className="text-[var(--brand-secondary)]">{l.spezifikation}</div>}
                      {l.schadens_art && <div className="text-amber-700">{l.schadens_art}</div>}
                      {!l.spezifikation && !l.schadens_art && <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[10px] text-gray-400">
                      {l.created_at ? new Date(l.created_at).toLocaleDateString('de-DE') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={assignTargets[l.id] ?? ''}
                          onChange={e => setAssignTargets(prev => ({ ...prev, [l.id]: e.target.value }))}
                          disabled={pending}
                          className="text-xs bg-gray-100 border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--brand-secondary)]"
                        >
                          <option value="">Wählen...</option>
                          {eligibleTargets.map(s => (
                            <option key={s.id} value={s.id}>
                              {[s.vorname, s.nachname].filter(Boolean).join(' ') || s.id.slice(0, 8)} ({s.paket_faelle_genutzt ?? 0}/{s.max_faelle_monat})
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAssign(l.id)}
                          disabled={pending || !assignTargets[l.id]}
                          className="p-1.5 rounded-lg bg-[var(--brand-secondary)] hover:bg-[var(--brand-primary)] text-white disabled:opacity-40"
                        >
                          <ArrowRightIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Mitglieder-Listing */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {subSvs.length === 0 ? (
          <div className="p-12 text-center">
            <MailIcon className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Noch keine Mitglieder in deiner Organisation.</p>
            <p className="text-[11px] text-gray-400 mt-2">
              Mitglieder werden vom Admin über das Anlege-UI hinzugefügt.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Paket</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Fälle Monat</th>
                <th className="text-right px-4 py-3">Werbebudget</th>
                <th className="text-right px-4 py-3">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {subSvs.map(s => {
                const name = [s.vorname, s.nachname].filter(Boolean).join(' ') || '—'
                const isGesperrt = !!s.gesperrt_seit
                const status = isGesperrt ? { label: 'Gesperrt', cls: 'bg-red-50 text-red-700' }
                  : !s.ist_aktiv ? { label: 'Inaktiv', cls: 'bg-gray-100 text-gray-500' }
                  : !s.portal_zugang_freigeschaltet ? { label: 'Wartet auf Onboarding', cls: 'bg-yellow-50 text-yellow-700' }
                  : { label: 'Aktiv', cls: 'bg-emerald-50 text-emerald-700' }
                return (
                  <tr key={s.id} className={`hover:bg-gray-50/50 ${isGesperrt ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 text-gray-900">{name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{s.email ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700 capitalize">{s.paket}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium ${status.cls}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {s.paket_faelle_genutzt ?? 0} / {s.max_faelle_monat}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {s.werbebudget_guthaben_netto != null
                        ? s.werbebudget_guthaben_netto.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleToggleSperre(s.id, isGesperrt)}
                        disabled={pending}
                        className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md font-medium transition-colors disabled:opacity-40 ${
                          isGesperrt
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-red-50 text-red-700 hover:bg-red-100'
                        }`}
                      >
                        {isGesperrt ? <><ShieldCheckIcon className="w-3 h-3" /> Entsperren</> : <><ShieldOffIcon className="w-3 h-3" /> Sperren</>}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[10px] text-gray-400 mt-3 text-center">
        Pool-Leads werden manuell verteilt. Mitglieder einladen läuft aktuell über den Admin
        (/admin/sachverstaendige).
      </p>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, highlight }: {
  icon: typeof UsersIcon; label: string; value: string; sub: string; highlight?: boolean
}) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${highlight ? 'text-amber-600' : 'text-[var(--brand-secondary)]'}`} />
        <span className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">{label}</span>
      </div>
      <div className="text-lg font-semibold text-gray-900">{value}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>
    </div>
  )
}
