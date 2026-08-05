'use client'

// Firmen-Flotten-Akte — Sektions-View. Analog Werkstatt-Detail. Sektionen:
// Stammdaten (Task 5), Fahrzeuge (Task 6), Karten (Task 7), Schaeden (Task 8),
// Flottenmanager-Konto (Task 9). Mutationen ueber staff-Actions (requireRole); Karten-Mint/-Bind
// via kanonischer schadenkarte-Lib (89f501f6), Fahrzeuge via mutate-flotte.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BuildingIcon, CameraIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives'
import Zb1BatchScanner from '@/components/flotte/Zb1BatchScanner'
import { NfcKarteSchreibenButton } from '@/components/flotte/NfcKarteSchreibenButton'
import { NfcBeschreibenHinweis } from '@/components/flotte/NfcBeschreibenHinweis'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import { ConfirmEntfernenButton } from '@/components/shared/ConfirmEntfernenButton'
import { updateVertriebFeld } from '../../_actions/update-vertrieb-feld'
import {
  fuegeFahrzeugZuFlotteHinzu,
  entferneFahrzeugAusFlotte,
  scanZb1KarteFuerFlotte,
  legeZb1FahrzeugeFuerFlotte,
} from '../../_actions/firmen-flotte-fahrzeuge'
import { finalisiereKarteStaff, minteKartenBatchStaff } from '../../_actions/firmen-flotte-karten'
import { setzeFlottenKontoStatus, setzeFlottenKontoWhatsapp } from '../../_actions/firmen-flotte-konto'
import type { FirmenFlotteDetail } from '../../_lib/firmen-flotte-detail'
import { PartnerCockpitPanel } from '@/components/shared/partner/PartnerCockpitPanel'

const FELD_CLS =
  'rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40'

function Feld({ label, wert }: { label: string; wert: string | null }) {
  return (
    <div>
      <p className="text-caption text-claimondo-ondo/60">{label}</p>
      <p className="text-sm text-claimondo-navy break-words">{wert && wert.trim() ? wert : '—'}</p>
    </div>
  )
}

const KONTO_STATI = ['aktiv', 'pausiert', 'deaktiviert'] as const

export default function FirmenFlotteDetailClient({ detail }: { detail: FirmenFlotteDetail }) {
  const router = useRouter()
  const { firma, konten, fahrzeuge, karten, schaeden } = detail

  const [notiz, setNotiz] = useState(firma.notiz ?? '')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const dirty = notiz !== (firma.notiz ?? '')

  const [showAdd, setShowAdd] = useState(false)
  const [zb1Offen, setZb1Offen] = useState(false)
  const [kennzeichen, setKennzeichen] = useState('')
  const [hersteller, setHersteller] = useState('')
  const [modell, setModell] = useState('')
  const [fzNotiz, setFzNotiz] = useState('')
  const [fzFin, setFzFin] = useState('')
  const [fzHsn, setFzHsn] = useState('')
  const [fzTsn, setFzTsn] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addFehler, setAddFehler] = useState<string | null>(null)

  const [mintAnzahl, setMintAnzahl] = useState('10')
  const [mintCharge, setMintCharge] = useState('')
  const [mintBusy, setMintBusy] = useState(false)
  const [mintFehler, setMintFehler] = useState<string | null>(null)
  const [mintErfolg, setMintErfolg] = useState<{ anzahl: number; charge: string | null } | null>(null)

  const [kontoBusy, setKontoBusy] = useState<string | null>(null)
  const [waNummer, setWaNummer] = useState<Record<string, string>>(() =>
    Object.fromEntries(konten.map((k) => [k.konto_id, k.whatsapp_nummer ?? ''])),
  )
  const [waBusy, setWaBusy] = useState<string | null>(null)
  const [waFehler, setWaFehler] = useState<Record<string, string | null>>({})

  const adresse =
    [firma.adresse_strasse, [firma.adresse_plz, firma.adresse_ort].filter(Boolean).join(' ')]
      .filter((t) => t && t.trim())
      .join(', ') || null

  async function speichereNotiz() {
    setBusy(true)
    setFehler(null)
    const res = await updateVertriebFeld('firmen-flotte', firma.id, 'notizen', notiz.trim() || null)
    setBusy(false)
    if (!res.ok) return setFehler(res.error)
    router.refresh()
  }

  async function fahrzeugAnlegen() {
    setAddBusy(true)
    setAddFehler(null)
    const res = await fuegeFahrzeugZuFlotteHinzu(firma.id, {
      kennzeichen: kennzeichen.trim(),
      hersteller: hersteller.trim() || undefined,
      modell: modell.trim() || undefined,
      notiz: fzNotiz.trim() || undefined,
      fin: fzFin.trim() || undefined,
      hsn: fzHsn.trim() || undefined,
      tsn: fzTsn.trim() || undefined,
    })
    setAddBusy(false)
    if (!res.ok) return setAddFehler(res.error ?? 'Anlegen fehlgeschlagen.')
    setKennzeichen('')
    setHersteller('')
    setModell('')
    setFzNotiz('')
    setFzFin('')
    setFzHsn('')
    setFzTsn('')
    setShowAdd(false)
    router.refresh()
  }

  async function fahrzeugEntfernen(flottenFahrzeugId: string) {
    const res = await entferneFahrzeugAusFlotte(firma.id, flottenFahrzeugId)
    if (res.ok) router.refresh()
  }

  async function karteBatchMinten() {
    const n = parseInt(mintAnzahl, 10)
    if (!Number.isInteger(n) || n < 1) {
      setMintFehler('Bitte eine Anzahl von mindestens 1 angeben.')
      return
    }
    setMintBusy(true)
    setMintFehler(null)
    setMintErfolg(null)
    const res = await minteKartenBatchStaff(firma.id, n, mintCharge.trim() || null)
    setMintBusy(false)
    if (!res.ok) return setMintFehler(res.error)
    setMintErfolg({ anzahl: res.anzahl, charge: res.charge })
    setMintCharge('')
    router.refresh()
  }

  async function kontoStatusSetzen(kontoId: string, status: (typeof KONTO_STATI)[number]) {
    setKontoBusy(kontoId)
    const res = await setzeFlottenKontoStatus(firma.id, kontoId, status)
    setKontoBusy(null)
    if (res.ok) router.refresh()
  }

  async function whatsappSpeichern(kontoId: string) {
    setWaBusy(kontoId)
    setWaFehler((m) => ({ ...m, [kontoId]: null }))
    const res = await setzeFlottenKontoWhatsapp(firma.id, kontoId, waNummer[kontoId] ?? '')
    setWaBusy(null)
    if (!res.ok) return setWaFehler((m) => ({ ...m, [kontoId]: res.error ?? 'Fehler' }))
    router.refresh()
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      <PageHeader
        title={firma.name ?? 'Firmen-Flotte'}
        description={`${fahrzeuge.length} Fahrzeuge · ${karten.length} Karten · ${schaeden.length} Schäden · ${konten.length} Flottenmanager`}
        icon={BuildingIcon}
      />

      <SectionCard title="Stammdaten">
        <div className="grid grid-cols-2 gap-4">
          <Feld label="Firma" wert={firma.name} />
          <Feld label="USt-IdNr." wert={firma.ust_id} />
          <Feld label="Rechtsform" wert={firma.rechtsform} />
          <Feld label="Adresse" wert={adresse} />
          <Feld label="Telefon" wert={firma.telefon} />
          <Feld label="E-Mail" wert={firma.email} />
          <Feld label="Webseite" wert={firma.webseite} />
        </div>
        <div className="space-y-2 mt-4">
          <p className="text-caption text-claimondo-ondo/60">Notizen (intern)</p>
          <textarea
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            rows={3}
            placeholder="Interne Notiz zu dieser Flotte…"
            className={`${FELD_CLS} w-full resize-y`}
          />
          {fehler && <p className="text-caption text-danger-strong">{fehler}</p>}
          <Button variant="navy" size="sm" onClick={speichereNotiz} loading={busy} disabled={!dirty || busy}>
            Speichern
          </Button>
        </div>
      </SectionCard>

      <div className="mt-6">
        <h3 className="text-heading-sm text-claimondo-navy mb-2">Aktivität</h3>
        <PartnerCockpitPanel partnerTyp="flotte" partnerId={firma.id} />
      </div>

      <SectionCard title={`Fahrzeuge (${fahrzeuge.length})`}>
        {fahrzeuge.length === 0 ? (
          <p className="text-body-sm text-claimondo-ondo/60">Noch keine Fahrzeuge in dieser Flotte.</p>
        ) : (
          <DataTableContainer>
            <Table>
              <Thead>
                <Tr>
                  <Th className="text-left">Kennzeichen</Th>
                  <Th className="text-left">Hersteller</Th>
                  <Th className="text-left">Modell</Th>
                  <Th className="text-left">Status</Th>
                  <Th className="text-right">Aktion</Th>
                </Tr>
              </Thead>
              <Tbody>
                {fahrzeuge.map((f) => (
                  <Tr key={f.flotten_fahrzeug_id}>
                    <Td className="font-medium text-claimondo-navy">{f.kennzeichen ?? '—'}</Td>
                    <Td>{f.hersteller ?? '—'}</Td>
                    <Td>{f.modell ?? '—'}</Td>
                    <Td>{f.status ?? '—'}</Td>
                    <Td className="text-right">
                      <ConfirmEntfernenButton onConfirm={() => fahrzeugEntfernen(f.flotten_fahrzeug_id)} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </DataTableContainer>
        )}
        <div className="mt-3">
          {!showAdd ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="ondo" size="sm" onClick={() => setShowAdd(true)}>
                + Fahrzeug hinzufügen
              </Button>
              <Button
                variant="ghost"
                size="sm"
                iconLeft={<CameraIcon className="h-4 w-4" />}
                onClick={() => setZb1Offen(true)}
              >
                Mehrere per ZB1 scannen
              </Button>
            </div>
          ) : (
            <div className="space-y-2 rounded-ios-lg border border-claimondo-border p-3">
              <div className="grid grid-cols-2 gap-2">
                <input value={kennzeichen} onChange={(e) => setKennzeichen(e.target.value)} placeholder="Kennzeichen *" className={FELD_CLS} />
                <input value={hersteller} onChange={(e) => setHersteller(e.target.value)} placeholder="Hersteller" className={FELD_CLS} />
                <input value={modell} onChange={(e) => setModell(e.target.value)} placeholder="Modell" className={FELD_CLS} />
                <input value={fzNotiz} onChange={(e) => setFzNotiz(e.target.value)} placeholder="Notiz (optional)" className={FELD_CLS} />
                <input value={fzFin} onChange={(e) => setFzFin(e.target.value)} placeholder="FIN (optional)" className={FELD_CLS} />
                <input value={fzHsn} onChange={(e) => setFzHsn(e.target.value)} placeholder="HSN (optional)" className={FELD_CLS} />
                <input value={fzTsn} onChange={(e) => setFzTsn(e.target.value)} placeholder="TSN (optional)" className={FELD_CLS} />
              </div>
              {addFehler && <p className="text-caption text-danger-strong">{addFehler}</p>}
              <div className="flex gap-2">
                <Button variant="navy" size="sm" onClick={fahrzeugAnlegen} loading={addBusy} disabled={!kennzeichen.trim() || addBusy}>
                  Anlegen
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setAddFehler(null) }}>
                  Abbrechen
                </Button>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title={`Schaden-Karten (${karten.length})`}>
        {/* Flow-Erklaerung — NFC-Schreiben ist OPTIONAL (nur Android); eine gebundene Karte mit QR reicht. */}
        <div className="mb-4 rounded-ios-lg border border-claimondo-border bg-claimondo-bg p-3">
          <p className="text-body-sm font-medium text-claimondo-navy">So funktioniert eine Schaden-Karte</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-caption text-claimondo-ondo/80">
            <li>
              <strong className="text-claimondo-navy">Erzeugen</strong> — Karten anlegen und als QR-Codes drucken.
            </li>
            <li>
              <strong className="text-claimondo-navy">Flottenmanager bindet</strong> — die Karte wird im
              Flottenmanager-Portal ans Fahrzeug gebunden (nicht hier im Admin).
            </li>
            <li>Fertig — der QR-Code macht die Karte sofort einsatzbereit.</li>
          </ol>
          <p className="mt-2 text-caption text-claimondo-ondo/60">
            Das <strong className="text-claimondo-navy">NFC-Antippen</strong> ist optional und nur am Android-Handy
            möglich. Eine gebundene Karte mit gedrucktem QR-Code funktioniert auch ohne.
          </p>
        </div>

        <div className="mb-4 space-y-2 rounded-ios-lg border border-claimondo-border p-3">
          <p className="text-body-sm font-medium text-claimondo-navy">1 · Karten erzeugen</p>
          <p className="text-caption text-claimondo-ondo/70">
            Erzeugt Blanko-Karten für diese Firma — als QR-Codes drucken; gebunden wird im Flottenmanager-Portal.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-caption text-claimondo-ondo/60">Anzahl</span>
              <input
                type="number"
                min={1}
                max={200}
                value={mintAnzahl}
                onChange={(e) => setMintAnzahl(e.target.value)}
                className={`${FELD_CLS} mt-0.5 w-24`}
              />
            </label>
            <label className="block min-w-[10rem] flex-1">
              <span className="text-caption text-claimondo-ondo/60">Bezeichnung (optional)</span>
              <input
                value={mintCharge}
                onChange={(e) => setMintCharge(e.target.value)}
                placeholder="z. B. Erstcharge 2026"
                className={`${FELD_CLS} mt-0.5 w-full`}
              />
            </label>
            <Button variant="ondo" size="sm" onClick={karteBatchMinten} loading={mintBusy}>
              Karten erzeugen
            </Button>
            <Link href={`/admin/vertrieb/firmen-flotte/${firma.id}/karten-druck`} target="_blank">
              <Button variant="ghost" size="sm">
                QR-Codes drucken
              </Button>
            </Link>
          </div>
          {mintFehler && <p className="text-caption text-danger-strong">{mintFehler}</p>}
          {mintErfolg && (
            <p className="text-caption text-success-strong">
              {mintErfolg.anzahl} Karten erzeugt.{' '}
              <Link
                href={`/admin/vertrieb/firmen-flotte/${firma.id}/karten-druck${mintErfolg.charge ? `?charge=${encodeURIComponent(mintErfolg.charge)}` : ''}`}
                target="_blank"
                className="underline"
              >
                Jetzt drucken →
              </Link>
            </p>
          )}
        </div>

        {karten.length === 0 ? (
          <p className="text-body-sm text-claimondo-ondo/60">Noch keine Karten. Oben „Karten erzeugen" nutzen.</p>
        ) : (
          <>
            <NfcBeschreibenHinweis />
            <div className="mb-1">
              <p className="text-body-sm font-medium text-claimondo-navy">2 · NFC beschreiben (optional)</p>
            </div>
            <p className="mb-2 text-caption text-claimondo-ondo/60">
              Die Bindung ans Fahrzeug macht der Flottenmanager selbst in seinem Portal.
            </p>
            <DataTableContainer>
              <Table>
                <Thead>
                  <Tr>
                    <Th className="text-left">Token</Th>
                    <Th className="text-left">Status</Th>
                    <Th className="text-left">Fahrzeug</Th>
                    <Th className="text-left">NFC (optional)</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {karten.map((k) => (
                    <Tr key={k.id}>
                      <Td className="font-mono text-body-xs text-claimondo-navy">{k.token}</Td>
                      <Td>{k.status}</Td>
                      <Td>
                        {k.fahrzeug_id ? (
                          <span className="text-body-xs text-claimondo-navy">{k.kennzeichen ?? 'gebunden'}</span>
                        ) : (
                          <span className="text-body-xs text-claimondo-ondo/50">nicht gebunden</span>
                        )}
                      </Td>
                      <Td>
                        <NfcKarteSchreibenButton
                          token={k.token}
                          beschrieben={k.beschrieben}
                          onGeschrieben={(token, uid) => finalisiereKarteStaff(firma.id, token, uid)}
                        />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </DataTableContainer>
          </>
        )}
      </SectionCard>

      <SectionCard title={`Schäden (${schaeden.length})`}>
        {schaeden.length === 0 ? (
          <p className="text-body-sm text-claimondo-ondo/60">Keine Schäden für Fahrzeuge dieser Flotte.</p>
        ) : (
          <DataTableContainer>
            <Table>
              <Thead>
                <Tr>
                  <Th className="text-left">Schaden-Nr.</Th>
                  <Th className="text-left">Fahrzeug</Th>
                  <Th className="text-left">Status</Th>
                  <Th className="text-left">Schadentag</Th>
                  <Th className="text-right">Betrag (netto)</Th>
                </Tr>
              </Thead>
              <Tbody>
                {schaeden.map((s) => (
                  <Tr key={s.claim_id}>
                    <Td className="font-medium text-claimondo-navy">{s.claim_nummer ?? '—'}</Td>
                    <Td>{s.kennzeichen ?? '—'}</Td>
                    <Td>{s.status ?? '—'}</Td>
                    <Td>{s.schadentag ? new Date(s.schadentag).toLocaleDateString('de-DE') : '—'}</Td>
                    <Td className="text-right tabular-nums">
                      {s.schadens_hoehe_netto != null ? `${s.schadens_hoehe_netto.toLocaleString('de-DE')} €` : '—'}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </DataTableContainer>
        )}
      </SectionCard>

      <SectionCard title={konten.length === 1 ? 'Flottenmanager-Konto' : `Flottenmanager-Konten (${konten.length})`}>
        {konten.length === 0 ? (
          <p className="text-body-sm text-claimondo-ondo/60">Kein Flottenmanager-Konto verknüpft.</p>
        ) : (
          <div className="space-y-3">
            {konten.map((k) => {
              const waDirty = (waNummer[k.konto_id] ?? '') !== (k.whatsapp_nummer ?? '')
              return (
                <div key={k.konto_id} className="flex flex-col gap-2 rounded-ios-lg border border-claimondo-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-claimondo-navy">
                        {[k.vorname, k.nachname].filter(Boolean).join(' ') || k.email || '—'}
                      </p>
                      <p className="text-caption text-claimondo-ondo/60">
                        {k.email ?? '—'} · Status: {k.status}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      {KONTO_STATI.map((st) => (
                        <Button
                          key={st}
                          variant={k.status === st ? 'navy' : 'ghost'}
                          size="sm"
                          loading={kontoBusy === k.konto_id}
                          disabled={k.status === st || kontoBusy === k.konto_id}
                          onClick={() => kontoStatusSetzen(k.konto_id, st)}
                        >
                          {st}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-end gap-2 border-t border-claimondo-border/60 pt-2">
                    <div className="min-w-[12rem] flex-1">
                      <label className="text-caption text-claimondo-ondo/60">
                        WhatsApp-Nummer (Schaden-Benachrichtigung)
                      </label>
                      <input
                        value={waNummer[k.konto_id] ?? ''}
                        onChange={(e) => setWaNummer((m) => ({ ...m, [k.konto_id]: e.target.value }))}
                        placeholder="z. B. +49 163 3628571"
                        inputMode="tel"
                        className={`${FELD_CLS} mt-0.5 w-full`}
                      />
                    </div>
                    <Button
                      variant="navy"
                      size="sm"
                      loading={waBusy === k.konto_id}
                      disabled={!waDirty || waBusy === k.konto_id}
                      onClick={() => whatsappSpeichern(k.konto_id)}
                    >
                      Speichern
                    </Button>
                  </div>
                  {waFehler[k.konto_id] && (
                    <p className="text-caption text-danger-strong">{waFehler[k.konto_id]}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      {zb1Offen ? (
        <Zb1BatchScanner
          onScan={(base64) => scanZb1KarteFuerFlotte(firma.id, base64)}
          onAnlegen={(zeilen) => legeZb1FahrzeugeFuerFlotte(firma.id, zeilen)}
          onFertig={() => {
            setZb1Offen(false)
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}
