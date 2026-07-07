'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeftIcon, MailIcon, PencilIcon, LockIcon, CheckCircle2Icon } from 'lucide-react'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge, type StatusBadgeTone } from '@/components/shared/StatusBadge'
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import { Button, Modal } from '@/components/primitives'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { sendWerkstattLoginMail } from '../actions'
import {
  aktualisiereWerkstattStammdaten,
  setzeWerkstattStatus,
  aktualisiereWerkstattEmail,
  aktualisiereWerkstattAdresse,
  type WerkstattStatus,
} from './actions'
import { leiteOnboardingStatus } from '@/lib/werkstatt/onboarding-status'
import { werkstattAuftragPhase, richtungLabel } from '@/lib/werkstatt/werkstatt-auftrag-phase'
import type { WerkstattDetail } from './detail-data'

const STATUS_TON: Record<string, StatusBadgeTone> = {
  aktiv: 'success',
  inaktiv: 'neutral',
  gesperrt: 'danger',
}

const FAEHIGKEIT_LABEL: Record<string, string> = {
  karosserie: 'Karosserie',
  lackierung: 'Lackierung',
  mechanik: 'Mechanik',
  glas: 'Glas',
  smart_repair: 'Smart-Repair',
}

const STATUS_NORM_LABEL: Record<string, string> = {
  gehalten: 'Gehalten',
  freigegeben: 'Freigegeben',
  erledigt: 'Ausgezahlt',
  storniert: 'Storniert',
  offen: 'Offen',
  faellig: 'Fällig',
}

const INPUT_CLS =
  'w-full px-3 py-2 rounded-ios-md border border-claimondo-border bg-white text-body-sm text-claimondo-navy focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/20'

function euro(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}
function datum(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
}

function Feld({ label, wert }: { label: string; wert: string }) {
  return (
    <div>
      <dt className="text-body-xs text-claimondo-ondo">{label}</dt>
      <dd className="text-claimondo-navy">{wert}</dd>
    </div>
  )
}

function EditFeld({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div>
      <label className="block text-body-xs font-medium text-claimondo-navy mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLS} />
    </div>
  )
}

export default function WerkstattDetailClient({ detail }: { detail: WerkstattDetail }) {
  const router = useRouter()
  const { werkstatt: w, staffel, auftraege, lastSignInAt, forcePasswordChange, billing } = detail
  const [mailLoading, setMailLoading] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editBusy, setEditBusy] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)
  const [adresseOpen, setAdresseOpen] = useState(false)
  const [adresseBusy, setAdresseBusy] = useState(false)
  const [neueAdresse, setNeueAdresse] = useState<PlaceResult | null>(null)
  const [form, setForm] = useState({
    name: w.name ?? '',
    telefon: w.telefon ?? '',
    ansprechpartner_name: w.ansprechpartner_name ?? '',
    website: w.website ?? '',
    provision_betrag_netto: w.provision_betrag_netto == null ? '' : String(w.provision_betrag_netto),
    provision_aktiv: w.provision_aktiv !== false,
    bank_iban: w.bank_iban ?? '',
    bank_bic: w.bank_bic ?? '',
    bank_kontoinhaber: w.bank_kontoinhaber ?? '',
  })

  const onboarding = leiteOnboardingStatus({ hatLogin: !!w.user_id, forcePasswordChange, lastSignInAt })
  const abrechnungPosten = billing ? Object.entries(billing.perStatus) : []
  const adresse =
    [w.adresse_strasse, [w.adresse_plz, w.adresse_ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'

  async function loginMail() {
    setMailLoading(true)
    try {
      const res = await sendWerkstattLoginMail(w.id)
      if (!res.ok) {
        toast.error(res.error ?? 'Fehler beim Senden')
        return
      }
      toast.success(`Login-Mail gesendet an ${w.email ?? 'die Werkstatt'}`)
    } finally {
      setMailLoading(false)
    }
  }

  async function statusAendern(neu: WerkstattStatus) {
    let grund: string | undefined
    if (neu === 'gesperrt') {
      const g = window.prompt('Grund für die Sperrung?')
      if (g === null) return // abgebrochen
      grund = g
    }
    setStatusBusy(true)
    try {
      const res = await setzeWerkstattStatus(w.id, neu, grund)
      if (!res.ok) {
        toast.error(res.error ?? 'Fehler')
        return
      }
      toast.success(
        neu === 'gesperrt' ? 'Werkstatt gesperrt' : neu === 'aktiv' ? 'Werkstatt aktiviert' : 'Werkstatt deaktiviert',
      )
      router.refresh()
    } finally {
      setStatusBusy(false)
    }
  }

  async function speichereStammdaten() {
    setEditBusy(true)
    try {
      const res = await aktualisiereWerkstattStammdaten(w.id, {
        name: form.name,
        telefon: form.telefon || null,
        ansprechpartner_name: form.ansprechpartner_name || null,
        website: form.website || null,
        provision_betrag_netto: Number(form.provision_betrag_netto) || 0,
        provision_aktiv: form.provision_aktiv,
        bank_iban: form.bank_iban || null,
        bank_bic: form.bank_bic || null,
        bank_kontoinhaber: form.bank_kontoinhaber || null,
      })
      if (!res.ok) {
        toast.error(res.error ?? 'Fehler')
        return
      }
      toast.success('Stammdaten gespeichert')
      setEditOpen(false)
      router.refresh()
    } finally {
      setEditBusy(false)
    }
  }

  async function emailAendern() {
    const neu = window.prompt('Neue (Login-)E-Mail-Adresse:', w.email ?? '')
    if (neu === null) return
    setEmailBusy(true)
    try {
      const res = await aktualisiereWerkstattEmail(w.id, neu)
      if (!res.ok) {
        toast.error(res.error ?? 'Fehler')
        return
      }
      toast.success('E-Mail geändert')
      router.refresh()
    } finally {
      setEmailBusy(false)
    }
  }

  async function speichereAdresse() {
    if (!neueAdresse) {
      toast.error('Bitte eine Adresse aus den Vorschlägen wählen.')
      return
    }
    setAdresseBusy(true)
    try {
      const res = await aktualisiereWerkstattAdresse(w.id, {
        adresse_strasse: neueAdresse.strasse,
        adresse_plz: neueAdresse.plz,
        adresse_ort: neueAdresse.stadt,
        lat: neueAdresse.lat,
        lng: neueAdresse.lng,
      })
      if (!res.ok) {
        toast.error(res.error ?? 'Fehler')
        return
      }
      toast.success('Adresse geändert — Fahrgebiet neu berechnet')
      setAdresseOpen(false)
      setNeueAdresse(null)
      router.refresh()
    } finally {
      setAdresseBusy(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div>
        <Link
          href="/admin/werkstaetten"
          className="inline-flex items-center gap-1 text-body-sm text-claimondo-ondo hover:text-claimondo-navy mb-3 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" /> Alle Werkstätten
        </Link>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-heading-lg font-bold text-claimondo-navy">{w.name}</h1>
            <StatusBadge tone={STATUS_TON[w.status ?? ''] ?? 'neutral'} size="xs">
              {w.status ?? 'unbekannt'}
            </StatusBadge>
          </div>
          <div className="flex items-center gap-2">
            {w.status === 'aktiv' ? (
              <>
                <Button variant="ghost" size="sm" loading={statusBusy} onClick={() => statusAendern('inaktiv')}>
                  Deaktivieren
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={statusBusy}
                  onClick={() => statusAendern('gesperrt')}
                  iconLeft={<LockIcon className="w-4 h-4" />}
                >
                  Sperren
                </Button>
              </>
            ) : (
              <Button
                variant="navy"
                size="sm"
                loading={statusBusy}
                onClick={() => statusAendern('aktiv')}
                iconLeft={<CheckCircle2Icon className="w-4 h-4" />}
              >
                Aktivieren
              </Button>
            )}
          </div>
        </div>
        <p className="text-body-sm text-claimondo-ondo mt-1">Aktiviert am {datum(w.aktiviert_am)}</p>
      </div>

      {/* Zugang & Onboarding */}
      <SectionCard title="Zugang & Onboarding">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1.5">
            <StatusBadge tone={onboarding.ton} size="xs">
              {onboarding.label}
            </StatusBadge>
            <p className="text-body-sm text-claimondo-ondo">
              {w.email ?? '—'} · Letzter Login: {datum(lastSignInAt)}
            </p>
          </div>
          <div className="flex flex-col gap-2 items-stretch">
            <Button
              variant="navy"
              size="sm"
              loading={mailLoading}
              onClick={loginMail}
              iconLeft={<MailIcon className="w-4 h-4" />}
            >
              Login-Mail senden
            </Button>
            <Button variant="ghost" size="sm" loading={emailBusy} onClick={emailAendern}>
              E-Mail ändern
            </Button>
          </div>
        </div>
      </SectionCard>

      {/* Stammdaten */}
      <SectionCard title="Stammdaten">
        <div className="flex justify-end gap-2 mb-2">
          <Button variant="ghost" size="sm" onClick={() => setAdresseOpen(true)}>
            Adresse ändern
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)} iconLeft={<PencilIcon className="w-4 h-4" />}>
            Bearbeiten
          </Button>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-body-sm">
          <Feld label="Adresse" wert={adresse} />
          <Feld label="Ansprechpartner" wert={w.ansprechpartner_name ?? '—'} />
          <Feld label="Telefon" wert={w.telefon ?? '—'} />
          <Feld label="E-Mail" wert={w.email ?? '—'} />
          <Feld
            label="Provision (netto)"
            wert={`${euro(w.provision_betrag_netto)}${w.provision_aktiv === false ? ' (inaktiv)' : ''}`}
          />
          <Feld
            label="USt-Status"
            wert={w.ist_kleinunternehmer == null ? 'unbekannt' : w.ist_kleinunternehmer ? 'Kleinunternehmer' : 'USt-pflichtig'}
          />
          <Feld label="Bank (IBAN)" wert={w.bank_iban ?? '—'} />
          <Feld label="Website" wert={w.website ?? '—'} />
        </dl>
      </SectionCard>

      {/* Aktivität / Aufträge */}
      <SectionCard
        title={`Aktivität — ${auftraege.length} ${auftraege.length === 1 ? 'Auftrag/Vermittlung' : 'Aufträge/Vermittlungen'}`}
      >
        {auftraege.length === 0 ? (
          <p className="text-body-sm text-claimondo-ondo">Noch keine Aufträge oder Vermittlungen.</p>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Fall</Th>
                <Th>Fahrzeug</Th>
                <Th>Richtung</Th>
                <Th>Status</Th>
                <Th className="text-right">Provision</Th>
              </Tr>
            </Thead>
            <Tbody>
              {auftraege.map((a) => {
                const phase = werkstattAuftragPhase(a)
                const fahrzeug =
                  [a.fahrzeug_hersteller, a.fahrzeug_modell].filter(Boolean).join(' ') +
                  (a.kennzeichen ? ` · ${a.kennzeichen}` : '')
                return (
                  <Tr key={a.claim_id}>
                    <Td className="font-mono">{a.claim_nummer ?? '—'}</Td>
                    <Td>{fahrzeug || '—'}</Td>
                    <Td>{richtungLabel(a.richtung)}</Td>
                    <Td>
                      <StatusBadge tone={phase.ton} size="xs">
                        {phase.label}
                      </StatusBadge>
                    </Td>
                    <Td className="text-right tabular-nums">{euro(a.provision_betrag_netto)}</Td>
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
        )}
      </SectionCard>

      {/* Abrechnung */}
      <SectionCard title="Abrechnung">
        {abrechnungPosten.length === 0 ? (
          <p className="text-body-sm text-claimondo-ondo">Noch keine Abrechnungsposten.</p>
        ) : (
          <div className="flex flex-wrap gap-6">
            {abrechnungPosten.map(([key, v]) => {
              const statusNorm = key.split(':')[1] ?? key
              return (
                <div key={key} className="min-w-[110px]">
                  <p className="text-body-xs text-claimondo-ondo">{STATUS_NORM_LABEL[statusNorm] ?? statusNorm}</p>
                  <p className="text-body font-semibold text-claimondo-navy tabular-nums">{euro(v.netto)}</p>
                  <p className="text-body-xs text-claimondo-ondo">{v.anzahl} Posten</p>
                </div>
              )
            })}
          </div>
        )}
        {billing?.hat_unbekannten_ust_status && (
          <p className="mt-3 text-body-xs text-warning-strong">
            USt-Status unbekannt — Auszahlung ist gesperrt, bitte in der Abrechnung erfassen.
          </p>
        )}
      </SectionCard>

      {/* Fähigkeiten & Staffelung */}
      <SectionCard title="Fähigkeiten & Staffelung">
        <div className="space-y-3">
          <div>
            <p className="text-body-xs text-claimondo-ondo mb-1">Fähigkeiten</p>
            <p className="text-body-sm text-claimondo-navy">
              {w.faehigkeiten && w.faehigkeiten.length > 0
                ? w.faehigkeiten.map((f) => FAEHIGKEIT_LABEL[f] ?? f).join(', ')
                : 'Vollservice (keine Einschränkung)'}
            </p>
          </div>
          <div>
            <p className="text-body-xs text-claimondo-ondo mb-1">Staffel-Boni</p>
            {staffel.length === 0 ? (
              <p className="text-body-sm text-claimondo-ondo">Keine Staffel-Stufen hinterlegt.</p>
            ) : (
              <ul className="text-body-sm text-claimondo-navy space-y-0.5">
                {staffel.map((s, i) => (
                  <li key={i}>
                    ab {s.schwelle} Vermittlungen → {euro(s.bonus_betrag_netto)} Bonus
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Stammdaten-Bearbeiten-Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} maxWidth={520} ariaLabel="Werkstatt bearbeiten">
        <h2 className="text-heading-sm font-semibold text-claimondo-navy mb-4">Stammdaten bearbeiten</h2>
        <div className="space-y-3">
          <EditFeld label="Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <EditFeld label="Telefon" value={form.telefon} onChange={(v) => setForm((f) => ({ ...f, telefon: v }))} />
            <EditFeld
              label="Ansprechpartner"
              value={form.ansprechpartner_name}
              onChange={(v) => setForm((f) => ({ ...f, ansprechpartner_name: v }))}
            />
          </div>
          <EditFeld label="Website" value={form.website} onChange={(v) => setForm((f) => ({ ...f, website: v }))} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <EditFeld
              label="Provision (netto, €)"
              type="number"
              value={form.provision_betrag_netto}
              onChange={(v) => setForm((f) => ({ ...f, provision_betrag_netto: v }))}
            />
            <label className="flex items-center gap-2 text-body-sm text-claimondo-navy py-2">
              <input
                type="checkbox"
                checked={form.provision_aktiv}
                onChange={(e) => setForm((f) => ({ ...f, provision_aktiv: e.target.checked }))}
              />
              Provision aktiv
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <EditFeld label="IBAN" value={form.bank_iban} onChange={(v) => setForm((f) => ({ ...f, bank_iban: v }))} />
            <EditFeld label="BIC" value={form.bank_bic} onChange={(v) => setForm((f) => ({ ...f, bank_bic: v }))} />
          </div>
          <EditFeld
            label="Kontoinhaber"
            value={form.bank_kontoinhaber}
            onChange={(v) => setForm((f) => ({ ...f, bank_kontoinhaber: v }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setEditOpen(false)}>
              Abbrechen
            </Button>
            <Button variant="navy" size="sm" loading={editBusy} onClick={speichereStammdaten}>
              Speichern
            </Button>
          </div>
        </div>
      </Modal>

      {/* Adresse-Modal (GooglePlaceAutocomplete -> lat/lng -> Isochrone-Neuberechnung) */}
      <Modal
        open={adresseOpen}
        onClose={() => {
          setAdresseOpen(false)
          setNeueAdresse(null)
        }}
        maxWidth={480}
        ariaLabel="Adresse ändern"
      >
        <h2 className="text-heading-sm font-semibold text-claimondo-navy mb-2">Adresse ändern</h2>
        <p className="text-body-xs text-claimondo-ondo mb-3">Aktuell: {adresse}</p>
        <div className="space-y-3">
          <div>
            <label className="block text-body-xs font-medium text-claimondo-navy mb-1">
              Neue Adresse (aus den Vorschlägen wählen)
            </label>
            <GooglePlaceAutocomplete placeholder="Adresse eingeben…" onSelect={(r) => setNeueAdresse(r)} />
          </div>
          {neueAdresse && <p className="text-body-sm text-claimondo-navy">Gewählt: {neueAdresse.adresse}</p>}
          <p className="text-body-xs text-claimondo-ondo">Das 30-Minuten-Fahrgebiet wird neu berechnet.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdresseOpen(false)
                setNeueAdresse(null)
              }}
            >
              Abbrechen
            </Button>
            <Button variant="navy" size="sm" loading={adresseBusy} disabled={!neueAdresse} onClick={speichereAdresse}>
              Speichern
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
