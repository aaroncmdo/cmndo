'use client'

// Firmen-Flotten-Akte — Sektions-View. Analog Werkstatt-Detail. Sektionen:
// Stammdaten (Task 5), Fahrzeuge (Task 6), Karten (Task 7), Schaeden (Task 8),
// Flottenmanager-Konto (Task 9).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BuildingIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import { updateVertriebFeld } from '../../_actions/update-vertrieb-feld'
import {
  fuegeFahrzeugZuFlotteHinzu,
  entferneFahrzeugAusFlotte,
} from '../../_actions/firmen-flotte-fahrzeuge'
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

export default function FirmenFlotteDetailClient({ detail }: { detail: FirmenFlotteDetail }) {
  const router = useRouter()
  const { firma, konten, fahrzeuge, karten, schaeden } = detail

  const [notiz, setNotiz] = useState(firma.notiz ?? '')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const dirty = notiz !== (firma.notiz ?? '')

  const [showAdd, setShowAdd] = useState(false)
  const [kennzeichen, setKennzeichen] = useState('')
  const [hersteller, setHersteller] = useState('')
  const [modell, setModell] = useState('')
  const [fzNotiz, setFzNotiz] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addFehler, setAddFehler] = useState<string | null>(null)

  const adresse =
    [firma.adresse_strasse, [firma.adresse_plz, firma.adresse_ort].filter(Boolean).join(' ')]
      .filter((t) => t && t.trim())
      .join(', ') || null

  async function speichereNotiz() {
    setBusy(true)
    setFehler(null)
    const res = await updateVertriebFeld('firmen-flotte', firma.id, 'notizen', notiz.trim() || null)
    setBusy(false)
    if (!res.ok) {
      setFehler(res.error)
      return
    }
    router.refresh()
  }

  async function fahrzeugAnlegen() {
    setAddBusy(true)
    setAddFehler(null)
    const res = await fuegeFahrzeugZuFlotteHinzu(firma.id, {
      kennzeichen: kennzeichen.trim(),
      hersteller: hersteller.trim() || null,
      modell: modell.trim() || null,
      notiz: fzNotiz.trim() || null,
    })
    setAddBusy(false)
    if (!res.ok) {
      setAddFehler(res.error ?? 'Anlegen fehlgeschlagen.')
      return
    }
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
            <Button variant="ondo" size="sm" onClick={() => setShowAdd(true)}>
              + Fahrzeug hinzufügen
            </Button>
          ) : (
            <div className="space-y-2 rounded-ios-lg border border-claimondo-border p-3">
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={kennzeichen}
                  onChange={(e) => setKennzeichen(e.target.value)}
                  placeholder="Kennzeichen *"
                  className={FELD_CLS}
                />
                <input
                  value={hersteller}
                  onChange={(e) => setHersteller(e.target.value)}
                  placeholder="Hersteller"
                  className={FELD_CLS}
                />
                <input
                  value={modell}
                  onChange={(e) => setModell(e.target.value)}
                  placeholder="Modell"
                  className={FELD_CLS}
                />
                <input
                  value={fzNotiz}
                  onChange={(e) => setFzNotiz(e.target.value)}
                  placeholder="Notiz (optional)"
                  className={FELD_CLS}
                />
              </div>
              {addFehler && <p className="text-caption text-danger-strong">{addFehler}</p>}
              <div className="flex gap-2">
                <Button
                  variant="navy"
                  size="sm"
                  onClick={fahrzeugAnlegen}
                  loading={addBusy}
                  disabled={!kennzeichen.trim() || addBusy}
                >
                  Anlegen
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowAdd(false)
                    setAddFehler(null)
                  }}
                >
                  Abbrechen
                </Button>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Schaden-Karten">
        <p className="text-body-sm text-claimondo-ondo/60">— folgt (Task 7: Karten minten + an Fahrzeug binden) —</p>
      </SectionCard>

      <SectionCard title="Schäden">
        <p className="text-body-sm text-claimondo-ondo/60">— folgt (Task 8: Claims der Flotte) —</p>
      </SectionCard>

      <SectionCard title="Flottenmanager-Konto">
        <p className="text-body-sm text-claimondo-ondo/60">— folgt (Task 9: Status / deaktivieren) —</p>
      </SectionCard>
    </div>
  )
}
