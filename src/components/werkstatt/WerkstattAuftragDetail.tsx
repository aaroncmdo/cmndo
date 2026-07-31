'use client'

// Werkstatt-Auftrag — Detailseite (D). Die Termin-/Gutachten-/Kunden-Aktionen leben
// HIER (statt inline in der Listen-Zeile). Segment-abhaengig: Reparatur-Auftrag
// (Termin bestaetigen/ablehnen, Gutachten nur bei Versicherung) vs Meine Vermittlung
// (Provisions-Info). Quelle: v_werkstatt_auftrag (RLS-gegatet, via getWerkstattAuftrag).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import type { WerkstattAuftrag, WerkstattAuftragExtra, WerkstattChatMessage } from '@/lib/werkstatt/queries'
import { WerkstattChatTab } from '@/components/werkstatt/WerkstattChatTab'
import { WerkstattCopilotPanel } from '@/components/werkstatt/WerkstattCopilotPanel'
import { reparaturTerminPhase, type ReparaturTerminStatus } from '@/lib/werkstatt/reparatur-termin-phase'
import {
  werkstattAuftragSegment,
  abrechnungswegLabel,
  istAuffahrunfall,
  quelleLabel,
  zeigtGutachten,
  kvaStatus,
  kvaStatusLabel,
} from '@/lib/werkstatt/werkstatt-auftrag-segment'
import { formatBerlin } from '@/lib/google-calendar/timezone'
import { getPartnerProvisionStatusLabel } from '@/lib/statusLabels'
import {
  bestaetigeReparaturtermin,
  erbitteRueckruf,
  lehneReparaturterminAb,
  oeffneGutachtenPdf,
  schlageWerkstattTerminVor,
} from '@/app/werkstatt/(shell)/auftraege/actions'
import { WunschterminPicker } from '@/app/embed/gutachter-finder/_components/WunschterminPicker'

import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import type { StatusBadgeTone } from '@/components/shared/StatusBadge'
import { Button, Modal } from '@/components/primitives'
import { KvaHochladenModal } from '@/components/werkstatt/KvaHochladenModal'
import { ReparaturAbschlussModal } from '@/components/werkstatt/ReparaturAbschlussModal'

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
  const [vorschlagOffen, setVorschlagOffen] = useState(false)
  const [neuerTermin, setNeuerTermin] = useState('')
  const [vorschlagLaden, setVorschlagLaden] = useState(false)
  const [abschlussOffen, setAbschlussOffen] = useState(false)

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

  const aktionOffen = status === 'angefragt' || status === 'anruf_erbeten' || status === 'werkstatt_vorschlag'
  // b1: Ein Auftrag ohne Kunden-Wunschtermin (Kunde waehlte nur die Werkstatt) hat keinen
  // Termin zum Bestaetigen — die Werkstatt schlaegt dann selbst einen vor. hatWunschtermin
  // steuert, ob "Termin bestaetigen" ueberhaupt angeboten wird.
  const hatWunschtermin = Boolean(auftrag.reparatur_wunschtermin)
  // Der 'angefragt'-Default-Badge ("Wunschtermin angefragt") ist ohne Wunschtermin
  // irrefuehrend — dann liegt der Ball bei der Werkstatt, einen Termin vorzuschlagen.
  const badgeLabel = status === 'angefragt' && !hatWunschtermin ? 'Terminvorschlag offen' : phase.label

  async function handleVorschlag() {
    if (!neuerTermin) return
    setVorschlagLaden(true)
    const result = await schlageWerkstattTerminVor(auftrag.claim_id, neuerTermin)
    setVorschlagLaden(false)
    if (!result.ok) { toast.error(result.error ?? 'Vorschlag fehlgeschlagen'); return }
    setVorschlagOffen(false)
    setNeuerTermin('')
    toast.success('Terminvorschlag gesendet – der Kunde bestätigt ihn.')
    startTransition(() => router.refresh())
  }

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
            <StatusBadge tone={badgeTone} size="xs">{badgeLabel}</StatusBadge>
            {terminAnzeige && (
              <span className="text-body-sm text-claimondo-navy">{terminAnzeige}</span>
            )}
          </div>

          {status === 'angefragt' && !terminAnzeige && (
            <p className="text-body-sm text-claimondo-ondo">
              Der Kunde hat keinen Wunschtermin angegeben — bitte schlagen Sie unten einen Termin vor.
            </p>
          )}

          {status === 'abgelehnt' && auftrag.reparatur_absage_grund && (
            <p className="text-body-sm text-claimondo-ondo">
              Grund: {auftrag.reparatur_absage_grund}
            </p>
          )}

          {auftrag.reparatur_rueckruf_wunschzeit && (
            <p className="text-body-sm text-warning-strong">
              Kunde bittet um Rückruf (Wunschzeit:{' '}
              {formatBerlin(auftrag.reparatur_rueckruf_wunschzeit, {
                weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
              })}{' '}Uhr)
            </p>
          )}

          {aktionOffen && (
            <div className="flex flex-wrap gap-2 pt-1">
              {hatWunschtermin && (
                <Button
                  variant="navy"
                  size="sm"
                  loading={bestätigenLaden || isPending}
                  disabled={anrufLaden || ablehnenLaden}
                  onClick={handleBestaetigen}
                >
                  Termin bestätigen
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                loading={anrufLaden || isPending}
                disabled={bestätigenLaden || ablehnenLaden}
                onClick={handleAnrufen}
              >
                Anrufen / telefonisch klären
              </Button>
              <Button variant="ghost" size="sm" disabled={bestätigenLaden || anrufLaden || ablehnenLaden} onClick={() => setVorschlagOffen((v) => !v)}>
                {hatWunschtermin ? 'Anderen Termin vorschlagen' : 'Termin vorschlagen'}
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

          {vorschlagOffen && (
            <div className="space-y-2 rounded-ios-md border border-claimondo-border bg-claimondo-bg p-3">
              <WunschterminPicker value={neuerTermin} onChange={setNeuerTermin} />
              <Button variant="navy" size="sm" disabled={!neuerTermin} loading={vorschlagLaden} onClick={handleVorschlag}>
                Vorschlag senden
              </Button>
            </div>
          )}

          {/* WS6 Slice 1 — Reparatur abschliessen (nur wenn bestaetigt, separate Aktion von aktionOffen) */}
          {auftrag.reparatur_termin_status === 'bestaetigt' && auftrag.reparatur_termin_id && (
            <div className="pt-2">
              <Button variant="navy" size="sm" onClick={() => setAbschlussOffen(true)}>
                Reparatur abschließen
              </Button>
              <ReparaturAbschlussModal
                terminId={auftrag.reparatur_termin_id}
                open={abschlussOffen}
                onClose={() => setAbschlussOffen(false)}
              />
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
        {auftrag.reparaturdauer_tage != null && (
          <p className="text-body-xs text-claimondo-ondo">
            Voraussichtliche Reparaturdauer: {auftrag.reparaturdauer_tage} Tage
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
// BesichtigungsterminSektion — der mit dem Kunden vereinbarte SV-Begutachtungstermin
// (Datum/Uhrzeit + Gutachter + Ort). Nur Haftpflicht (SV-Gutachten-Route); erst wenn ein
// Termin existiert. Aaron 09.07.: „der genaue abgemachte Termin plus der Gutachter".
// ─────────────────────────────────────────────────────────────────────────────

function BesichtigungsterminSektion({ auftrag }: { auftrag: WerkstattAuftrag }) {
  if (!auftrag.besichtigung_start) return null

  return (
    <SectionCard title="Begutachtungstermin" className="mt-3">
      <div className="space-y-1.5">
        <p className="text-body-sm font-medium text-claimondo-navy">
          {formatBerlin(auftrag.besichtigung_start, {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          Uhr
        </p>
        {auftrag.gutachter_firmenname && (
          <p className="text-body-xs text-claimondo-ondo">Gutachter: {auftrag.gutachter_firmenname}</p>
        )}
        {auftrag.besichtigung_ort && (
          <p className="text-body-xs text-claimondo-ondo">Ort: {auftrag.besichtigung_ort}</p>
        )}
        {auftrag.besichtigung_status && (
          <p className="text-body-xs text-claimondo-ondo">
            Status: {auftrag.besichtigung_status === 'bestaetigt' ? 'bestätigt' : 'reserviert'}
          </p>
        )}
      </div>
    </SectionCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KvaSektion — Kostenvoranschlag-Status (nur Reparatur ohne SV-Gutachten)
// ─────────────────────────────────────────────────────────────────────────────

function KvaSektion({ auftrag }: { auftrag: WerkstattAuftrag }) {
  const [modalOffen, setModalOffen] = useState(false)
  const status = kvaStatus(auftrag)
  if (status === null) return null

  const badgeTone: StatusBadgeTone =
    status === 'freigegeben' ? 'success' : status === 'erstellt' ? 'info' : 'warning'

  const betrag = auftrag.kostenvoranschlag_brutto ?? auftrag.kostenvoranschlag_netto
  const betragLabel = auftrag.kostenvoranschlag_brutto != null ? 'brutto' : 'netto'

  const hinweis =
    status === 'benoetigt'
      ? 'Als Erstes den Kostenvoranschlag hochladen — der Kunde benötigt ihn für die Reparatur.'
      : status === 'erstellt'
        ? 'Kostenvoranschlag liegt vor, wartet auf Freigabe durch den Kunden.'
        : status === 'abgelehnt'
          ? `Der Kunde hat den Kostenvoranschlag abgelehnt${auftrag.kva_abgelehnt_grund ? ` — „${auftrag.kva_abgelehnt_grund}"` : ''}. Bitte überarbeiten und einen neuen Kostenvoranschlag hochladen.`
          : auftrag.reparatur_freigegeben_am
            ? `Freigegeben am ${formatBerlin(auftrag.reparatur_freigegeben_am, {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })} — die Reparatur kann starten.`
            : 'Freigegeben — die Reparatur kann starten.'

  return (
    <SectionCard title="Kostenvoranschlag (KVA)" className="mt-3">
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge tone={badgeTone} size="xs">{kvaStatusLabel(status)}</StatusBadge>
          {betrag != null && (
            <span className="text-body-sm text-claimondo-navy font-medium tabular-nums">
              {EUR2.format(betrag)} {betragLabel}
            </span>
          )}
        </div>
        <p className="text-body-sm text-claimondo-ondo">{hinweis}</p>
        {auftrag.reparaturdauer_tage_kva != null && (
          <p className="text-body-xs text-claimondo-ondo">
            Geschätzte Reparaturdauer: {auftrag.reparaturdauer_tage_kva} Tage
          </p>
        )}

        {(status === 'benoetigt' || status === 'abgelehnt') && (
          <div className="pt-1">
            <Button variant="navy" size="sm" onClick={() => setModalOffen(true)}>
              {status === 'abgelehnt' ? 'Neuen Kostenvoranschlag hochladen' : 'Kostenvoranschlag hochladen'}
            </Button>
          </div>
        )}
      </div>

      <KvaHochladenModal
        claimId={auftrag.claim_id}
        open={modalOffen}
        onClose={() => setModalOffen(false)}
      />
    </SectionCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// WerkstattAuftragDetail — Haupt-Komponente
// ─────────────────────────────────────────────────────────────────────────────

export function WerkstattAuftragDetail({
  auftrag,
  extra,
  chatMessages,
  chatRealtime,
  currentUserId,
}: {
  auftrag: WerkstattAuftrag
  extra?: WerkstattAuftragExtra | null
  chatMessages?: WerkstattChatMessage[]
  chatRealtime?: { fallId: string; gruppeThreadId: string | null }
  currentUserId?: string | null
}) {
  const segment = werkstattAuftragSegment(auftrag)
  const typ = abrechnungswegLabel(auftrag.abrechnungsweg)
  const kundeName = auftrag.kunde_name ?? '–'
  const fmtDatum = (iso: string | null): string =>
    iso ? new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '–'

  // Früh-Zustand: der Kunde ist noch mitten in der Ersterfassung — es gibt noch
  // kein Fahrzeug, keinen Reparaturtermin und kein Gutachten. Statt einer nackten
  // „–"-Detailseite zeigen wir einen freundlichen Hinweis (nur Reparatur-Sicht).
  const istFrueh =
    !auftrag.fahrzeug_hersteller &&
    !auftrag.reparatur_termin_id &&
    !auftrag.gutachten_fertiggestellt_am

  return (
    <div className="p-4 md:p-6 max-w-3xl lg:max-w-5xl mx-auto space-y-4">
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
        <p className="text-body-sm text-claimondo-navy font-medium">{kundeName}</p>
        <p className="text-body-sm text-claimondo-ondo">
          {[auftrag.fahrzeug_hersteller, auftrag.fahrzeug_modell].filter(Boolean).join(' ') || '–'}
          {auftrag.kennzeichen ? ` · ${auftrag.kennzeichen}` : ''}
        </p>
      </header>

      {/* AV3: Auffahrunfall-Hinweis fuer die Werkstatt (Aaron 09.07.). */}
      {istAuffahrunfall(auftrag.unfallart) && (
        <div className="rounded-ios-md bg-warning-soft border border-warning/30 px-4 py-3">
          <p className="text-body-sm text-warning-strong font-medium">Auffahrunfall</p>
          <p className="text-body-xs text-warning-strong/90">
            Stoßfänger muss ausgebaut werden, Hebebühne benötigt.
          </p>
        </div>
      )}

      {/* Display-Info-Karten: auf Desktop 2-spaltig (CSS-Columns, Single-Render).
          Das interaktive Segment (KVA/Reparaturtermin/Modals) + Copilot + Chat bleiben
          full-width DARUNTER. [&>*] targetet die 4 SectionCards (Fragment flacht ab) ->
          break-inside-avoid haelt jede Karte zusammen, mb-4 ersetzt space-y-4 hier. */}
      <div className="lg:columns-2 lg:gap-4 [&>*]:mb-4 [&>*]:break-inside-avoid">

      <SectionCard title="Fall">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-body-sm">
          <div>
            <dt className="text-body-xs text-claimondo-ondo">Kunde</dt>
            <dd className="text-claimondo-navy font-medium">{kundeName}</dd>
          </div>
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

      {/* Zusatz-Kontext (extra aus v_claim_full nach RLS-Gate): Fahrzeug-Detail,
          Vorschaeden, Ansprechpartner — fuer die Reparatur-Einordnung + Koordination. */}
      {extra && (
        <>
          {(extra.fahrzeug_baujahr != null ||
            extra.erstzulassung ||
            extra.kilometerstand != null ||
            extra.fahrzeug_farbe ||
            extra.hergang) && (
            <SectionCard title="Fahrzeug & Unfall">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-body-sm">
                {extra.fahrzeug_baujahr != null && (
                  <div>
                    <dt className="text-body-xs text-claimondo-ondo">Baujahr</dt>
                    <dd className="text-claimondo-navy">{String(extra.fahrzeug_baujahr)}</dd>
                  </div>
                )}
                {extra.erstzulassung && (
                  <div>
                    <dt className="text-body-xs text-claimondo-ondo">Erstzulassung</dt>
                    <dd className="text-claimondo-navy">{fmtDatum(extra.erstzulassung)}</dd>
                  </div>
                )}
                {extra.kilometerstand != null && (
                  <div>
                    <dt className="text-body-xs text-claimondo-ondo">Kilometerstand</dt>
                    <dd className="text-claimondo-navy">{String(extra.kilometerstand)} km</dd>
                  </div>
                )}
                {extra.fahrzeug_farbe && (
                  <div>
                    <dt className="text-body-xs text-claimondo-ondo">Farbe</dt>
                    <dd className="text-claimondo-navy">{extra.fahrzeug_farbe}</dd>
                  </div>
                )}
              </dl>
              {extra.hergang && (
                <div className="mt-2">
                  <p className="text-body-xs text-claimondo-ondo">Unfallhergang</p>
                  <p className="text-body-sm text-claimondo-navy">{extra.hergang}</p>
                </div>
              )}
            </SectionCard>
          )}

          {extra.schadensfotos.length > 0 && (
            <SectionCard title="Schadensfotos">
              <p className="text-body-xs text-claimondo-ondo mb-2">
                Vom Kunden gemeldete Schadensbilder — Grundlage für den Kostenvoranschlag.
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {extra.schadensfotos.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block aspect-square overflow-hidden rounded-ios-md border border-claimondo-border"
                  >
                    <img src={url} alt={`Schadensfoto ${i + 1}`} className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
            </SectionCard>
          )}

          <SectionCard title="Vorschäden">
            {extra.hat_vorschaeden || extra.vorschaden_anzahl ? (
              <div className="text-body-sm text-claimondo-navy space-y-1">
                <p className="font-medium text-warning-strong">
                  Vorschäden gemeldet{extra.vorschaden_anzahl ? ` (${extra.vorschaden_anzahl})` : ''}
                </p>
                {extra.vorschaden_erkannt && <p>Erkannt/dokumentiert: {extra.vorschaden_erkannt}</p>}
                {extra.vorschaden_letzter_datum && (
                  <p>Letzter Vorschaden: {fmtDatum(extra.vorschaden_letzter_datum)}</p>
                )}
              </div>
            ) : (
              <p className="text-body-sm text-claimondo-ondo">Keine Vorschäden gemeldet.</p>
            )}
          </SectionCard>

          <SectionCard title="Ansprechpartner">
            <div className="space-y-3 text-body-sm">
              <div>
                <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo">Kunde</p>
                <p className="text-claimondo-navy font-medium">
                  {[extra.kunde_vorname, extra.kunde_nachname].filter(Boolean).join(' ') || kundeName}
                </p>
                {extra.kunde_telefon && (
                  <a
                    href={`tel:${extra.kunde_telefon}`}
                    className="text-claimondo-ondo hover:text-claimondo-navy"
                  >
                    {extra.kunde_telefon}
                  </a>
                )}
                {extra.kunde_email && (
                  <a
                    href={`mailto:${extra.kunde_email}`}
                    className="block text-claimondo-ondo hover:text-claimondo-navy truncate"
                  >
                    {extra.kunde_email}
                  </a>
                )}
              </div>
              {extra.betreuer && (
                <div>
                  <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo">
                    Claimondo-Betreuer
                  </p>
                  <p className="text-claimondo-navy font-medium">
                    {[extra.betreuer.vorname, extra.betreuer.nachname].filter(Boolean).join(' ') ||
                      'Betreuer'}
                  </p>
                  {extra.betreuer.telefon && (
                    <a
                      href={`tel:${extra.betreuer.telefon}`}
                      className="text-claimondo-ondo hover:text-claimondo-navy"
                    >
                      {extra.betreuer.telefon}
                    </a>
                  )}
                </div>
              )}
              {auftrag.gutachter_firmenname && (
                <div>
                  <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo">
                    Gutachter
                  </p>
                  <p className="text-claimondo-navy font-medium">{auftrag.gutachter_firmenname}</p>
                </div>
              )}
            </div>
          </SectionCard>
        </>
      )}
      </div>

      {segment === 'reparatur' ? (
        <>
          {istFrueh && (
            <SectionCard title="Status" className="mt-3">
              <p className="text-body-sm text-claimondo-ondo">
                Der Kunde bearbeitet gerade seinen Fall (Ersterfassung). Fahrzeug- und
                Schadendaten erscheinen hier, sobald der Flow durchlaufen ist.
              </p>
            </SectionCard>
          )}
          <KvaSektion auftrag={auftrag} />
          <ReparaturterminSektion auftrag={auftrag} />
          {zeigtGutachten(auftrag.abrechnungsweg) && <BesichtigungsterminSektion auftrag={auftrag} />}
          {zeigtGutachten(auftrag.abrechnungsweg) && <GutachtenSektion auftrag={auftrag} />}
        </>
      ) : (
        <SectionCard title="Meine Vermittlung">
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-body-sm">
              <div>
                <dt className="text-body-xs text-claimondo-ondo">Kunde</dt>
                <dd className="text-claimondo-navy font-medium">{kundeName}</dd>
              </div>
              <div>
                <dt className="text-body-xs text-claimondo-ondo">Quelle</dt>
                <dd className="text-claimondo-navy">{quelleLabel(auftrag.quelle) ?? '–'}</dd>
              </div>
              {auftrag.zugewiesen_am && (
                <div>
                  <dt className="text-body-xs text-claimondo-ondo">Vermittelt am</dt>
                  <dd className="text-claimondo-navy tabular-nums">
                    {formatBerlin(auftrag.zugewiesen_am, {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </dd>
                </div>
              )}
            </dl>
            <p className="text-body-sm text-claimondo-ondo">
              Du hast diesen Kunden an Claimondo vermittelt.
              {auftrag.provision_betrag_netto != null
                ? ` Provision: ${EUR.format(auftrag.provision_betrag_netto)} (${getPartnerProvisionStatusLabel(auftrag.provision_status)}).`
                : ''}
            </p>
          </div>
        </SectionCard>
      )}

      {/* KI-Copilot: Reparatur/Abrechnung/KVA/Totalschaden — Streaming via /api/werkstatt/copilot. */}
      <WerkstattCopilotPanel claimId={auftrag.claim_id} />

      {/* Fall-Chat (v2-Thread kunde_gruppe + v1-kanal, analog Makler #4349) — ganz unten. */}
      <WerkstattChatTab
        claimId={auftrag.claim_id}
        fallId={chatRealtime?.fallId ?? auftrag.claim_id}
        gruppeThreadId={chatRealtime?.gruppeThreadId ?? null}
        currentUserId={currentUserId ?? null}
        initialMessages={chatMessages ?? []}
      />
    </div>
  )
}
