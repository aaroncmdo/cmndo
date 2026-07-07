'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeftIcon, MailIcon } from 'lucide-react'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge, type StatusBadgeTone } from '@/components/shared/StatusBadge'
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import { Button } from '@/components/primitives'
import { sendWerkstattLoginMail } from '../actions'
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

export default function WerkstattDetailClient({ detail }: { detail: WerkstattDetail }) {
  const { werkstatt: w, staffel, auftraege, lastSignInAt, forcePasswordChange, billing } = detail
  const [mailLoading, setMailLoading] = useState(false)

  const onboarding = leiteOnboardingStatus({ hatLogin: !!w.user_id, forcePasswordChange, lastSignInAt })
  const abrechnungPosten = billing ? Object.entries(billing.perStatus) : []

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

  const adresse =
    [w.adresse_strasse, [w.adresse_plz, w.adresse_ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'

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
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-heading-lg font-bold text-claimondo-navy">{w.name}</h1>
          <StatusBadge tone={STATUS_TON[w.status ?? ''] ?? 'neutral'} size="xs">
            {w.status ?? 'unbekannt'}
          </StatusBadge>
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
          <Button
            variant="navy"
            size="sm"
            loading={mailLoading}
            onClick={loginMail}
            iconLeft={<MailIcon className="w-4 h-4" />}
          >
            Login-Mail senden
          </Button>
        </div>
      </SectionCard>

      {/* Stammdaten */}
      <SectionCard title="Stammdaten">
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
    </div>
  )
}
