'use client'

// Werkstatt-Portal „Aufträge": vermittelte + inbound Aufträge mit Gutachter,
// Besichtigungstermin und Fahrzeug. Quelle: v_werkstatt_auftrag (RLS-gegatet).
//
// SP2 Task 6: Reparaturtermin-Sektion je Auftrag (Badge + Wunschtermin +
// Aktions-Buttons Bestätigen / Anrufen / Ablehnen). Additiv — bestehende
// Auftrags-Darstellung bleibt unverändert.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import type { WerkstattAuftrag } from '@/lib/werkstatt/queries'
import { reparaturTerminPhase, type ReparaturTerminStatus } from '@/lib/werkstatt/reparatur-termin-phase'
import { formatBerlin } from '@/lib/google-calendar/timezone'
import {
  bestaetigeReparaturtermin,
  erbitteRueckruf,
  lehneReparaturterminAb,
} from '@/app/werkstatt/(shell)/auftraege/actions'

import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button, Modal } from '@/components/primitives'
import type { StatusBadgeTone } from '@/components/shared/StatusBadge'

// ─────────────────────────────────────────────────────────────────────────────
// Hilfsfunktionen
// ─────────────────────────────────────────────────────────────────────────────

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const DATETIME = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin',
})

function fmtTermin(iso: string | null): string {
  if (!iso) return 'Noch offen'
  return `${DATETIME.format(new Date(iso))} Uhr`
}

function fahrzeugText(a: WerkstattAuftrag): string {
  const parts = [a.fahrzeug_hersteller, a.fahrzeug_modell].filter(Boolean)
  return parts.length ? parts.join(' ') : '–'
}

const RICHTUNG_LABEL: Record<string, string> = {
  vermittelt: 'Vermittelt',
  inbound: 'Eigener Kunde',
}

const OP_STATUS_LABEL: Record<string, string> = {
  ersterfassung: 'In Erfassung',
  'sv-termin': 'Gutachter-Termin',
}

function opStatusLabel(s: string | null): string {
  if (!s) return '–'
  return OP_STATUS_LABEL[s] ?? s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, ' ')
}

// ton → StatusBadge-tone-Mapping (Token-basiert, keine raw Status-Scales)
const TON_TO_BADGE_TONE: Record<'neutral' | 'info' | 'success' | 'warning', StatusBadgeTone> = {
  neutral: 'neutral',
  info: 'info',
  success: 'success',
  warning: 'warning',
}

// ─────────────────────────────────────────────────────────────────────────────
// ReparaturterminSektion — Sub-Komponente für die Termin-Aktions-UI
// ─────────────────────────────────────────────────────────────────────────────

type ReparaturterminSektionProps = {
  auftrag: WerkstattAuftrag
}

function ReparaturterminSektion({ auftrag }: ReparaturterminSektionProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [ablehnungOffen, setAblehnungOffen] = useState(false)
  const [absageGrund, setAbsageGrund] = useState('')
  const [ablehnenLaden, setAblehnenLaden] = useState(false)
  const [bestätigenLaden, setBestätigenLaden] = useState(false)
  const [anrufLaden, setAnrufLaden] = useState(false)

  const terminId: string = auftrag.reparatur_termin_id ?? ''
  if (!terminId) return null

  const status = auftrag.reparatur_termin_status as ReparaturTerminStatus | null
  const phase = reparaturTerminPhase(status)
  const badgeTone = TON_TO_BADGE_TONE[phase.ton]

  // Wunschtermin oder bestätigter Termin anzeigen
  const terminIso = auftrag.reparatur_bestaetigter_termin ?? auftrag.reparatur_wunschtermin
  const terminAnzeige = terminIso
    ? formatBerlin(terminIso, {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' Uhr'
    : null

  // Aktionen nur bei offenen Status
  const aktionOffen = status === 'angefragt' || status === 'anruf_erbeten'

  async function handleBestaetigen() {
    setBestätigenLaden(true)
    const result = await bestaetigeReparaturtermin(
      terminId,
      auftrag.reparatur_wunschtermin ?? undefined,
    )
    setBestätigenLaden(false)
    if (!result.ok) {
      toast.error(result.error ?? 'Bestätigung fehlgeschlagen')
      return
    }
    toast.success('Termin bestätigt – der Kunde wird informiert.')
    startTransition(() => router.refresh())
  }

  async function handleAnrufen() {
    setAnrufLaden(true)
    const result = await erbitteRueckruf(terminId)
    setAnrufLaden(false)
    if (!result.ok) {
      toast.error(result.error ?? 'Aktion fehlgeschlagen')
      return
    }
    toast.success('Der Kunde wird über den bevorstehenden Anruf informiert.')
    startTransition(() => router.refresh())
  }

  async function handleAblehnen() {
    setAblehnenLaden(true)
    const result = await lehneReparaturterminAb(terminId, absageGrund || undefined)
    setAblehnenLaden(false)
    if (!result.ok) {
      toast.error(result.error ?? 'Ablehnung fehlgeschlagen')
      return
    }
    setAblehnungOffen(false)
    setAbsageGrund('')
    toast.success('Termin abgelehnt – der Kunde wird informiert.')
    startTransition(() => router.refresh())
  }

  return (
    <>
      <SectionCard title="Reparaturtermin" className="mt-3">
        <div className="space-y-3">
          {/* Status-Badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge tone={badgeTone} size="xs">{phase.label}</StatusBadge>
            {terminAnzeige && (
              <span className="text-body-sm text-claimondo-navy">{terminAnzeige}</span>
            )}
          </div>

          {/* Absagegrund */}
          {status === 'abgelehnt' && auftrag.reparatur_absage_grund && (
            <p className="text-body-sm text-claimondo-ondo">
              Grund: {auftrag.reparatur_absage_grund}
            </p>
          )}

          {/* Aktions-Buttons */}
          {aktionOffen && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="navy"
                size="sm"
                loading={bestätigenLaden || isPending}
                disabled={anrufLaden || ablehnenLaden}
                onClick={handleBestaetigen}
              >
                Termin bestätigen
              </Button>
              <Button
                variant="ghost"
                size="sm"
                loading={anrufLaden || isPending}
                disabled={bestätigenLaden || ablehnenLaden}
                onClick={handleAnrufen}
              >
                Anrufen / telefonisch klären
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={bestätigenLaden || anrufLaden || ablehnenLaden}
                onClick={() => setAblehnungOffen(true)}
              >
                Ablehnen
              </Button>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Ablehnungs-Modal */}
      <Modal
        open={ablehnungOffen}
        onClose={() => {
          if (!ablehnenLaden) {
            setAblehnungOffen(false)
            setAbsageGrund('')
          }
        }}
        ariaLabel="Reparaturtermin ablehnen"
        maxWidth={480}
      >
        <div className="space-y-4">
          <h2 className="text-heading-sm text-claimondo-navy font-semibold">
            Termin ablehnen
          </h2>
          <p className="text-body-sm text-claimondo-ondo">
            Möchten Sie den Wunschtermin des Kunden ablehnen? Der Kunde wird
            per E-Mail informiert. Optional können Sie einen Grund angeben.
          </p>
          <div className="space-y-1">
            <label
              htmlFor="absage-grund"
              className="text-body-xs font-medium text-claimondo-navy"
            >
              Grund (optional)
            </label>
            <textarea
              id="absage-grund"
              value={absageGrund}
              onChange={(e) => setAbsageGrund(e.target.value)}
              placeholder="z.B. Kapazitäten ausgebucht, bitte neuen Termin wählen."
              rows={3}
              disabled={ablehnenLaden}
              className="w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2 text-body-sm text-claimondo-navy placeholder:text-claimondo-ondo/60 focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/30 disabled:opacity-50 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={ablehnenLaden}
              onClick={() => {
                setAblehnungOffen(false)
                setAbsageGrund('')
              }}
            >
              Abbrechen
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={ablehnenLaden}
              onClick={handleAblehnen}
            >
              Ablehnen bestätigen
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Haupt-Komponente
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  auftraege: WerkstattAuftrag[]
  werkstattName: string
}

export function WerkstattAuftraege({ auftraege, werkstattName }: Props) {
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-heading-md text-claimondo-navy font-bold">Aufträge</h1>
        <p className="text-body text-claimondo-ondo mt-0.5">
          Ihre Aufträge für {werkstattName} — mit Gutachter und Besichtigungstermin.
        </p>
      </header>

      <DataTableContainer>
        <Table>
          <Thead>
            <Tr>
              <Th>Auftrag</Th>
              <Th>Fahrzeug</Th>
              <Th>Schaden</Th>
              <Th>Gutachter</Th>
              <Th>Besichtigung</Th>
              <Th>Status</Th>
              <Th>Provision</Th>
            </Tr>
          </Thead>
          <Tbody>
            {auftraege.length === 0 ? (
              <Tr>
                <Td colSpan={7} className="text-center text-claimondo-ondo py-8">
                  Noch keine Aufträge vorhanden. Sobald Ihnen ein Auftrag zugewiesen wird,
                  erscheinen hier Fahrzeug, Gutachter und Besichtigungstermin.
                </Td>
              </Tr>
            ) : (
              auftraege.map((a) => (
                <Tr key={a.claim_id}>
                  <Td>
                    <div className="text-claimondo-navy font-medium">{a.claim_nummer ?? '–'}</div>
                    {a.richtung && (
                      <div className="text-claimondo-ondo text-xs">
                        {RICHTUNG_LABEL[a.richtung] ?? a.richtung}
                      </div>
                    )}
                    {/* SP2 Task 6: Reparaturtermin-Sektion */}
                    <ReparaturterminSektion auftrag={a} />
                  </Td>
                  <Td className="text-body-sm">
                    <div className="text-claimondo-navy">{fahrzeugText(a)}</div>
                    {a.kennzeichen && (
                      <div className="text-claimondo-ondo text-xs font-mono">{a.kennzeichen}</div>
                    )}
                  </Td>
                  <Td className="text-body-sm">
                    <div className="text-claimondo-navy">{a.schadenart ?? '–'}</div>
                    {a.reparaturwunsch && (
                      <div className="text-claimondo-ondo text-xs">{a.reparaturwunsch}</div>
                    )}
                  </Td>
                  <Td className="text-body-sm text-claimondo-navy">
                    {a.gutachter_firmenname ?? '–'}
                  </Td>
                  <Td className="text-body-sm">
                    <div className="text-claimondo-navy">{fmtTermin(a.besichtigung_start)}</div>
                    {a.besichtigung_ort && (
                      <div className="text-claimondo-ondo text-xs">{a.besichtigung_ort}</div>
                    )}
                  </Td>
                  <Td>
                    {a.operative_status && (
                      <span className="inline-flex items-center rounded-full bg-claimondo-bg px-2.5 py-1 text-body-xs font-semibold text-claimondo-navy">
                        {opStatusLabel(a.operative_status)}
                      </span>
                    )}
                  </Td>
                  <Td className="tabular-nums text-body-sm text-claimondo-navy">
                    {a.provision_betrag_netto != null ? EUR.format(a.provision_betrag_netto) : '–'}
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </DataTableContainer>
    </div>
  )
}
