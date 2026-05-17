'use client'

import { useState, useTransition } from 'react'
import { Building2Icon, GraduationCapIcon, MailIcon, ShieldOffIcon, ShieldCheckIcon, ArrowRightIcon, InboxIcon, UsersIcon, BarChart3Icon, WalletIcon, ActivityIcon } from 'lucide-react'
import { assignPoolLead, toggleSubSvSperre } from './actions'
import PageHeader from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { StatCard } from '@/components/shared/StatCard'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'

export type SubSvData = {
  id: string
  paket: string
  rolle_in_organisation: string | null
  ist_aktiv: boolean
  portal_zugang_freigeschaltet: boolean
  gesperrt_seit: string | null
  paket_faelle_gesamt: number
  paket_faelle_genutzt: number | null
  werbebudget_guthaben_netto: number | null
  vorname: string | null
  nachname: string | null
  email: string | null
}

export type PoolLeadData = {
  id: string
  claim_nummer: string
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
    (s.paket_faelle_genutzt ?? 0) < s.paket_faelle_gesamt
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
    <div className="px-8 py-8 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={orgName}
        description={`Team-Verwaltung — ${orgLabel} mit ${subSvs.length} Mitgliedern`}
        icon={Icon}
      />

      {/* KFZ-152 Follow-up: Aggregierte Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard size="sm" icon={UsersIcon} tone="ondo" label="Mitglieder" value={`${stats.mitglieder_aktiv} aktiv`} hint={stats.mitglieder_gesperrt > 0 ? `${stats.mitglieder_gesperrt} gesperrt` : `${stats.mitglieder_gesamt} gesamt`} />
        <StatCard size="sm" icon={BarChart3Icon} tone={stats.auslastung_pct >= 80 ? 'warning' : 'ondo'} label="Fälle Monat" value={`${stats.faelle_genutzt} / ${stats.faelle_max}`} hint={`${stats.auslastung_pct}% Auslastung`} />
        <StatCard size="sm" icon={WalletIcon} tone="ondo" label="Werbebudget" value={stats.werbebudget_gesamt.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })} hint="Gesamt-Guthaben" />
        {showPoolSection && (
          <StatCard size="sm" icon={InboxIcon} tone={stats.pool_leads > 0 ? 'warning' : 'ondo'} label="Pool-Leads" value={String(stats.pool_leads)} hint="ohne Zuweisung" />
        )}
        {!showPoolSection && (
          <StatCard size="sm" icon={ActivityIcon} tone="ondo" label="Auslastung" value={`${stats.auslastung_pct}%`} hint={`${stats.faelle_max - stats.faelle_genutzt} Slots frei`} />
        )}
      </div>

      {actionMsg && (
        <div className={`mb-4 px-3 py-2.5 rounded-ios-xl text-sm border ${
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
            <h2 className="text-sm font-semibold text-claimondo-navy flex items-center gap-2">
              <InboxIcon className="w-4 h-4 text-amber-600" /> Eingehende Pool-Leads
              <span className="ml-2 text-xs text-amber-700 font-normal">{poolLeads.length} ohne Zuweisung</span>
            </h2>
          </div>
          {poolLeads.length === 0 ? (
            <div className="p-6 text-center text-xs text-claimondo-ondo/70">
              Keine offenen Pool-Leads. Neue Leads werden hier sichtbar sobald der Dispatcher sie deiner Organisation zuweist.
            </div>
          ) : (
            <DataTableContainer variant="plain">
              <Table>
                <Thead className="!text-[10px] !tracking-wide">
                  <Tr>
                    <Th>Fall</Th>
                    <Th>Standort</Th>
                    <Th>Spez/Schaden</Th>
                    <Th>Erstellt</Th>
                    <Th>Zuweisen an</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {poolLeads.map(l => (
                    <Tr key={l.id} className="hover:bg-amber-50/30">
                      <Td>
                        <div className="font-mono text-xs text-claimondo-navy">{l.claim_nummer}</div>
                        {l.kennzeichen && <div className="text-[10px] text-claimondo-ondo/70 font-mono">{l.kennzeichen}</div>}
                        {l.fahrzeug && <div className="text-[10px] text-claimondo-ondo">{l.fahrzeug}</div>}
                      </Td>
                      <Td className="text-xs">
                        {[l.schadens_adresse, l.schadens_plz, l.schadens_ort].filter(Boolean).join(', ') || '—'}
                      </Td>
                      <Td className="text-xs">
                        {l.spezifikation && <div className="text-[var(--brand-secondary)]">{l.spezifikation}</div>}
                        {l.schadens_art && <div className="text-amber-700">{l.schadens_art}</div>}
                        {!l.spezifikation && !l.schadens_art && <span className="text-claimondo-ondo/70">—</span>}
                      </Td>
                      <Td className="!text-claimondo-ondo/70 text-[10px]">
                        {l.created_at ? new Date(l.created_at).toLocaleDateString('de-DE') : '—'}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <select
                            value={assignTargets[l.id] ?? ''}
                            onChange={e => setAssignTargets(prev => ({ ...prev, [l.id]: e.target.value }))}
                            disabled={pending}
                            className="text-xs bg-claimondo-bg border border-claimondo-border rounded-ios-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--brand-secondary)]"
                          >
                            <option value="">Wählen...</option>
                            {eligibleTargets.map(s => (
                              <option key={s.id} value={s.id}>
                                {[s.vorname, s.nachname].filter(Boolean).join(' ') || s.id.slice(0, 8)} ({s.paket_faelle_genutzt ?? 0}/{s.paket_faelle_gesamt})
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleAssign(l.id)}
                            disabled={pending || !assignTargets[l.id]}
                            className="p-1.5 rounded-ios-lg bg-[var(--brand-secondary)] hover:bg-[var(--brand-primary)] text-white disabled:opacity-40"
                          >
                            <ArrowRightIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </DataTableContainer>
          )}
        </div>
      )}

      {/* Mitglieder-Listing */}
      <div className="bg-white border border-claimondo-border rounded-2xl overflow-hidden">
        {subSvs.length === 0 ? (
          <div className="p-12 text-center">
            <MailIcon className="w-8 h-8 text-claimondo-ondo/50 mx-auto mb-3" />
            <p className="text-sm text-claimondo-ondo">Noch keine Mitglieder in deiner Organisation.</p>
            <p className="text-[11px] text-claimondo-ondo/70 mt-2">
              Mitglieder werden vom Admin über das Anlege-UI hinzugefügt.
            </p>
          </div>
        ) : (
          <DataTableContainer variant="plain">
            <Table>
              <Thead className="!text-[10px] !tracking-wide">
                <Tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Paket</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Fälle Monat</Th>
                  <Th className="text-right">Werbebudget</Th>
                  <Th className="text-right">Aktion</Th>
                </Tr>
              </Thead>
              <Tbody>
                {subSvs.map(s => {
                  const name = [s.vorname, s.nachname].filter(Boolean).join(' ') || '—'
                  const isGesperrt = !!s.gesperrt_seit
                  const status = isGesperrt ? { label: 'Gesperrt', cls: 'bg-red-50 text-red-700' }
                    : !s.ist_aktiv ? { label: 'Inaktiv', cls: 'bg-claimondo-bg text-claimondo-ondo' }
                    : !s.portal_zugang_freigeschaltet ? { label: 'Wartet auf Onboarding', cls: 'bg-yellow-50 text-yellow-700' }
                    : { label: 'Aktiv', cls: 'bg-emerald-50 text-emerald-700' }
                  return (
                    <Tr key={s.id} className={`hover:bg-claimondo-bg/50 ${isGesperrt ? 'opacity-60' : ''}`}>
                      <Td>{name}</Td>
                      <Td className="!text-claimondo-ondo text-xs">{s.email ?? '—'}</Td>
                      <Td className="capitalize">{s.paket}</Td>
                      <Td>
                        <StatusBadge colorCls={status.cls}>{status.label}</StatusBadge>
                      </Td>
                      <Td className="text-right">
                        {s.paket_faelle_genutzt ?? 0} / {s.paket_faelle_gesamt}
                      </Td>
                      <Td className="text-right">
                        {s.werbebudget_guthaben_netto != null
                          ? s.werbebudget_guthaben_netto.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })
                          : '—'}
                      </Td>
                      <Td className="text-right">
                        <button
                          onClick={() => handleToggleSperre(s.id, isGesperrt)}
                          disabled={pending}
                          className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-ios-md font-medium transition-colors disabled:opacity-40 ${
                            isGesperrt
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-red-50 text-red-700 hover:bg-red-100'
                          }`}
                        >
                          {isGesperrt ? <><ShieldCheckIcon className="w-3 h-3" /> Entsperren</> : <><ShieldOffIcon className="w-3 h-3" /> Sperren</>}
                        </button>
                      </Td>
                    </Tr>
                  )
                })}
              </Tbody>
            </Table>
          </DataTableContainer>
        )}
      </div>

      <p className="text-[10px] text-claimondo-ondo/70 mt-3 text-center">
        Pool-Leads werden manuell verteilt. Mitglieder einladen läuft aktuell über den Admin
        (/admin/sachverstaendige).
      </p>
    </div>
  )
}

