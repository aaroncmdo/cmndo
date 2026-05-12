'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftIcon, SaveIcon, UserIcon, BarChart3Icon, BriefcaseIcon, ClockIcon, PhoneIcon, Trash2Icon, ShieldOffIcon } from 'lucide-react'
import { updateMitarbeiter, provisionTwilioNummer, releaseTwilioNummer, resetTwoFaForUser } from '../actions'
import PageHeader from '@/components/shared/PageHeader'
import { TextField as SharedTextField } from '@/components/shared/forms'

type Perf = { monat: string; jahr: number; leads_qualifiziert: number; leads_konvertiert: number; faelle_abgeschlossen: number; aktive_faelle: number; umsatz_generiert: number }

export default function MitarbeiterDetail({ mitarbeiter, stats, performanceHistory }: {
  mitarbeiter: Record<string, unknown>
  stats: { leadsTotal: number; leadsKonvertiert: number; aktiveFaelle: number; abgeschlossen: number; avgDays: number; isDispatch: boolean }
  performanceHistory: Perf[]
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [twilioLoading, setTwilioLoading] = useState(false)
  const [twilioMsg, setTwilioMsg] = useState<string | null>(null)
  // AAR-343: 2FA-Reset (neue Nummer optional)
  const [twofaLoading, setTwofaLoading] = useState(false)
  const [twofaMsg, setTwofaMsg] = useState<string | null>(null)
  const [twofaNeuePhone, setTwofaNeuePhone] = useState('')
  const m = mitarbeiter

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSaving(true); setMsg(null)
    try {
      await updateMitarbeiter(new FormData(e.currentTarget))
      setMsg('Gespeichert'); router.refresh()
    } catch (err) { setMsg(err instanceof Error ? err.message : 'Fehler') }
    finally { setSaving(false) }
  }

  const name = [m.vorname, m.nachname].filter(Boolean).join(' ') || '—'

  return (
    <div className="py-8"><div>
      <Link href="/admin/team" className="text-claimondo-ondo hover:text-claimondo-navy text-sm transition-colors flex items-center gap-1 mb-4"><ArrowLeftIcon className="w-4 h-4" />Zurück</Link>

      <div className="mb-6">
        <PageHeader
          title={name}
          description={`${m.email as string} · ${m.rolle as string}`}
          size="lg"
          leadingSlot={
            <div className="w-14 h-14 bg-claimondo-bg rounded-full flex items-center justify-center shrink-0">
              <UserIcon className="w-7 h-7 text-claimondo-ondo" />
            </div>
          }
        />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {stats.isDispatch ? (<>
          <KPI icon={<BarChart3Icon className="w-4 h-4 text-amber-400" />} label="Leads" value={stats.leadsTotal} />
          <KPI icon={<BriefcaseIcon className="w-4 h-4 text-green-400" />} label="Konvertiert" value={stats.leadsKonvertiert} />
          <KPI icon={<BarChart3Icon className="w-4 h-4 text-claimondo-light-blue" />} label="Conv. Rate" value={stats.leadsTotal > 0 ? `${Math.round((stats.leadsKonvertiert / stats.leadsTotal) * 100)}%` : '—'} />
        </>) : (<>
          <KPI icon={<BriefcaseIcon className="w-4 h-4 text-claimondo-light-blue" />} label="Aktive Faelle" value={stats.aktiveFaelle} />
          <KPI icon={<BarChart3Icon className="w-4 h-4 text-green-400" />} label="Abgeschlossen" value={stats.abgeschlossen} />
          <KPI icon={<ClockIcon className="w-4 h-4 text-amber-400" />} label="Avg. Tage" value={stats.avgDays || '—'} />
        </>)}
        <KPI icon={<BriefcaseIcon className="w-4 h-4 text-violet-400" />} label="Kapazitaet" value={`${stats.aktiveFaelle}/${(m.kapazitaet_max as number) ?? 100}`} />
      </div>

      {/* Performance History */}
      {performanceHistory.length > 0 && (
        <div className="bg-white rounded-2xl border border-claimondo-border p-5 mb-6">
          <h3 className="text-claimondo-ondo text-xs font-semibold uppercase tracking-wider mb-3">Performance-Verlauf</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-claimondo-border">
                <th className="text-left px-3 py-2 text-claimondo-ondo font-medium">Monat</th>
                <th className="text-right px-3 py-2 text-claimondo-ondo font-medium">Leads</th>
                <th className="text-right px-3 py-2 text-claimondo-ondo font-medium">Konvertiert</th>
                <th className="text-right px-3 py-2 text-claimondo-ondo font-medium">Abgeschl.</th>
                <th className="text-right px-3 py-2 text-claimondo-ondo font-medium">Umsatz</th>
              </tr></thead>
              <tbody>
                {performanceHistory.map(p => (
                  <tr key={`${p.monat}-${p.jahr}`} className="border-b border-claimondo-border/50">
                    <td className="px-3 py-2 text-claimondo-navy">{p.monat} {p.jahr}</td>
                    <td className="px-3 py-2 text-right text-claimondo-navy tabular-nums">{p.leads_qualifiziert}</td>
                    <td className="px-3 py-2 text-right text-green-400 tabular-nums">{p.leads_konvertiert}</td>
                    <td className="px-3 py-2 text-right text-claimondo-navy tabular-nums">{p.faelle_abgeschlossen}</td>
                    <td className="px-3 py-2 text-right text-claimondo-navy tabular-nums">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(p.umsatz_generiert ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Form */}
      <div className="bg-white rounded-2xl border border-claimondo-border p-5">
        <h3 className="text-claimondo-ondo text-xs font-semibold uppercase tracking-wider mb-4">Profil bearbeiten</h3>
        <form onSubmit={handleSave} className="space-y-3">
          <input type="hidden" name="id" value={m.id as string} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vorname" name="vorname" defaultValue={(m.vorname as string) ?? ''} />
            <Field label="Nachname" name="nachname" defaultValue={(m.nachname as string) ?? ''} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefon" name="telefon" defaultValue={(m.telefon as string) ?? ''} />
            <Field label="Position" name="position" defaultValue={(m.position as string) ?? ''} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-claimondo-ondo mb-1 block">Kategorie</label>
              <select name="kategorie" defaultValue={(m.kategorie as string) ?? ''} className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2 text-claimondo-navy text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]">
                <option value="">—</option><option value="dispatch">Dispatch</option><option value="kundenbetreuer">Kundenbetreuer</option><option value="admin">Admin</option><option value="entwicklung">Entwicklung</option>
              </select>
            </div>
            <Field label="Gehaltsstufe" name="gehaltsstufe" defaultValue={(m.gehaltsstufe as string) ?? ''} />
            <Field label="Gehalt brutto" name="gehalt_brutto" type="number" defaultValue={String((m.gehalt_brutto as number) ?? '')} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Kapazitaet max" name="kapazitaet_max" type="number" defaultValue={String((m.kapazitaet_max as number) ?? 100)} />
            <Field label="Eingestellt am" name="eingestellt_am" type="date" defaultValue={(m.eingestellt_am as string) ?? ''} />
            <div>
              <label className="text-sm text-claimondo-ondo mb-1 block">Aktiv</label>
              <select name="aktiv" defaultValue={String(m.aktiv ?? true)} className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2 text-claimondo-navy text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]">
                <option value="true">Ja</option><option value="false">Nein</option>
              </select>
            </div>
          </div>
          {msg && <p className={`text-sm px-4 py-2 rounded-xl ${msg === 'Gespeichert' ? 'bg-green-50 text-green-300' : 'bg-red-50 text-red-300'}`}>{msg}</p>}
          <button type="submit" disabled={saving} className="flex items-center gap-2 bg-claimondo-ondo hover:bg-claimondo-shield  text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
            <SaveIcon className="w-4 h-4" />{saving ? 'Speichere...' : 'Speichern'}
          </button>
        </form>

        {/* KFZ-182: Twilio WhatsApp-Nummer Zuweisung */}
        {(m.rolle === 'kundenbetreuer' || m.rolle === 'admin') && (
          <div className="mt-5 bg-white border border-claimondo-border rounded-2xl p-5">
            <h3 className="text-sm font-medium text-claimondo-navy mb-3 flex items-center gap-2"><PhoneIcon className="w-4 h-4" /> WhatsApp-Nummer</h3>
            {m.twilio_whatsapp_nummer ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-claimondo-navy bg-claimondo-bg px-3 py-1.5 rounded-lg">{m.twilio_whatsapp_nummer as string}</span>
                  <span className="text-[10px] text-claimondo-ondo/70">seit {m.twilio_nummer_provisioned_am ? new Date(m.twilio_nummer_provisioned_am as string).toLocaleDateString('de-DE') : '—'}</span>
                </div>
                <button
                  onClick={async () => {
                    if (!confirm('Nummer wirklich freigeben? Kann nicht rueckgaengig gemacht werden.')) return
                    setTwilioLoading(true); setTwilioMsg(null)
                    try { await releaseTwilioNummer(m.id as string); setTwilioMsg('Nummer freigegeben'); router.refresh() }
                    catch (e) { setTwilioMsg(e instanceof Error ? e.message : 'Fehler') }
                    finally { setTwilioLoading(false) }
                  }}
                  disabled={twilioLoading}
                  className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                >
                  <Trash2Icon className="w-3.5 h-3.5" /> Nummer freigeben
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-claimondo-ondo">Noch keine eigene WhatsApp-Nummer zugewiesen. Kosten: ~1 EUR/Monat via Twilio.</p>
                <button
                  onClick={async () => {
                    setTwilioLoading(true); setTwilioMsg(null)
                    try { await provisionTwilioNummer(m.id as string); setTwilioMsg('Nummer zugewiesen!'); router.refresh() }
                    catch (e) { setTwilioMsg(e instanceof Error ? e.message : 'Fehler') }
                    finally { setTwilioLoading(false) }
                  }}
                  disabled={twilioLoading}
                  className="flex items-center gap-2 bg-claimondo-shield hover:bg-claimondo-ondo disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                >
                  <PhoneIcon className="w-4 h-4" /> {twilioLoading ? 'Wird provisioniert...' : 'WhatsApp-Nummer zuweisen'}
                </button>
              </div>
            )}
            {twilioMsg && <p className={`text-xs mt-2 ${twilioMsg.includes('!') ? 'text-green-600' : 'text-red-500'}`}>{twilioMsg}</p>}
          </div>
        )}

        {/* AAR-343: 2FA-Reset — für Nummern-Wechsel oder wenn User ausgesperrt ist */}
        <div className="mt-5 bg-white border border-claimondo-border rounded-2xl p-5">
          <h3 className="text-sm font-medium text-claimondo-navy mb-3 flex items-center gap-2">
            <ShieldOffIcon className="w-4 h-4" /> 2FA-Telefonnummer
          </h3>
          <p className="text-xs text-claimondo-ondo mb-3">
            Aktuelle 2FA-Nummer:{' '}
            <span className="font-mono">
              {(m.twofa_telefon as string | null) ?? (m.telefon as string | null) ?? '—'}
            </span>
            {!m.twofa_telefon && m.telefon ? (
              <span className="text-claimondo-ondo/70"> (Fallback auf Profil-Telefon)</span>
            ) : null}
          </p>
          <div className="space-y-2">
            <input
              type="tel"
              value={twofaNeuePhone}
              onChange={(e) => setTwofaNeuePhone(e.target.value)}
              placeholder="Neue 2FA-Nummer (optional, z. B. +49 151 1234 5678)"
              className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2 text-claimondo-navy text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
            />
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                disabled={twofaLoading}
                onClick={async () => {
                  const confirmText = twofaNeuePhone.trim()
                    ? `2FA-Nummer auf "${twofaNeuePhone.trim()}" setzen? Alle Remember-Tokens werden widerrufen.`
                    : 'Aktuelle 2FA-Nummer entfernen? Beim nächsten Login greift der Fallback auf die Profil-Telefonnummer. Alle Remember-Tokens werden widerrufen.'
                  if (!confirm(confirmText)) return
                  setTwofaLoading(true)
                  setTwofaMsg(null)
                  try {
                    const r = await resetTwoFaForUser(m.id as string, twofaNeuePhone || null)
                    if (!r.success) {
                      setTwofaMsg(r.error ?? 'Fehler')
                    } else {
                      setTwofaMsg(twofaNeuePhone ? 'Neue 2FA-Nummer gesetzt!' : '2FA-Nummer entfernt')
                      setTwofaNeuePhone('')
                      router.refresh()
                    }
                  } catch (e) {
                    setTwofaMsg(e instanceof Error ? e.message : 'Fehler')
                  } finally {
                    setTwofaLoading(false)
                  }
                }}
                className="flex items-center gap-1.5 bg-claimondo-shield hover:bg-claimondo-ondo disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
              >
                <ShieldOffIcon className="w-4 h-4" />
                {twofaLoading
                  ? 'Wird zurückgesetzt …'
                  : twofaNeuePhone.trim()
                    ? 'Nummer setzen + Tokens widerrufen'
                    : 'Zurücksetzen + Tokens widerrufen'}
              </button>
            </div>
            {twofaMsg && (
              <p className={`text-xs ${twofaMsg.includes('!') || twofaMsg.includes('entfernt') ? 'text-green-600' : 'text-red-500'}`}>
                {twofaMsg}
              </p>
            )}
          </div>
        </div>
      </div>
    </div></div>
  )
}

function KPI({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-white border border-claimondo-border rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-claimondo-ondo text-xs">{label}</span></div>
      <div className="text-xl font-bold text-claimondo-navy">{value}</div>
    </div>
  )
}

// AAR-frontend-konsolidierung-p1: dünner Adapter — delegiert an shared/forms/TextField (uncontrolled, name/defaultValue).
function Field({ label, name, defaultValue, type = 'text' }: { label: string; name: string; defaultValue: string; type?: string }) {
  return (
    <SharedTextField label={label} name={name} type={type} defaultValue={defaultValue} step={type === 'number' ? 'any' : undefined} />
  )
}
