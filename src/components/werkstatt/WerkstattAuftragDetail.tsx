'use client'

// Werkstatt-Auftrag — Detailseite (D). Die Termin-/Gutachten-/Kunden-Aktionen leben
// HIER (statt inline in der Listen-Zeile). Segment-abhaengig: Reparatur-Auftrag
// (Termin bestaetigen/ablehnen, Gutachten nur bei Versicherung) vs Meine Vermittlung
// (Provisions-Info). Quelle: v_werkstatt_auftrag (RLS-gegatet, via getWerkstattAuftrag).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import type { WerkstattAuftrag } from '@/lib/werkstatt/queries'
import { reparaturTerminPhase, type ReparaturTerminStatus } from '@/lib/werkstatt/reparatur-termin-phase'
import {
  werkstattAuftragSegment,
  abrechnungswegLabel,
  zeigtGutachten,
} from '@/lib/werkstatt/werkstatt-auftrag-segment'
import { formatBerlin } from '@/lib/google-calendar/timezone'
import {
  bestaetigeReparaturtermin,
  erbitteRueckruf,
  lehneReparaturterminAb,
  resendeKundenLink,
  oeffneKundenFlow,
  oeffneGutachtenPdf,
} from '@/app/werkstatt/(shell)/auftraege/actions'

import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import type { StatusBadgeTone } from '@/components/shared/StatusBadge'
import { Button, Modal } from '@/components/primitives'

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const EUR2 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

const TON_TO_BADGE_TONE: Record<'neutral' | 'info' | 'success' | 'warning', StatusBadgeTone> = {
  neutral: 'neutral',
  info: 'info',
  success: 'success',
  warning: 'warning',
}

// ─────────────────────────────────────────────────────────────────────────────
// ReparaturterminSektion — Termin bestätigen / anrufen / ablehnen
// ─────────────────────────────────────────────────────────────────────────────

function ReparaturterminSektion({ auftrag }: { auftrag: WerkstattAuftrag }) {
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

  const aktionOffen = status === 'angefragt' || status === 'anruf_erbeten'

  async function handleBestaetigen() {
    setBestätigenLaden(true)
    const result = await bestaetigeReparaturtermin(terminId, auftrag.reparatur_wunschtermin ?? undefined)
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
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge tone={badgeTone} size="xs">{phase.label}</StatusBadge>
            {terminAnzeige && (
              <span className="text-body-sm text-claimondo-navy">{terminAnzeige}</span>
            )}
          </div>

          {status === 'abgelehnt' && auftrag.reparatur_absage_grund && (
            <p className="text-body-sm text-claimondo-ondo">
              Grund: {auftrag.reparatur_absage_grund}
            </p>
          )}

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
          <h2 className="text-heading-sm text-claimondo-navy font-semibold">Termin ablehnen</h2>
          <p className="text-body-sm text-claimondo-ondo">
            Möchten Sie den Wunschtermin des Kunden ablehnen? Der Kunde wird per E-Mail
            informiert. Optional können Sie einen Grund angeben.
          </p>
          <div className="space-y-1">
            <label htmlFor="absage-grund" className="text-body-xs font-medium text-claimondo-navy">
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
            <Button variant="danger" size="sm" loading={ablehnenLaden} onClick={handleAblehnen}>
              Ablehnen bestätigen
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AuftragAktionen — Kunden-Link resenden + Flow öffnen
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
// GutachtenSektion — Kennzahlen + PDF-Download (nur Versicherungs-Fälle)
// ─────────────────────────────────────────────────────────────────────────────

function GutachtenSektion({ auftrag }: { auftrag: WerkstattAuftrag }) {
  const [pdfLaden, setPdfLaden] = useState(false)

  if (!auftrag.gutachten_fertiggestellt_am) return null

  async function handlePdf() {
    setPdfLaden(true)
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
// WerkstattAuftragDetail — Haupt-Komponente
// ─────────────────────────────────────────────────────────────────────────────

export function WerkstattAuftragDetail({ auftrag }: { auftrag: WerkstattAuftrag }) {
  const segment = werkstattAuftragSegment(auftrag)
  const typ = abrechnungswegLabel(auftrag.abrechnungsweg)

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <header className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-heading-md text-claimondo-navy font-bold">
            {auftrag.claim_nummer ?? 'Auftrag'}
          </h1>
          {typ && (
            <StatusBadge tone="neutral" size="xs">{typ}</StatusBadge>
          )}
          {auftrag.meine_rolle === 'beide' && auftrag.provision_betrag_netto != null && (
            <StatusBadge tone="info" size="xs">
              + {EUR.format(auftrag.provision_betrag_netto)} Vermittlung
            </StatusBadge>
          )}
        </div>
        <p className="text-body-sm text-claimondo-ondo">
          {[auftrag.fahrzeug_hersteller, auftrag.fahrzeug_modell].filter(Boolean).join(' ') || '–'}
          {auftrag.kennzeichen ? ` · ${auftrag.kennzeichen}` : ''}
        </p>
      </header>

      <SectionCard title="Fall">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-body-sm">
          <div>
            <dt className="text-body-xs text-claimondo-ondo">Schaden</dt>
            <dd className="text-claimondo-navy">{auftrag.schadenart ?? '–'}</dd>
          </div>
          <div>
            <dt className="text-body-xs text-claimondo-ondo">Gutachter</dt>
            <dd className="text-claimondo-navy">{auftrag.gutachter_firmenname ?? '–'}</dd>
          </div>
        </dl>
      </SectionCard>

      {segment === 'reparatur' ? (
        <>
          <ReparaturterminSektion auftrag={auftrag} />
          {zeigtGutachten(auftrag.abrechnungsweg) && <GutachtenSektion auftrag={auftrag} />}
          <AuftragAktionen claimId={auftrag.claim_id} />
        </>
      ) : (
        <SectionCard title="Meine Vermittlung">
          <p className="text-body-sm text-claimondo-ondo">
            Du hast diesen Kunden an Claimondo vermittelt.
            {auftrag.provision_betrag_netto != null
              ? ` Provision: ${EUR.format(auftrag.provision_betrag_netto)} (${auftrag.provision_status ?? 'offen'}).`
              : ''}
          </p>
          <div className="mt-2">
            <AuftragAktionen claimId={auftrag.claim_id} />
          </div>
        </SectionCard>
      )}
    </div>
  )
}
