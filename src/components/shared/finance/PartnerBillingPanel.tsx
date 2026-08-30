'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/primitives/Button'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { SectionCard } from '@/components/shared/SectionCard'
import { TextField } from '@/components/shared/forms/TextField'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'
import {
  DataTableContainer,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@/components/shared/DataTable'
import {
  markiereAlsBezahlt,
  loeseEinzugErneutAus,
  gebeProvisionFrei,
  zahleProvisionAus,
  storniere,
  setzePartnerUstStatus,
  setzePartnerSteuerdaten,
  getPartnerGutschriftDownloadUrl,
} from '@/lib/finance/partner-billing-actions'
import { belegeFuerZeile } from '@/lib/finance/partner-billing'
import type { PartnerBillingRow, LedgerGutschriftDocs } from '@/lib/finance/partner-billing'
import { GutschriftKorrekturModal } from './GutschriftKorrekturModal'
import type { PartnerBillingPanelProps } from './PartnerBillingPanel.types'
import type { StatusBadgeTone } from '@/components/shared/StatusBadge'

// Status-zu-Tone-Mapping
const STATUS_TONE: Record<string, StatusBadgeTone> = {
  offen: 'info',
  faellig: 'warning',
  erledigt: 'success',
  storniert: 'neutral',
  fehlgeschlagen: 'danger',
  gehalten: 'neutral',
  freigegeben: 'info',
  entwurf: 'neutral',
}

// Lesbares Status-Label
const STATUS_LABEL: Record<string, string> = {
  offen: 'Offen',
  faellig: 'Fällig',
  erledigt: 'Erledigt',
  storniert: 'Storniert',
  fehlgeschlagen: 'Fehlgeschlagen',
  gehalten: 'Gehalten',
  freigegeben: 'Freigegeben',
  entwurf: 'Entwurf',
  // P3 Netzwerk: intra-Freundesnetzwerk -> Einzelprovision entfaellt (Abo deckt). Bewusst ohne
  // Auszahlen-/Freigeben-Aktion (istAuszahlungGehalten/-Freigegeben matchen nicht).
  unterdrueckt: 'Netzwerk-intern (nicht vergütet)',
}

function formatEur(betrag: number | null): string {
  if (betrag === null) return '—'
  return betrag.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function formatDatum(datum: string | null): string {
  if (!datum) return '—'
  return new Date(datum).toLocaleDateString('de-DE')
}

/** Inline-Meldung nach einer Aktion (Erfolg oder Fehler). */
function AktionMeldung({ ok, error }: { ok: boolean; error?: string }) {
  if (ok) {
    return (
      <span className="ml-2 rounded-ios-sm bg-success-soft px-2 py-0.5 text-xs text-success-strong">
        Gespeichert
      </span>
    )
  }
  return (
    <span className="ml-2 rounded-ios-sm bg-danger-soft px-2 py-0.5 text-xs text-danger-strong">
      {error ?? 'Fehler'}
    </span>
  )
}

/** Aktions-Buttons einer einzelnen Zeile. */
function ZeilenAktionen({
  row,
  gutschriftDocsByLedger,
}: {
  row: PartnerBillingRow
  gutschriftDocsByLedger: Record<string, LedgerGutschriftDocs>
}) {
  const [isPending, startTransition] = useTransition()
  const [meldung, setMeldung] = useState<{ ok: boolean; error?: string } | null>(null)
  const [korrekturOffen, setKorrekturOffen] = useState(false)

  const fuehreAus = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setMeldung(null)
    startTransition(async () => {
      const result = await fn()
      setMeldung(result)
    })
  }

  const { richtung, status_norm, quelle_tabelle, quelle_id, ust_status_bekannt } = row

  // Erledigte + stornierte Auszahlungen: pro vorhandenem Beleg ein Download-Button
  // (Original "Gutschrift ↓" + ggf. Storno-Korrekturbeleg "Storno ↓" mit Bezug).
  const belege = belegeFuerZeile(row, gutschriftDocsByLedger)

  const zeigeKeinAktion =
    status_norm === 'erledigt' || status_norm === 'storniert'

  if (zeigeKeinAktion) {
    if (belege.length === 0) return <span className="text-xs text-claimondo-ondo/50">—</span>
    const kannKorrigieren =
      status_norm === 'erledigt' && belege.some((b) => b.typ === 'gutschrift' && b.status !== 'storniert')
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {belege.map((b) => {
          const label =
            b.typ === 'storno'
              ? 'Storno ↓'
              : b.status === 'storniert'
                ? 'Gutschrift (storniert) ↓'
                : 'Gutschrift ↓'
          return (
            <span key={b.gutschriftId} className="inline-flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                loading={isPending}
                onClick={() =>
                  fuehreAus(async () => {
                    const res = await getPartnerGutschriftDownloadUrl(quelle_tabelle, quelle_id, b.typ, b.gutschriftId)
                    if (res.ok) {
                      window.open(res.url, '_blank')
                      return { ok: true }
                    }
                    return { ok: false, error: res.error }
                  })
                }
              >
                {label}
              </Button>
              {b.typ === 'storno' && b.bezugNr && (
                <span className="text-xs text-claimondo-shield">zu {b.bezugNr}</span>
              )}
            </span>
          )
        })}
        {kannKorrigieren && (
          <Button size="sm" variant="ghost" onClick={() => setKorrekturOffen(true)}>
            Korrigieren
          </Button>
        )}
        {meldung && !meldung.ok && <AktionMeldung {...meldung} />}
        {kannKorrigieren && (
          <GutschriftKorrekturModal
            open={korrekturOffen}
            onClose={() => setKorrekturOffen(false)}
            ledgerTabelle={quelle_tabelle}
            ledgerId={quelle_id}
          />
        )}
      </div>
    )
  }

  // Forderungs-Aktionen (Als bezahlt / Einzug erneut / Stornieren) sind nur fuer
  // quelle_tabelle='abrechnungen' (SV-Monatsabrechnung) implementiert.
  // kanzlei_abrechnungen und sv_onboarding_rechnungen haben eigene Flows — hier read-only.
  const istForderungAktiv =
    richtung === 'forderung' &&
    quelle_tabelle === 'abrechnungen' &&
    (status_norm === 'offen' || status_norm === 'faellig' || status_norm === 'fehlgeschlagen')

  const istAuszahlungGehalten = richtung === 'auszahlung' && status_norm === 'gehalten'
  const istAuszahlungFreigegeben = richtung === 'auszahlung' && status_norm === 'freigegeben'
  const istAuszahlung = richtung === 'auszahlung'

  const handleStornieren = () => {
    const grund = window.prompt('Storno-Grund:')
    if (!grund) return
    fuehreAus(() => storniere(quelle_tabelle, quelle_id, grund))
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {istForderungAktiv && (
        <Button
          size="sm"
          variant="navy"
          loading={isPending}
          onClick={() => fuehreAus(() => markiereAlsBezahlt(quelle_tabelle, quelle_id))}
        >
          Als bezahlt
        </Button>
      )}

      {istForderungAktiv && (
        <Button
          size="sm"
          variant="ghost"
          loading={isPending}
          onClick={() => fuehreAus(() => loeseEinzugErneutAus(quelle_tabelle, quelle_id))}
        >
          Einzug erneut
        </Button>
      )}

      {istAuszahlungGehalten && (
        <Button
          size="sm"
          variant="navy"
          loading={isPending}
          onClick={() => fuehreAus(() => gebeProvisionFrei(quelle_tabelle, quelle_id))}
        >
          Freigeben
        </Button>
      )}

      {istAuszahlungFreigegeben && (
        <Button
          size="sm"
          variant="success"
          loading={isPending}
          disabled={!ust_status_bekannt}
          ariaLabel={!ust_status_bekannt ? 'USt-Status unbekannt — Auszahlung gesperrt' : undefined}
          onClick={() => {
            if (!ust_status_bekannt) return
            fuehreAus(() => zahleProvisionAus(quelle_tabelle, quelle_id))
          }}
        >
          Auszahlen
        </Button>
      )}

      {(istForderungAktiv || istAuszahlungGehalten || istAuszahlungFreigegeben || istAuszahlung) && (
        <Button
          size="sm"
          variant="danger"
          loading={isPending}
          onClick={handleStornieren}
        >
          Stornieren
        </Button>
      )}

      {meldung && <AktionMeldung {...meldung} />}
    </div>
  )
}

/** Zusammenfassungs-Zahl-Kachel. */
function SummaryKachel({
  label,
  netto,
  brutto,
  anzahl,
}: {
  label: string
  netto: number
  brutto: number
  anzahl: number
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-claimondo-ondo">{label}</span>
      <span className="text-sm font-semibold text-claimondo-navy">{formatEur(brutto)}</span>
      <span className="text-[11px] text-claimondo-ondo/70">
        Netto {formatEur(netto)} · {anzahl} Pos.
      </span>
    </div>
  )
}

export function PartnerBillingPanel({
  rows,
  aggregat,
  showPartnerColumn = false,
  ustToggle,
  steuerdaten,
  gutschriftDocsByLedger = {},
}: PartnerBillingPanelProps) {
  const [ustPending, startUstTransition] = useTransition()
  const [ustMeldung, setUstMeldung] = useState<{ ok: boolean; error?: string } | null>(null)

  const handleUstToggle = (value: boolean) => {
    if (!ustToggle) return
    setUstMeldung(null)
    startUstTransition(async () => {
      const result = await setzePartnerUstStatus(ustToggle.partnerTyp, ustToggle.partnerId, value)
      setUstMeldung(result)
    })
  }

  // Steuerdaten-State (editable variant)
  const [stUstId, setStUstId] = useState(steuerdaten?.current.ust_id ?? '')
  const [stStrasse, setStStrasse] = useState(steuerdaten?.current.adresse_strasse ?? '')
  const [stPlz, setStPlz] = useState(steuerdaten?.current.adresse_plz ?? '')
  const [stOrt, setStOrt] = useState(steuerdaten?.current.adresse_ort ?? '')
  const [steuerdatenPending, startSteuerdatenTransition] = useTransition()
  const [steuerdatenMeldung, setSteuerdatenMeldung] = useState<{ ok: boolean; error?: string } | null>(null)

  const handleSteuerdatenSpeichern = () => {
    if (!steuerdaten) return
    setSteuerdatenMeldung(null)
    startSteuerdatenTransition(async () => {
      const result = await setzePartnerSteuerdaten(steuerdaten.partnerTyp, steuerdaten.partnerId, {
        ust_id: stUstId,
        adresse_strasse: stStrasse,
        adresse_plz: stPlz,
        adresse_ort: stOrt,
      })
      setSteuerdatenMeldung(result)
    })
  }

  // Zusammenfassungs-Buckets
  const forderungBuckets = [
    { label: 'Offen', key: 'forderung:offen' },
    { label: 'Fällig', key: 'forderung:faellig' },
    { label: 'Erledigt', key: 'forderung:erledigt' },
  ]
  const auszahlungBuckets = [
    { label: 'Gehalten', key: 'auszahlung:gehalten' },
    { label: 'Freigegeben', key: 'auszahlung:freigegeben' },
    { label: 'Ausgezahlt', key: 'auszahlung:erledigt' },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* USt-Warnbanner */}
      {aggregat.hat_unbekannten_ust_status && (
        <div className="rounded-ios-md bg-warning-soft px-4 py-3 text-sm text-warning-strong">
          USt-Status einzelner Partner unbekannt — Auszahlung ist gesperrt, bitte Status erfassen.
        </div>
      )}

      {/* Zusammenfassungs-Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SectionCard title="Forderungen">
          <div className="grid grid-cols-3 gap-3">
            {forderungBuckets.map(({ label, key }) => {
              const bucket = aggregat.perStatus[key]
              return (
                <SummaryKachel
                  key={key}
                  label={label}
                  netto={bucket?.netto ?? 0}
                  brutto={bucket?.brutto ?? 0}
                  anzahl={bucket?.anzahl ?? 0}
                />
              )
            })}
          </div>
        </SectionCard>

        <SectionCard title="Auszahlungen">
          <div className="grid grid-cols-3 gap-3">
            {auszahlungBuckets.map(({ label, key }) => {
              const bucket = aggregat.perStatus[key]
              return (
                <SummaryKachel
                  key={key}
                  label={label}
                  netto={bucket?.netto ?? 0}
                  brutto={bucket?.brutto ?? 0}
                  anzahl={bucket?.anzahl ?? 0}
                />
              )
            })}
          </div>
        </SectionCard>
      </div>

      {/* Positionstabelle */}
      <DataTableContainer>
        <Table>
          <Thead>
            <Tr>
              <Th className="text-left px-4">Referenz</Th>
              <Th className="text-left px-4">Datum</Th>
              {showPartnerColumn && <Th className="text-left px-4">Partner</Th>}
              <Th className="text-right px-4">Netto</Th>
              <Th className="text-right px-4">USt</Th>
              <Th className="text-right px-4">Brutto</Th>
              <Th className="text-left px-4">Status</Th>
              <Th className="text-left px-4">Aktionen</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.length === 0 ? (
              <Tr>
                <Td
                  className="py-8 text-center text-claimondo-ondo/60"
                  colSpan={showPartnerColumn ? 8 : 7}
                >
                  Keine Positionen vorhanden
                </Td>
              </Tr>
            ) : (
              rows.map((row) => {
                const tone = STATUS_TONE[row.status_norm] ?? 'neutral'
                const statusLabel = STATUS_LABEL[row.status_norm] ?? row.status_norm

                const ustZelle =
                  row.ust_satz === null
                    ? row.ust_status_bekannt
                      ? '—'
                      : 'offen'
                    : `${row.ust_satz}% / ${formatEur(row.ust_betrag)}`

                return (
                  <Tr
                    key={`${row.quelle_tabelle}:${row.quelle_id}`}
                    className="border-b border-claimondo-border/50"
                  >
                    <Td className="px-4 font-mono text-xs">
                      {row.referenz_nr ?? '—'}
                    </Td>
                    <Td className="px-4 whitespace-nowrap">
                      {formatDatum(row.datum)}
                    </Td>
                    {showPartnerColumn && (
                      <Td className="px-4">
                        {row.partner_name ?? row.partner_id ?? '—'}
                      </Td>
                    )}
                    <Td className="px-4 text-right tabular-nums">
                      {formatEur(row.betrag_netto)}
                    </Td>
                    <Td className="px-4 text-right tabular-nums">
                      {ustZelle}
                    </Td>
                    <Td className="px-4 text-right tabular-nums font-medium">
                      {formatEur(row.betrag_brutto)}
                    </Td>
                    <Td className="px-4">
                      <StatusBadge tone={tone} size="sm">
                        {statusLabel}
                      </StatusBadge>
                    </Td>
                    <Td className="px-4">
                      <ZeilenAktionen row={row} gutschriftDocsByLedger={gutschriftDocsByLedger} />
                    </Td>
                  </Tr>
                )
              })
            )}
          </Tbody>
        </Table>
      </DataTableContainer>

      {/* USt-Toggle */}
      {ustToggle && (
        <SectionCard title="USt-Status des Partners">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-claimondo-navy">
              {ustToggle.current === true
                ? 'Aktuell: USt-pflichtig'
                : ustToggle.current === false
                  ? 'Aktuell: Kleinunternehmer'
                  : 'Aktuell: Unbekannt'}
            </span>
            <Button
              size="sm"
              variant={ustToggle.current === true ? 'ghost' : 'navy'}
              loading={ustPending}
              onClick={() => handleUstToggle(true)}
            >
              USt-pflichtig
            </Button>
            <Button
              size="sm"
              variant={ustToggle.current === false ? 'ghost' : 'navy'}
              loading={ustPending}
              onClick={() => handleUstToggle(false)}
            >
              Kleinunternehmer
            </Button>
            {ustMeldung && <AktionMeldung {...ustMeldung} />}
          </div>
        </SectionCard>
      )}

      {/* Steuerdaten des Partners */}
      {steuerdaten && (
        <SectionCard title="Steuerdaten des Partners">
          {steuerdaten.readOnly ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-claimondo-shield">USt-IdNr.</span>
                <span className="text-sm text-claimondo-navy">{steuerdaten.current.ust_id ?? '—'}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-claimondo-shield">Straße</span>
                <span className="text-sm text-claimondo-navy">{steuerdaten.current.adresse_strasse ?? '—'}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-claimondo-shield">PLZ</span>
                <span className="text-sm text-claimondo-navy">{steuerdaten.current.adresse_plz ?? '—'}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-claimondo-shield">Ort</span>
                <span className="text-sm text-claimondo-navy">{steuerdaten.current.adresse_ort ?? '—'}</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField
                  label="USt-IdNr."
                  value={stUstId}
                  onChange={(e) => setStUstId(e.target.value)}
                  placeholder="DE123456789"
                />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="adr-partnerbillingpanel" className="text-xs font-semibold text-claimondo-shield">Straße</label>
                  {/* P3 Ortseingaben: Autocomplete füllt Straße + PLZ + Ort. Felder bleiben editierbar. */}
                  <GooglePlaceAutocomplete
                    id="adr-partnerbillingpanel"
                    className="w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy placeholder:text-claimondo-shield/60 focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/30"
                    defaultValue={stStrasse}
                    placeholder="Musterstraße 1"
                    onSelect={(r) => {
                      setStStrasse(r.strasse || stStrasse)
                      if (r.plz) setStPlz(r.plz)
                      if (r.stadt) setStOrt(r.stadt)
                    }}
                    onChange={(t) => setStStrasse(t)}
                  />
                </div>
                <TextField
                  label="PLZ"
                  value={stPlz}
                  onChange={(e) => setStPlz(e.target.value)}
                  placeholder="50667"
                />
                <TextField
                  label="Ort"
                  value={stOrt}
                  onChange={(e) => setStOrt(e.target.value)}
                  placeholder="Köln"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  variant="navy"
                  loading={steuerdatenPending}
                  onClick={handleSteuerdatenSpeichern}
                >
                  Speichern
                </Button>
                {steuerdatenMeldung && <AktionMeldung {...steuerdatenMeldung} />}
              </div>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  )
}
