'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeftIcon, MailIcon, PencilIcon, LockIcon, CheckCircle2Icon, PhoneIcon, CopyIcon, CheckIcon, MessageSquareIcon, ShieldCheckIcon, ShieldOffIcon } from 'lucide-react'
import { SectionCard } from '@/components/shared/SectionCard'
import PageHeader from '@/components/shared/PageHeader'
import { StatusBadge, type StatusBadgeTone } from '@/components/shared/StatusBadge'
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import { Button, Modal } from '@/components/primitives'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { sendWerkstattLoginMail, setWerkstattVerifiziert } from '../actions'
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
import { FaehigkeitenStaffelEditor } from './FaehigkeitenStaffelEditor'
import { MarkenGruppenEditor } from './MarkenGruppenEditor'
import { WerkstattKarte } from './WerkstattKarte'
import { QrCodeDownloadButtons } from '@/components/shared/QrCodeDownloadButtons'
import { PartnerBillingPanel } from '@/components/shared/finance/PartnerBillingPanel'
import { PoolQrScanner } from '@/components/werkstatt/PoolQrScanner'
import { weiseQrPoolCodeZu } from '../qr-pool-actions'
import { ClaimThreadChat } from '@/components/chat/ClaimThreadChat'
import { holeOderErstelleDirektThread } from '@/lib/chat/thread-actions'
import { PartnerCockpitPanel } from '@/components/shared/partner/PartnerCockpitPanel'

const STATUS_TON: Record<string, StatusBadgeTone> = {
  aktiv: 'success',
  inaktiv: 'neutral',
  gesperrt: 'danger',
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

function Kennzahl({ label, wert }: { label: string; wert: string }) {
  return (
    <div className="rounded-ios-md bg-claimondo-bg px-3 py-2">
      <p className="text-body-xs text-claimondo-ondo">{label}</p>
      <p className="text-body font-semibold text-claimondo-navy tabular-nums">{wert}</p>
    </div>
  )
}

function terminDatum(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'
}
const REP_TERMIN_LABEL: Record<string, string> = {
  angefragt: 'Angefragt',
  anruf_erbeten: 'Anruf erbeten',
  bestaetigt: 'Bestätigt',
  erledigt: 'Erledigt',
  abgelehnt: 'Abgelehnt',
  storniert: 'Storniert',
}
function reparaturTerminLabel(s: string | null): string {
  return s ? REP_TERMIN_LABEL[s] ?? s : '—'
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

export default function WerkstattDetailClient({
  detail,
  currentUserId,
  variant = 'page',
}: {
  detail: WerkstattDetail
  currentUserId: string
  /** "drawer": kein Zurueck-Link (der Drawer liegt ueber Liste/Cockpit und hat Close). */
  variant?: 'page' | 'drawer'
}) {
  const router = useRouter()
  const { werkstatt: w, staffel, auftraege, lastSignInAt, forcePasswordChange, billing, leistung } = detail
  const [mailLoading, setMailLoading] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editBusy, setEditBusy] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)
  const [adresseOpen, setAdresseOpen] = useState(false)
  const [adresseBusy, setAdresseBusy] = useState(false)
  const [neueAdresse, setNeueAdresse] = useState<PlaceResult | null>(null)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [poolBusy, setPoolBusy] = useState(false)
  const [chatThreadId, setChatThreadId] = useState<string | null>(null)
  const [chatClaimNummer, setChatClaimNummer] = useState<string | null>(null)
  const [chatBusyClaimId, setChatBusyClaimId] = useState<string | null>(null)
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [verifyNotiz, setVerifyNotiz] = useState('')
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
  const ausgezahltNetto = billing?.aggregat.perStatus['auszahlung:erledigt']?.netto ?? 0
  const termine = auftraege
    .map((a) => ({ a, terminAt: a.reparatur_bestaetigter_termin ?? a.reparatur_wunschtermin }))
    .filter((t) => !!t.terminAt)
    .sort((x, y) => (x.terminAt ?? '').localeCompare(y.terminAt ?? ''))
  const adresse =
    [w.adresse_strasse, [w.adresse_plz, w.adresse_ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'

  async function oeffneWerkstattChat(claimId: string, claimNummer: string | null) {
    if (!w.user_id) {
      toast.error('Werkstatt hat keinen Login — Chat nicht möglich.')
      return
    }
    setChatBusyClaimId(claimId)
    try {
      const res = await holeOderErstelleDirektThread(claimId, w.user_id)
      if (!res.ok) {
        toast.error(res.error ?? 'Chat konnte nicht geöffnet werden')
        return
      }
      setChatThreadId(res.data)
      setChatClaimNummer(claimNummer)
    } finally {
      setChatBusyClaimId(null)
    }
  }

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

  async function verifizierungToggle() {
    const neuVerifiziert = !w.verifiziert
    setVerifyBusy(true)
    try {
      const res = await setWerkstattVerifiziert(w.id, neuVerifiziert, verifyNotiz || undefined)
      if (!res.ok) {
        toast.error(res.error ?? 'Fehler')
        return
      }
      toast.success(neuVerifiziert ? 'Werkstatt verifiziert' : 'Verifizierung aufgehoben')
      router.refresh()
    } finally {
      setVerifyBusy(false)
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

  async function poolQrZuweisen(token: string) {
    setPoolBusy(true)
    try {
      const res = await weiseQrPoolCodeZu(w.id, token)
      if (!res.ok) {
        toast.error(res.error ?? 'Zuweisung fehlgeschlagen')
        return
      }
      toast.success(`Pool-QR ${token} zugewiesen`)
      router.refresh()
    } finally {
      setPoolBusy(false)
    }
  }

  function copyQrUrl() {
    void navigator.clipboard.writeText(detail.qrUrl).then(() => {
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 2000)
    })
  }

  function qrFileBase(): string {
    const slug = w.name
      .toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return `claimondo-werkstatt-${slug || 'qr'}-qr`
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div>
        {variant !== 'drawer' && (
          <Link
            href="/admin/werkstaetten"
            className="inline-flex items-center gap-1 text-body-sm text-claimondo-ondo hover:text-claimondo-navy mb-3 transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" /> Alle Werkstätten
          </Link>
        )}
        <PageHeader
          title={w.name}
          size="lg"
          description={
            <span className="flex items-center gap-2 flex-wrap">
              <StatusBadge tone={STATUS_TON[w.status ?? ''] ?? 'neutral'} size="xs">
                {w.status ?? 'unbekannt'}
              </StatusBadge>
              <span>Aktiviert am {datum(w.aktiviert_am)}</span>
            </span>
          }
          actions={
            w.status === 'aktiv' ? (
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
            )
          }
        />
      </div>

      {/* Leistung — abgeleitet aus den Auftraegen (berechneWerkstattLeistung, pure+getestet) */}
      <SectionCard title="Leistung">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kennzahl label="Aufträge gesamt" wert={String(leistung.gesamt)} />
          <Kennzahl label="Offen" wert={String(leistung.offen)} />
          <Kennzahl label="Erledigt" wert={String(leistung.erledigt)} />
          <Kennzahl
            label="Abschlussquote"
            wert={leistung.abschlussquote == null ? '—' : `${Math.round(leistung.abschlussquote * 100)} %`}
          />
          <Kennzahl
            label="Ø Reaktionszeit"
            wert={leistung.reaktionstageMedian == null ? '—' : `${leistung.reaktionstageMedian} Tage`}
          />
          <Kennzahl label="Aktiv (90 Tage)" wert={String(leistung.aktivLetzte90Tage)} />
          <Kennzahl label="Provision (netto)" wert={euro(leistung.provisionGesamtNetto)} />
          <Kennzahl label="Ausgezahlt (netto)" wert={euro(ausgezahltNetto)} />
        </div>
        <p className="mt-3 text-body-xs text-claimondo-ondo">
          {leistung.inbound} eigene Vermittlung{leistung.inbound === 1 ? '' : 'en'} ·{' '}
          {leistung.vermittelt} Claimondo-Auftr{leistung.vermittelt === 1 ? 'ag' : 'äge'} ·{' '}
          {termine.length} Termin{termine.length === 1 ? '' : 'e'} geplant
          {leistung.abgelehnt > 0 ? ` · ${leistung.abgelehnt} abgelehnt/storniert` : ''}
        </p>
        <p className="mt-1 text-body-xs text-claimondo-ondo/70">
          Abschlussquote = erledigt ÷ abgeschlossen · Ø Reaktionszeit = Median Tage Gutachten → bestätigter Termin
        </p>
      </SectionCard>

      {/* Ansprechpartner / Kontakt — prominent (Aaron: „sehr wichtig") */}
      <SectionCard title="Ansprechpartner / Kontakt">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <p className="text-heading-sm font-semibold text-claimondo-navy">
              {w.ansprechpartner_name || 'Kein Ansprechpartner hinterlegt'}
            </p>
            <div className="flex flex-col gap-1 text-body-sm">
              {w.telefon ? (
                <a
                  href={`tel:${w.telefon}`}
                  className="inline-flex items-center gap-1.5 text-claimondo-ondo hover:text-claimondo-navy transition-colors"
                >
                  <PhoneIcon className="w-4 h-4 shrink-0" /> {w.telefon}
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-claimondo-ondo/70">
                  <PhoneIcon className="w-4 h-4 shrink-0" /> Keine Telefonnummer
                </span>
              )}
              {w.email ? (
                <a
                  href={`mailto:${w.email}`}
                  className="inline-flex items-center gap-1.5 text-claimondo-ondo hover:text-claimondo-navy transition-colors"
                >
                  <MailIcon className="w-4 h-4 shrink-0" /> {w.email}
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-claimondo-ondo/70">
                  <MailIcon className="w-4 h-4 shrink-0" /> Keine E-Mail
                </span>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)} iconLeft={<PencilIcon className="w-4 h-4" />}>
            Bearbeiten
          </Button>
        </div>
      </SectionCard>

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

      {/* Standort & Fahrgebiet */}
      <SectionCard title="Standort & Fahrgebiet">
        <WerkstattKarte lat={w.lat} lng={w.lng} isochrone={w.isochrone} />
      </SectionCard>

      {/* QR-Code & Einstieg (Anzeige + Download + physischer Pool-Sticker zuweisen) */}
      <SectionCard title="QR-Code & Einstieg">
        <div className="flex flex-col sm:flex-row gap-5">
          <div
            className="shrink-0 self-start flex items-center justify-center p-4 rounded-ios-xl bg-claimondo-bg border border-claimondo-border [&_svg]:w-40 [&_svg]:h-40"
            dangerouslySetInnerHTML={{ __html: detail.qrSvg }}
          />
          <div className="flex-1 min-w-0 space-y-3">
            <p className="text-body-sm text-claimondo-ondo">
              Kunden scannen diesen Code und starten die Schadenmeldung dieser Werkstatt.
            </p>
            <div>
              <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo font-medium">Einstiegs-Link</p>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  readOnly
                  value={detail.qrUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-w-0 font-mono text-body-sm text-claimondo-navy bg-claimondo-bg border border-claimondo-border rounded-ios-md px-3 py-2 truncate"
                />
                <Button
                  variant="navy"
                  size="sm"
                  onClick={copyQrUrl}
                  iconLeft={copiedUrl ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                >
                  {copiedUrl ? 'Kopiert' : 'Kopieren'}
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-body-xs text-claimondo-ondo">Zum Aushängen / Drucken:</span>
              <QrCodeDownloadButtons qrSvg={detail.qrSvg} fileBaseName={qrFileBase()} />
            </div>
            <div className="border-t border-claimondo-border pt-3">
              <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo font-medium mb-1">
                Physischer Pool-QR-Sticker
              </p>
              {detail.zugewiesenerPoolCode ? (
                <p className="text-body-sm text-claimondo-navy mb-2">
                  Zugewiesen: <span className="font-mono">{detail.zugewiesenerPoolCode}</span> — zum Ersetzen neuen Code scannen/eingeben.
                </p>
              ) : (
                <p className="text-body-sm text-claimondo-ondo/70 mb-2">Noch kein Pool-Sticker zugewiesen.</p>
              )}
              <PoolQrScanner onToken={poolQrZuweisen} disabled={poolBusy} />
            </div>
          </div>
        </div>
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
                <Th>Chat</Th>
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
                    <Td>
                      {w.user_id ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={chatBusyClaimId === a.claim_id}
                          onClick={() => oeffneWerkstattChat(a.claim_id, a.claim_nummer)}
                          iconLeft={<MessageSquareIcon className="w-4 h-4" />}
                        >
                          Chat
                        </Button>
                      ) : (
                        <span className="text-body-xs text-claimondo-ondo/60">—</span>
                      )}
                    </Td>
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
        )}
      </SectionCard>

      {/* Reparatur-Termine (aus den Aufträgen abgeleitet, nach Datum) */}
      <SectionCard title={`Termine — ${termine.length} geplant`}>
        {termine.length === 0 ? (
          <p className="text-body-sm text-claimondo-ondo">Keine geplanten Termine.</p>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Datum</Th>
                <Th>Fall</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {termine.map(({ a, terminAt }) => (
                <Tr key={a.claim_id}>
                  <Td>{terminDatum(terminAt)}</Td>
                  <Td className="font-mono">{a.claim_nummer ?? '—'}</Td>
                  <Td>{reparaturTerminLabel(a.reparatur_termin_status)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </SectionCard>

      {/* Abrechnung — volle Verwaltung (Bezahlt / Freigeben / Auszahlen / Storno / USt) */}
      <SectionCard title="Abrechnung">
        {billing ? (
          <PartnerBillingPanel
            rows={billing.rows}
            aggregat={billing.aggregat}
            gutschriftDocsByLedger={billing.gutschriftDocsByLedger}
            ustToggle={{ partnerTyp: 'werkstatt', partnerId: w.id, current: billing.istKleinunternehmer }}
            steuerdaten={{
              partnerTyp: 'werkstatt',
              partnerId: w.id,
              current: billing.steuerdaten ?? { ust_id: null, adresse_strasse: null, adresse_plz: null, adresse_ort: null },
              readOnly: false,
            }}
          />
        ) : (
          <p className="text-body-sm text-claimondo-ondo">Keine Abrechnungsdaten.</p>
        )}
      </SectionCard>

      {/* Fähigkeiten & Staffelung (inline editierbar) */}
      <SectionCard title="Fähigkeiten & Staffelung">
        <FaehigkeitenStaffelEditor werkstattId={w.id} faehigkeiten={w.faehigkeiten ?? []} staffel={staffel} />
      </SectionCard>

      {/* Marken & Fahrzeug-Gruppen (inline editierbar) — die stärksten Ranking-Achsen, Task #5 */}
      <SectionCard title="Marken & Fahrzeug-Gruppen">
        <MarkenGruppenEditor
          werkstattId={w.id}
          marken={w.marken ?? []}
          fahrzeugGruppen={w.fahrzeug_gruppen ?? []}
          istFreieWerkstatt={w.ist_freie_werkstatt ?? null}
        />
      </SectionCard>

      {/* Verifizierung — Trust-Marker + Tiebreak im Finder (D1: Distanz bleibt primaer) */}
      <SectionCard title="Verifizierung">
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            {w.verifiziert ? (
              <StatusBadge tone="success" size="xs">
                ✓ Verifizierter Partner
              </StatusBadge>
            ) : (
              <StatusBadge tone="neutral" size="xs">
                Nicht verifiziert
              </StatusBadge>
            )}
            {w.verifiziert && w.verifiziert_am ? (
              <span className="text-body-xs text-claimondo-ondo">
                verifiziert am {datum(w.verifiziert_am)}
              </span>
            ) : null}
          </div>
          {/* D4: Verifizierung beglaubigt die Markenbindung — erst dann greift der Vertragswerkstatt-Rang */}
          <p className="text-caption text-claimondo-shield/70">
            Mit der Verifizierung beglaubigen Sie auch die gepflegten Marken
            {w.marken && w.marken.length > 0
              ? ` (${w.marken.join(', ')})`
              : ' (aktuell keine gepflegt)'}{' '}
            — erst dann greift der Vertragswerkstatt-Rang im Finder.
          </p>
          <div className="space-y-2">
            <label className="block text-body-xs font-medium text-claimondo-navy">
              Notiz (optional)
            </label>
            <input
              type="text"
              value={verifyNotiz}
              onChange={(e) => setVerifyNotiz(e.target.value)}
              placeholder="z. B. Vor-Ort-Prüfung am 11.07.2026"
              className={INPUT_CLS}
            />
          </div>
          <Button
            variant={w.verifiziert ? 'ghost' : 'navy'}
            size="sm"
            loading={verifyBusy}
            onClick={verifizierungToggle}
            iconLeft={w.verifiziert ? <ShieldOffIcon className="w-4 h-4" /> : <ShieldCheckIcon className="w-4 h-4" />}
          >
            {w.verifiziert ? 'Verifizierung aufheben' : 'Verifizieren'}
          </Button>
        </div>
      </SectionCard>

      {/* Partner-Aktivität (CRM-Cockpit) — eigenstaendige Sektion, zu unterscheiden von
          der "Aktivität — Aufträge/Vermittlungen"-SectionCard oben (Auftragsliste). */}
      <div className="mt-6">
        <h3 className="text-heading-sm text-claimondo-navy mb-2">Aktivität</h3>
        <PartnerCockpitPanel partnerTyp="werkstatt" partnerId={w.id} />
      </div>

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

      {/* Werkstatt-Chat — claim-scoped DM mit der Werkstatt (Phase-2 Thread-Modell) */}
      <Modal open={chatThreadId !== null} onClose={() => setChatThreadId(null)} maxWidth={520} ariaLabel="Chat mit Werkstatt">
        <div className="flex flex-col h-[70vh] max-h-[600px]">
          <h2 className="text-heading-sm font-semibold text-claimondo-navy mb-2 shrink-0">
            Chat mit {w.name}
            {chatClaimNummer ? ` · ${chatClaimNummer}` : ''}
          </h2>
          <div className="flex-1 min-h-0 overflow-hidden rounded-ios-md border border-claimondo-border">
            {chatThreadId && <ClaimThreadChat threadId={chatThreadId} currentUserId={currentUserId} />}
          </div>
        </div>
      </Modal>
    </div>
  )
}
