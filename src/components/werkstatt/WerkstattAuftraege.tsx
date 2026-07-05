'use client'

// Werkstatt-Portal „Aufträge": vermittelte + inbound Aufträge mit Gutachter,
// Besichtigungstermin und Fahrzeug. Quelle: v_werkstatt_auftrag (RLS-gegatet).
//
// SP2 Task 6: Reparaturtermin-Sektion je Auftrag (Badge + Wunschtermin +
// Aktions-Buttons Bestätigen / Anrufen / Ablehnen). Additiv — bestehende
// Auftrags-Darstellung bleibt unverändert.

import { useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

import type { WerkstattAuftrag } from '@/lib/werkstatt/queries'
import { reparaturTerminPhase, type ReparaturTerminStatus } from '@/lib/werkstatt/reparatur-termin-phase'
import {
  werkstattAuftragPhase,
  WERKSTATT_PHASE_ORDER,
  WERKSTATT_PHASE_META,
  richtungLabel,
  reparaturwunschLabel,
  operativeStatusLabel,
} from '@/lib/werkstatt/werkstatt-auftrag-phase'
import { formatBerlin } from '@/lib/google-calendar/timezone'
import {
  bestaetigeReparaturtermin,
  erbitteRueckruf,
  lehneReparaturterminAb,
  resendeKundenLink,
  oeffneKundenFlow,
  oeffneGutachtenPdf,
} from '@/app/werkstatt/(shell)/auftraege/actions'

import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button, Modal } from '@/components/primitives'
import { Chip, ChipRow } from '@/components/ui/Chip'
import type { StatusBadgeTone } from '@/components/shared/StatusBadge'

// ─────────────────────────────────────────────────────────────────────────────
// Hilfsfunktionen
// ─────────────────────────────────────────────────────────────────────────────

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const EUR2 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
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

// RICHTUNG_LABEL / operative_status-Label / reparaturwunsch-Label leben jetzt in
// @/lib/werkstatt/werkstatt-auftrag-phase (geteilt + normalisiert, testbar).

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
// AuftragAktionen — nachtraegliche Aktionen (P2): Kunden-Link resenden + Flow oeffnen
// ─────────────────────────────────────────────────────────────────────────────

function AuftragAktionen({ claimId }: { claimId: string }) {
  const [resendLaden, setResendLaden] = useState(false)
  const [flowLaden, setFlowLaden] = useState(false)

  async function handleResend() {
    setResendLaden(true)
    const r = await resendeKundenLink(claimId)
    setResendLaden(false)
    if (!r.ok) {
      toast.error(r.error ?? 'Versand fehlgeschlagen')
      return
    }
    toast.success(`Link erneut gesendet (${r.kanal === 'whatsapp' ? 'WhatsApp' : 'E-Mail'}).`)
  }

  async function handleFlow() {
    setFlowLaden(true)
    const r = await oeffneKundenFlow(claimId)
    setFlowLaden(false)
    if (!r.ok) {
      toast.error(r.error ?? 'Flow konnte nicht geöffnet werden')
      return
    }
    // Neuer Tab — die Werkstatt behaelt ihr Portal offen, waehrend sie den Kunden-Flow durchgeht.
    window.open(r.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Button variant="ghost" size="sm" loading={resendLaden} disabled={flowLaden} onClick={handleResend}>
        Link erneut senden
      </Button>
      <Button variant="ghost" size="sm" loading={flowLaden} disabled={resendLaden} onClick={handleFlow}>
        Flow öffnen
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GutachtenSektion — Kennzahlen + PDF-Download (SP3 Task 3)
// ─────────────────────────────────────────────────────────────────────────────

function GutachtenSektion({ auftrag }: { auftrag: WerkstattAuftrag }) {
  const [pdfLaden, setPdfLaden] = useState(false)

  if (!auftrag.gutachten_fertiggestellt_am) return null

  async function handlePdf() {
    setPdfLaden(true)
    // Fenster synchron im Klick-Gesture oeffnen (Popup-Blocker-sicher), dann URL setzen.
    const win = window.open('', '_blank')
    const result = await oeffneGutachtenPdf(auftrag.claim_id)
    setPdfLaden(false)
    if (!result.ok) {
      win?.close()
      toast.error(result.error ?? 'PDF konnte nicht geöffnet werden')
      return
    }
    if (win) win.location.href = result.url
    else window.open(result.url, '_blank')
  }

  const kennzahlen: Array<{ label: string; value: number | null }> = [
    { label: 'Reparaturkosten (brutto)', value: auftrag.gutachten_reparaturkosten_brutto },
    { label: 'Minderwert', value: auftrag.gutachten_minderwert },
    { label: 'Restwert', value: auftrag.gutachten_restwert },
    { label: 'Wiederbeschaffungswert', value: auftrag.gutachten_wiederbeschaffungswert },
  ]
  const sichtbar = kennzahlen.filter((k) => k.value != null)

  return (
    <SectionCard title="Gutachten" className="mt-3">
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-body-xs text-claimondo-ondo">
            vom{' '}
            {formatBerlin(auftrag.gutachten_fertiggestellt_am, {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })}
          </span>
          {auftrag.gutachten_totalschaden === true && (
            <StatusBadge tone="warning" size="xs">Totalschaden</StatusBadge>
          )}
        </div>

        {sichtbar.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {sichtbar.map((k) => (
              <div key={k.label} className="flex flex-col">
                <dt className="text-body-xs text-claimondo-ondo">{k.label}</dt>
                <dd className="text-body-sm font-medium text-claimondo-navy tabular-nums">
                  {EUR2.format(k.value as number)}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {auftrag.gutachten_reparaturkosten_netto != null && (
          <p className="text-body-xs text-claimondo-ondo">
            Reparaturkosten netto: {EUR2.format(auftrag.gutachten_reparaturkosten_netto)}
          </p>
        )}

        <div className="pt-1">
          <Button variant="ghost" size="sm" loading={pdfLaden} onClick={handlePdf}>
            Gutachten-PDF öffnen
          </Button>
        </div>
      </div>
    </SectionCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Haupt-Komponente
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  auftraege: WerkstattAuftrag[]
  werkstattName: string
}

type RichtungFilter = 'alle' | 'inbound' | 'vermittelt'

export function WerkstattAuftraege({ auftraege, werkstattName }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Filter-State aus der URL-Query (teilbar + refresh-stabil).
  const richtungFilter = (searchParams.get('richtung') as RichtungFilter | null) ?? 'alle'
  const statusFilter = useMemo(
    () => new Set((searchParams.get('status') ?? '').split(',').filter(Boolean)),
    [searchParams],
  )
  const wunschFilter = useMemo(
    () => new Set((searchParams.get('wunsch') ?? '').split(',').filter(Boolean)),
    [searchParams],
  )

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  function toggleInSet(key: string, current: Set<string>, value: string) {
    const next = new Set(current)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    updateParam(key, Array.from(next).join(','))
  }

  // Client-seitige Filterung (Liste ist klein — kein Server-Roundtrip).
  const gefiltert = useMemo(
    () =>
      auftraege.filter((a) => {
        if (richtungFilter !== 'alle' && a.richtung !== richtungFilter) return false
        if (statusFilter.size > 0 && !statusFilter.has(werkstattAuftragPhase(a).key)) return false
        if (wunschFilter.size > 0 && (!a.reparaturwunsch || !wunschFilter.has(a.reparaturwunsch)))
          return false
        return true
      }),
    [auftraege, richtungFilter, statusFilter, wunschFilter],
  )

  // Counts fuer die Chip-Anzeige (ueber alle Auftraege).
  const { phaseCounts, richtungCounts, wunschStats } = useMemo(() => {
    const phaseMap = new Map<string, number>()
    const wunsch = new Map<string, number>()
    let inbound = 0
    let vermittelt = 0
    for (const a of auftraege) {
      const key = werkstattAuftragPhase(a).key
      phaseMap.set(key, (phaseMap.get(key) ?? 0) + 1)
      if (a.reparaturwunsch) wunsch.set(a.reparaturwunsch, (wunsch.get(a.reparaturwunsch) ?? 0) + 1)
      if (a.richtung === 'inbound') inbound++
      else if (a.richtung === 'vermittelt') vermittelt++
    }
    return { phaseCounts: phaseMap, richtungCounts: { inbound, vermittelt }, wunschStats: wunsch }
  }, [auftraege])

  const hatFilter = richtungFilter !== 'alle' || statusFilter.size > 0 || wunschFilter.size > 0

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <header>
        <h1 className="text-heading-md text-claimondo-navy font-bold">Aufträge</h1>
        <p className="text-body text-claimondo-ondo mt-0.5">
          Ihre Aufträge für {werkstattName} — mit Gutachter und Besichtigungstermin.
        </p>
      </header>

      {/* Filterbubble — Richtung (Single) + Status/Reparaturwunsch (Multi). URL-State. */}
      {auftraege.length > 0 && (
        <div className="space-y-2">
          <ChipRow>
            <Chip
              variant={richtungFilter === 'alle' ? 'selected' : 'default'}
              count={auftraege.length}
              onClick={() => updateParam('richtung', null)}
            >
              Alle
            </Chip>
            <Chip
              variant={richtungFilter === 'inbound' ? 'selected' : 'default'}
              count={richtungCounts.inbound}
              onClick={() => updateParam('richtung', 'inbound')}
            >
              Meine Vermittlungen
            </Chip>
            <Chip
              variant={richtungFilter === 'vermittelt' ? 'selected' : 'default'}
              count={richtungCounts.vermittelt}
              onClick={() => updateParam('richtung', 'vermittelt')}
            >
              Aufträge
            </Chip>
          </ChipRow>

          <ChipRow>
            {WERKSTATT_PHASE_ORDER.map((key) => {
              const count = phaseCounts.get(key) ?? 0
              if (count === 0 && !statusFilter.has(key)) return null
              return (
                <Chip
                  key={key}
                  variant={statusFilter.has(key) ? 'selected' : 'default'}
                  count={count}
                  onClick={() => toggleInSet('status', statusFilter, key)}
                >
                  {WERKSTATT_PHASE_META[key].label}
                </Chip>
              )
            })}
            {[...wunschStats.keys()].map((w) => (
              <Chip
                key={`wunsch-${w}`}
                variant={wunschFilter.has(w) ? 'selected' : 'default'}
                count={wunschStats.get(w) ?? 0}
                onClick={() => toggleInSet('wunsch', wunschFilter, w)}
              >
                {reparaturwunschLabel(w)}
              </Chip>
            ))}
            {hatFilter && (
              <Chip variant="ghost" onClick={() => router.replace(pathname, { scroll: false })}>
                Zurücksetzen
              </Chip>
            )}
          </ChipRow>
        </div>
      )}

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
            {gefiltert.length === 0 ? (
              <Tr>
                <Td colSpan={7} className="text-center text-claimondo-ondo py-8">
                  {auftraege.length === 0
                    ? 'Noch keine Aufträge vorhanden. Sobald Ihnen ein Auftrag zugewiesen wird, erscheinen hier Fahrzeug, Gutachter und Besichtigungstermin.'
                    : 'Keine Aufträge für diese Filter. Setzen Sie die Filter zurück, um alle zu sehen.'}
                </Td>
              </Tr>
            ) : (
              gefiltert.map((a) => {
                const phase = werkstattAuftragPhase(a)
                const opLabel = operativeStatusLabel(a.operative_status)
                const wunsch = reparaturwunschLabel(a.reparaturwunsch)
                return (
                  <Tr key={a.claim_id}>
                    <Td>
                      <div className="text-claimondo-navy font-medium">{a.claim_nummer ?? '–'}</div>
                      {a.richtung && (
                        <div className="text-claimondo-ondo text-xs">{richtungLabel(a.richtung)}</div>
                      )}
                      {/* SP2 Task 6: Reparaturtermin-Sektion */}
                      <ReparaturterminSektion auftrag={a} />
                      {/* SP3 Task 3: Gutachten-Sektion */}
                      <GutachtenSektion auftrag={a} />
                      {/* P2: nachtraegliche Aktionen (Link resenden / Flow oeffnen) */}
                      <AuftragAktionen claimId={a.claim_id} />
                    </Td>
                    <Td className="text-body-sm">
                      <div className="text-claimondo-navy">{fahrzeugText(a)}</div>
                      {a.kennzeichen && (
                        <div className="text-claimondo-ondo text-xs font-mono">{a.kennzeichen}</div>
                      )}
                    </Td>
                    <Td className="text-body-sm">
                      <div className="text-claimondo-navy">{a.schadenart ?? '–'}</div>
                      {wunsch && <div className="text-claimondo-ondo text-xs">{wunsch}</div>}
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
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge tone={phase.ton} size="xs">
                          {phase.label}
                        </StatusBadge>
                        {opLabel && <span className="text-claimondo-ondo text-xs">{opLabel}</span>}
                      </div>
                    </Td>
                    <Td className="tabular-nums text-body-sm text-claimondo-navy">
                      {a.provision_betrag_netto != null ? EUR.format(a.provision_betrag_netto) : '–'}
                    </Td>
                  </Tr>
                )
              })
            )}
          </Tbody>
        </Table>
      </DataTableContainer>
    </div>
  )
}
