'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SaveIcon, BarChart3Icon, BriefcaseIcon, ClockIcon, PhoneIcon, Trash2Icon, ShieldOffIcon } from 'lucide-react'
import { updateMitarbeiter, provisionTwilioNummer, releaseTwilioNummer, resetTwoFaForUser, clearTwoFaForUser, setPhoneLoginNummer } from '../actions'
import EntityDetailShell from '@/components/shared/detail/EntityDetailShell'
import { Button } from '@/components/primitives'
import { TextField as SharedTextField } from '@/components/shared/forms'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import { SectionCard } from '@/components/shared/SectionCard'

type Perf = { monat: string; jahr: number; leads_qualifiziert: number; leads_konvertiert: number; faelle_abgeschlossen: number; aktive_faelle: number; umsatz_generiert: number }

// W1.4 Part B: Incentive-Auszahlung dieses Mitarbeiters (incentive_auszahlungen + incentives.titel).
type Auszahlung = { id: string; monat: string; betrag: number | null; status: string; incentive_titel: string | null }

// Reine Label-Map (KEIN Farb-Mapping) — der status-registry-Ratchet erlaubt reine Labels.
const AUSZ_LABEL: Record<string, string> = {
  offen: 'Offen', beantragt: 'Beantragt', genehmigt: 'Genehmigt', ausgezahlt: 'Ausgezahlt', abgelehnt: 'Abgelehnt',
}

export default function MitarbeiterDetail({ mitarbeiter, stats, performanceHistory, loginPhone, auszahlungen }: {
  mitarbeiter: Record<string, unknown>
  stats: { leadsTotal: number; leadsKonvertiert: number; aktiveFaelle: number; abgeschlossen: number; avgDays: number; isDispatch: boolean }
  performanceHistory: Perf[]
  /** Task B: aktuelle Handy-LOGIN-Nummer (auth.users.phone), getrennt von 2FA. */
  loginPhone: string | null
  /** W1.4 Part B: Incentive-Auszahlungs-Historie dieses Mitarbeiters. */
  auszahlungen: Auszahlung[]
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
  // Task B: getrennte Handy-LOGIN-Nummer (auth.users.phone via enablePhoneLogin)
  const [loginPhoneLoading, setLoginPhoneLoading] = useState(false)
  const [loginPhoneMsg, setLoginPhoneMsg] = useState<string | null>(null)
  const [loginPhoneInput, setLoginPhoneInput] = useState('')
  const m = mitarbeiter

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSaving(true); setMsg(null)
    try {
      const r = await updateMitarbeiter(new FormData(e.currentTarget))
      if (!r.success) {
        setMsg(r.error ?? 'Fehler')
        return
      }
      setMsg('Gespeichert'); router.refresh()
    } catch (err) { setMsg(err instanceof Error ? err.message : 'Fehler') }
    finally { setSaving(false) }
  }

  const name = [m.vorname, m.nachname].filter(Boolean).join(' ') || '—'

  return (
    <EntityDetailShell
      title={name}
      description={`${m.email as string} · ${m.rolle as string}`}
      backHref="/admin/team"
      backLabel="Personal"
    >
      <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-5xl mx-auto">
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
        <KPI icon={<BriefcaseIcon className="w-4 h-4 text-claimondo-ondo" />} label="Kapazitaet" value={`${stats.aktiveFaelle}/${(m.kapazitaet_max as number) ?? 100}`} />
      </div>

      {/* Performance History */}
      {performanceHistory.length > 0 && (
        <div className="bg-white rounded-2xl border border-claimondo-border p-5 mb-6">
          <h3 className="text-claimondo-ondo text-xs font-semibold uppercase tracking-wider mb-3">Performance-Verlauf</h3>
          <DataTableContainer variant="plain">
            <Table>
              <Thead className="bg-transparent! text-sm! normal-case! tracking-normal!">
                <Tr className="border-b border-claimondo-border">
                  <Th className="text-left px-3! py-2! text-claimondo-ondo!">Monat</Th>
                  <Th className="text-right px-3! py-2! text-claimondo-ondo!">Leads</Th>
                  <Th className="text-right px-3! py-2! text-claimondo-ondo!">Konvertiert</Th>
                  <Th className="text-right px-3! py-2! text-claimondo-ondo!">Abgeschl.</Th>
                  <Th className="text-right px-3! py-2! text-claimondo-ondo!">Umsatz</Th>
                </Tr>
              </Thead>
              <Tbody className="divide-y-0!">
                {performanceHistory.map(p => (
                  <Tr key={`${p.monat}-${p.jahr}`} className="border-b border-claimondo-border/50">
                    <Td className="px-3! py-2!">{p.monat} {p.jahr}</Td>
                    <Td className="px-3! py-2! text-right tabular-nums">{p.leads_qualifiziert}</Td>
                    <Td className="px-3! py-2! text-right text-green-400! tabular-nums">{p.leads_konvertiert}</Td>
                    <Td className="px-3! py-2! text-right tabular-nums">{p.faelle_abgeschlossen}</Td>
                    <Td className="px-3! py-2! text-right tabular-nums">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(p.umsatz_generiert ?? 0)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </DataTableContainer>
        </div>
      )}

      {/* W1.4 Part B (Routen-Cleanup): Incentive-Auszahlungen dieses Mitarbeiters — vorher
          nur global im team/incentives-Tab, jetzt pro Person in der Detail-View.
          shared/SectionCard (nicht hand-rolled bg-white-Card) = component-set-safe;
          Status als neutrales Badge (kein Farb-Ternary) = status-registry-safe. */}
      <div className="mb-6">
        <SectionCard className="rounded-2xl">
          <h3 className="text-claimondo-ondo text-xs font-semibold uppercase tracking-wider mb-3">Incentive-Auszahlungen</h3>
          {auszahlungen.length > 0 ? (
            <DataTableContainer variant="plain">
              <Table>
                <Thead className="bg-transparent! text-sm! normal-case! tracking-normal!">
                  <Tr className="border-b border-claimondo-border">
                    <Th className="text-left px-3! py-2! text-claimondo-ondo!">Monat</Th>
                    <Th className="text-left px-3! py-2! text-claimondo-ondo!">Incentive</Th>
                    <Th className="text-right px-3! py-2! text-claimondo-ondo!">Betrag</Th>
                    <Th className="text-left px-3! py-2! text-claimondo-ondo!">Status</Th>
                  </Tr>
                </Thead>
                <Tbody className="divide-y-0!">
                  {auszahlungen.map((a) => (
                    <Tr key={a.id} className="border-b border-claimondo-border/50">
                      <Td className="px-3! py-2!">{a.monat}</Td>
                      <Td className="px-3! py-2!">{a.incentive_titel ?? '—'}</Td>
                      <Td className="px-3! py-2! text-right tabular-nums">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(a.betrag ?? 0)}</Td>
                      <Td className="px-3! py-2!">
                        <span className="inline-block px-2 py-0.5 rounded-ios-sm text-[11px] font-medium bg-claimondo-bg text-claimondo-ondo border border-claimondo-border">
                          {AUSZ_LABEL[a.status] ?? a.status}
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </DataTableContainer>
          ) : (
            <p className="text-sm text-claimondo-ondo/70">Noch keine Incentive-Auszahlungen erfasst.</p>
          )}
        </SectionCard>
      </div>

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
              <select name="kategorie" defaultValue={(m.kategorie as string) ?? ''} className="w-full bg-claimondo-bg border border-claimondo-border rounded-ios-xl px-3 py-2 text-claimondo-navy text-sm focus:outline-none focus:ring-2 focus:ring-claimondo-shield">
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
              <select name="aktiv" defaultValue={String(m.aktiv ?? true)} className="w-full bg-claimondo-bg border border-claimondo-border rounded-ios-xl px-3 py-2 text-claimondo-navy text-sm focus:outline-none focus:ring-2 focus:ring-claimondo-shield">
                <option value="true">Ja</option><option value="false">Nein</option>
              </select>
            </div>
          </div>
          {msg && <p className={`text-sm px-4 py-2 rounded-ios-xl ${msg === 'Gespeichert' ? 'bg-success-soft text-success-strong' : 'bg-danger-soft text-danger-strong'}`}>{msg}</p>}
          <Button
            variant="navy"
            type="submit"
            disabled={saving}
            iconLeft={<SaveIcon className="w-4 h-4" />}
          >
            {saving ? 'Speichere...' : 'Speichern'}
          </Button>
        </form>

        {/* KFZ-182: Twilio WhatsApp-Nummer Zuweisung */}
        {(m.rolle === 'kundenbetreuer' || m.rolle === 'admin') && (
          <div className="mt-5 bg-white border border-claimondo-border rounded-2xl p-5">
            <h3 className="text-sm font-medium text-claimondo-navy mb-3 flex items-center gap-2"><PhoneIcon className="w-4 h-4" /> WhatsApp-Nummer</h3>
            {m.twilio_whatsapp_nummer ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-claimondo-navy bg-claimondo-bg px-3 py-1.5 rounded-ios-lg">{m.twilio_whatsapp_nummer as string}</span>
                  <span className="text-[10px] text-claimondo-ondo/70">seit {m.twilio_nummer_provisioned_am ? new Date(m.twilio_nummer_provisioned_am as string).toLocaleDateString('de-DE') : '—'}</span>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    if (!confirm('Nummer wirklich freigeben? Kann nicht rueckgaengig gemacht werden.')) return
                    setTwilioLoading(true); setTwilioMsg(null)
                    try { await releaseTwilioNummer(m.id as string); setTwilioMsg('Nummer freigegeben'); router.refresh() }
                    catch (e) { setTwilioMsg(e instanceof Error ? e.message : 'Fehler') }
                    finally { setTwilioLoading(false) }
                  }}
                  disabled={twilioLoading}
                  iconLeft={<Trash2Icon className="w-3.5 h-3.5" />}
                >
                  Nummer freigeben
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-claimondo-ondo">Noch keine eigene WhatsApp-Nummer zugewiesen. Kosten: ~1 EUR/Monat via Twilio.</p>
                <Button
                  variant="navy"
                  onClick={async () => {
                    setTwilioLoading(true); setTwilioMsg(null)
                    try { await provisionTwilioNummer(m.id as string); setTwilioMsg('Nummer zugewiesen!'); router.refresh() }
                    catch (e) { setTwilioMsg(e instanceof Error ? e.message : 'Fehler') }
                    finally { setTwilioLoading(false) }
                  }}
                  disabled={twilioLoading}
                  iconLeft={<PhoneIcon className="w-4 h-4" />}
                >
                  {twilioLoading ? 'Wird provisioniert...' : 'WhatsApp-Nummer zuweisen'}
                </Button>
              </div>
            )}
            {twilioMsg && <p className={`text-xs mt-2 ${twilioMsg.includes('!') ? 'text-success' : 'text-danger'}`}>{twilioMsg}</p>}
          </div>
        )}

        {/* AAR-343: 2FA-Reset — für Nummern-Wechsel oder wenn User ausgesperrt ist */}
        <div className="mt-5 bg-white border border-claimondo-border rounded-2xl p-5">
          <h3 className="text-sm font-medium text-claimondo-navy mb-3 flex items-center gap-2">
            <ShieldOffIcon className="w-4 h-4" /> Zwei-Faktor-Authentifizierung
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
              className="w-full bg-claimondo-bg border border-claimondo-border rounded-ios-xl px-3 py-2 text-claimondo-navy text-sm focus:outline-none focus:ring-2 focus:ring-claimondo-shield"
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
                className="flex items-center gap-1.5 bg-claimondo-shield hover:bg-claimondo-ondo disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-ios-xl transition-colors"
              >
                <ShieldOffIcon className="w-4 h-4" />
                {twofaLoading
                  ? 'Wird zurückgesetzt …'
                  : twofaNeuePhone.trim()
                    ? 'Nummer setzen + Tokens widerrufen'
                    : 'Nummer zurücksetzen + Tokens widerrufen'}
              </button>
              {/* F1 (Mitarbeiter-Audit): vollständiger 2FA-Reset — löscht ALLE Faktoren
                  (TOTP + SMS) und entsperrt ein ausgesperrtes Konto (Authenticator verloren). */}
              <button
                type="button"
                disabled={twofaLoading}
                onClick={async () => {
                  if (!confirm('Alle 2FA-Faktoren (Authenticator + SMS) dieses Mitarbeiters löschen und das Konto entsperren? Der Nutzer richtet die Zwei-Faktor-Authentifizierung beim nächsten Login neu ein.')) return
                  setTwofaLoading(true)
                  setTwofaMsg(null)
                  try {
                    const r = await clearTwoFaForUser(m.id as string)
                    if (!r.success) {
                      setTwofaMsg(r.error ?? 'Fehler')
                    } else {
                      setTwofaMsg('2FA vollständig zurückgesetzt — Konto entsperrt!')
                      setTwofaNeuePhone('')
                      router.refresh()
                    }
                  } catch (e) {
                    setTwofaMsg(e instanceof Error ? e.message : 'Fehler')
                  } finally {
                    setTwofaLoading(false)
                  }
                }}
                className="flex items-center gap-1.5 bg-danger hover:bg-danger/90 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-ios-xl transition-colors"
              >
                <ShieldOffIcon className="w-4 h-4" />
                2FA komplett zurücksetzen (entsperren)
              </button>
            </div>
            {twofaMsg && (
              <p className={`text-xs ${twofaMsg.includes('!') || twofaMsg.includes('entfernt') ? 'text-success' : 'text-danger'}`}>
                {twofaMsg}
              </p>
            )}
          </div>
        </div>

        {/* Task B (Aaron-Fund 13.07.): getrennte Handy-LOGIN-Nummer (SMS-OTP-Login =
            auth.users.phone). NICHT die 2FA-Nummer oben — die aktiviert KEINEN
            Handy-Login. Setzt die Login-Nummer via enablePhoneLogin. */}
        <div className="mt-5 bg-white border border-claimondo-border rounded-ios-lg p-5">
          <h3 className="text-sm font-medium text-claimondo-navy mb-3 flex items-center gap-2">
            <PhoneIcon className="w-4 h-4" /> Login per Handynummer (SMS-Code)
          </h3>
          <p className="text-xs text-claimondo-ondo mb-3">
            Nummer, mit der sich der Nutzer per SMS-Code einloggen kann — getrennt von
            der 2FA-Nummer oben (die setzt nur den Zweitfaktor, keinen Handy-Login).
            Aktuelle Login-Nummer: <span className="font-mono">{loginPhone ?? '—'}</span>
          </p>
          <div className="space-y-2">
            <input
              type="tel"
              value={loginPhoneInput}
              onChange={(e) => setLoginPhoneInput(e.target.value)}
              placeholder="Login-Handynummer inkl. Vorwahl (z. B. +49 151 1234 5678)"
              className="w-full bg-claimondo-bg border border-claimondo-border rounded-ios-xl px-3 py-2 text-claimondo-navy text-sm focus:outline-none focus:ring-2 focus:ring-claimondo-shield"
            />
            <Button
              variant="navy"
              disabled={loginPhoneLoading}
              iconLeft={<PhoneIcon className="w-4 h-4" />}
              onClick={async () => {
                if (!loginPhoneInput.trim()) {
                  setLoginPhoneMsg('Bitte eine Nummer eingeben')
                  return
                }
                if (!confirm(`Login-Handynummer auf "${loginPhoneInput.trim()}" setzen? Der Nutzer kann sich damit per SMS-Code einloggen.`)) return
                setLoginPhoneLoading(true)
                setLoginPhoneMsg(null)
                try {
                  const r = await setPhoneLoginNummer(m.id as string, loginPhoneInput)
                  if (!r.success) {
                    setLoginPhoneMsg(r.error ?? 'Fehler')
                  } else {
                    setLoginPhoneMsg('Login-Handynummer gesetzt!')
                    setLoginPhoneInput('')
                    router.refresh()
                  }
                } catch (e) {
                  setLoginPhoneMsg(e instanceof Error ? e.message : 'Fehler')
                } finally {
                  setLoginPhoneLoading(false)
                }
              }}
            >
              {loginPhoneLoading ? 'Wird gesetzt …' : 'Login-Handynummer setzen'}
            </Button>
            {loginPhoneMsg && (
              <p className={`text-xs ${loginPhoneMsg.includes('!') ? 'text-success' : 'text-danger'}`}>
                {loginPhoneMsg}
              </p>
            )}
          </div>
        </div>
      </div>
    </div></div>
    </EntityDetailShell>
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
