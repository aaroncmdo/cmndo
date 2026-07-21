'use client'

// Firmen-Flotten-Akte — Sektions-View. Analog Werkstatt-Detail. Sektionen:
// Stammdaten (Task 5), Fahrzeuge (Task 6), Karten (Task 7), Schaeden (Task 8),
// Flottenmanager-Konto (Task 9). Mutationen ueber staff-Actions (requireRole); Karten-Mint/-Bind
// via kanonischer schadenkarte-Lib (89f501f6), Fahrzeuge via mutate-flotte.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BuildingIcon, CameraIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives'
import Zb1BatchScanner from '@/components/flotte/Zb1BatchScanner'
import { NfcKarteBeschreiben } from '@/components/flotte/NfcKarteBeschreiben'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import { updateVertriebFeld } from '../../_actions/update-vertrieb-feld'
import {
  fuegeFahrzeugZuFlotteHinzu,
  entferneFahrzeugAusFlotte,
  scanZb1KarteFuerFlotte,
  legeZb1FahrzeugeFuerFlotte,
} from '../../_actions/firmen-flotte-fahrzeuge'
import { minteKartenFuerFlotte, bindeKarteAnFahrzeug, provisioniereKarteTokenStaff, finalisiereKarteStaff } from '../../_actions/firmen-flotte-karten'
import { setzeFlottenKontoStatus } from '../../_actions/firmen-flotte-konto'
import type { FirmenFlotteDetail } from '../../_lib/firmen-flotte-detail'

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
  const [addBusy, setAddBusy] = useState(false)
  const [addFehler, setAddFehler] = useState<string | null>(null)

  const [mintAnzahl, setMintAnzahl] = useState(10)
  const [mintCharge, setMintCharge] = useState('')
  const [mintBusy, setMintBusy] = useState(false)
  const [mintFehler, setMintFehler] = useState<string | null>(null)
  const [bindFehler, setBindFehler] = useState<string | null>(null)

  const [kontoBusy, setKontoBusy] = useState<string | null>(null)

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
    })
    setAddBusy(false)
    if (!res.ok) return setAddFehler(res.error ?? 'Anlegen fehlgeschlagen.')
    setKennzeichen('')
    setHersteller('')
    setModell('')
    setFzNotiz('')
    setShowAdd(false)
    router.refresh()
  }

  async function fahrzeugEntfernen(flottenFahrzeugId: string) {
    const res = await entferneFahrzeugAusFlotte(firma.id, flottenFahrzeugId)
    if (res.ok) router.refresh()
  }

  async function kartenErzeugen() {
    setMintBusy(true)
    setMintFehler(null)
    const res = await minteKartenFuerFlotte(firma.id, mintAnzahl, mintCharge.trim() || undefined)
    setMintBusy(false)
    if (!res.ok) return setMintFehler(res.error ?? 'Erzeugen fehlgeschlagen.')
    setMintCharge('')
    router.refresh()
  }

  async function karteBinden(token: string, fahrzeugId: string) {
    if (!fahrzeugId) return
    setBindFehler(null)
    const res = await bindeKarteAnFahrzeug(firma.id, token, fahrzeugId)
    if (!res.ok) return setBindFehler(res.error ?? 'Binden fehlgeschlagen.')
    router.refresh()
  }

  async function kontoStatusSetzen(kontoId: string, status: (typeof KONTO_STATI)[number]) {
    setKontoBusy(kontoId)
    const res = await setzeFlottenKontoStatus(firma.id, kontoId, status)
    setKontoBusy(null)
    if (res.ok) router.refresh()
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
                      <Button variant="ghost" size="sm" onClick={() => fahrzeugEntfernen(f.flotten_fahrzeug_id)}>
                        Entfernen
                      </Button>
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
        <div className="mb-4">
          <NfcKarteBeschreiben
            fahrzeuge={fahrzeuge.map((f) => ({
              vehicleId: f.vehicle_id,
              label: f.kennzeichen ?? f.vehicle_id,
            }))}
            onMintToken={() => provisioniereKarteTokenStaff(firma.id)}
            onFinalize={(token, nfcUid, fahrzeugId) =>
              finalisiereKarteStaff(firma.id, token, nfcUid, fahrzeugId)
            }
          />
        </div>
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <label className="flex flex-col gap-1">
            <span className="text-body-xs text-claimondo-ondo">Anzahl (1–200)</span>
            <input type="number" min={1} max={200} value={mintAnzahl} onChange={(e) => setMintAnzahl(Number(e.target.value))} className={`${FELD_CLS} w-24`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-body-xs text-claimondo-ondo">Charge (optional)</span>
            <input value={mintCharge} onChange={(e) => setMintCharge(e.target.value)} placeholder="z.B. Flotte-2026" className={`${FELD_CLS} w-44`} />
          </label>
          <Button variant="navy" size="sm" onClick={kartenErzeugen} loading={mintBusy} disabled={mintAnzahl < 1 || mintBusy}>
            Karten erzeugen
          </Button>
        </div>
        {mintFehler && <p className="text-caption text-danger-strong mb-2">{mintFehler}</p>}

        {karten.length === 0 ? (
          <p className="text-body-sm text-claimondo-ondo/60">Noch keine Karten. Erzeuge oben eine Charge.</p>
        ) : (
          <DataTableContainer>
            <Table>
              <Thead>
                <Tr>
                  <Th className="text-left">Token</Th>
                  <Th className="text-left">Status</Th>
                  <Th className="text-left">Fahrzeug</Th>
                </Tr>
              </Thead>
              <Tbody>
                {karten.map((k) => (
                  <Tr key={k.id}>
                    <Td className="font-mono text-body-xs text-claimondo-navy">{k.token}</Td>
                    <Td>{k.status}</Td>
                    <Td>
                      {k.fahrzeug_id ? (
                        k.kennzeichen ?? 'gebunden'
                      ) : (
                        <select
                          defaultValue=""
                          onChange={(e) => karteBinden(k.token, e.target.value)}
                          disabled={fahrzeuge.length === 0}
                          className={`${FELD_CLS} text-body-xs py-1`}
                        >
                          <option value="">— an Fahrzeug binden —</option>
                          {fahrzeuge.map((f) => (
                            <option key={f.vehicle_id} value={f.vehicle_id}>
                              {f.kennzeichen ?? f.vehicle_id}
                            </option>
                          ))}
                        </select>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </DataTableContainer>
        )}
        {bindFehler && <p className="text-caption text-danger-strong mt-2">{bindFehler}</p>}
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
            {konten.map((k) => (
              <div key={k.konto_id} className="flex flex-wrap items-center justify-between gap-2 rounded-ios-lg border border-claimondo-border p-3">
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
            ))}
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
