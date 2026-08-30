'use client'

// Sub-Projekt 2 (Kunde-Portal 1+): Firma & Flotte — Client.
// Kein Firmen-Konto -> Firma-Setup; sonst Flotten-Liste + Hinzufuegen/Entfernen.
// Policy-konform: shared/forms/TextField, SectionCard, primitives/Button.
// Actions als Props — kunde-Portal reicht eigene Server-Actions rein;
// flottenmanager reicht seine Actions rein (kein harter './actions'-Import mehr).

import { useState } from 'react'
import type { FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CarIcon, ChevronRightIcon, CameraIcon } from 'lucide-react'
import { TextField } from '@/components/shared/forms/TextField'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives/Button'
import { ConfirmEntfernenButton } from '@/components/shared/ConfirmEntfernenButton'
import Zb1BatchScanner from '@/components/flotte/Zb1BatchScanner'
import type { ScanErgebnis } from '@/lib/flotte/zb1-scan'
import type { BatchAnlageZeile, BatchAnlageErgebnis } from '@/lib/flotte/zb1-batch-anlage'
import type { KundeFirma, FlottenFahrzeug, FirmaForm, FahrzeugForm } from '@/lib/kunde/firma-flotte'
import { ZustandAmpelBadge } from '@/components/shared/ZustandAmpelBadge'

type Props = {
  firma: KundeFirma | null
  flotte: FlottenFahrzeug[]
  onSpeichereFirma?: (form: FirmaForm) => Promise<{ ok: boolean; error?: string }>
  onFuegeHinzu: (form: FahrzeugForm) => Promise<{ ok: boolean; error?: string }>
  onEntferne: (flottenId: string) => Promise<{ ok: boolean; error?: string }>
  /** Wenn gesetzt: Fahrzeug-Zeilen verlinken auf `${detailBasePath}/${vehicleId}` (nur flottenmanager-Portal; Kunde laesst es weg). */
  detailBasePath?: string
  /** ZB1-Batch-Scan (nur flottenmanager-Portal — beide zusammen gesetzt; Kunde laesst sie weg). */
  onScanZb1?: (base64: string) => Promise<{ ok: true; ergebnis: ScanErgebnis } | { ok: false; error: string }>
  onLegeZb1?: (zeilen: BatchAnlageZeile[]) => Promise<BatchAnlageErgebnis[]>
  /** B (Zustandsdoku): vehicleId -> letzter abgeschlossener Scan (ISO) fuer die Ampel. Nur FM-Portal. */
  scanAmByVehicleId?: Record<string, string | null>
}

export default function FlotteClient({ firma, flotte, onSpeichereFirma, onFuegeHinzu, onEntferne, detailBasePath, onScanZb1, onLegeZb1, scanAmByVehicleId }: Props) {
  const router = useRouter()
  const [zb1Offen, setZb1Offen] = useState(false)
  const zb1Verfuegbar = !!onScanZb1 && !!onLegeZb1
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [firmaForm, setFirmaForm] = useState({ name: '', rechtsform: '', ustId: '', strasse: '', plz: '', ort: '' })
  const [fzForm, setFzForm] = useState({ kennzeichen: '', hersteller: '', modell: '', notiz: '', fin: '', hsn: '', tsn: '' })

  async function handleSpeichereFirma(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const res = await onSpeichereFirma!(firmaForm)
    setBusy(false)
    if (res.ok) router.refresh()
    else setError(res.error ?? 'Fehler')
  }

  async function handleFuegeHinzu(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const res = await onFuegeHinzu(fzForm)
    setBusy(false)
    if (res.ok) {
      setFzForm({ kennzeichen: '', hersteller: '', modell: '', notiz: '', fin: '', hsn: '', tsn: '' })
      router.refresh()
    } else setError(res.error ?? 'Fehler')
  }

  async function handleEntferne(flottenId: string) {
    setError(null)
    setBusy(true)
    const res = await onEntferne(flottenId)
    setBusy(false)
    if (res.ok) router.refresh()
    else setError(res.error ?? 'Fehler')
  }

  if (!firma) {
    if (!onSpeichereFirma) return null
    return (
      <SectionCard title="Firmen-Konto anlegen" subtitle="Für gewerbliche Kunden mit mehreren Fahrzeugen.">
        <form onSubmit={handleSpeichereFirma} className="space-y-4">
          <TextField
            label="Firmenname"
            value={firmaForm.name}
            onChange={(e) => setFirmaForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="z. B. Muster GmbH"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Rechtsform (optional)" value={firmaForm.rechtsform} onChange={(e) => setFirmaForm((p) => ({ ...p, rechtsform: e.target.value }))} placeholder="GmbH" />
            <TextField label="USt-IdNr. (optional)" value={firmaForm.ustId} onChange={(e) => setFirmaForm((p) => ({ ...p, ustId: e.target.value }))} placeholder="DE…" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="adr-flotteclient" className="text-xs font-semibold text-claimondo-shield">Straße (optional)</label>
            {/* P2 Ortseingaben: Autocomplete füllt Straße + PLZ + Ort. Felder bleiben editierbar. */}
            <GooglePlaceAutocomplete
              id="adr-flotteclient"
              className="w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy placeholder:text-claimondo-shield/60 focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/30"
              defaultValue={firmaForm.strasse}
              placeholder="Straße + Hausnummer eingeben…"
              onSelect={(r) =>
                setFirmaForm((p) => ({ ...p, strasse: r.strasse || p.strasse, plz: r.plz || p.plz, ort: r.stadt || p.ort }))
              }
              onChange={(t) => setFirmaForm((p) => ({ ...p, strasse: t }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="PLZ (optional)" value={firmaForm.plz} onChange={(e) => setFirmaForm((p) => ({ ...p, plz: e.target.value }))} inputMode="numeric" maxLength={5} />
            <TextField label="Ort (optional)" value={firmaForm.ort} onChange={(e) => setFirmaForm((p) => ({ ...p, ort: e.target.value }))} />
          </div>
          {error ? <p className="text-sm text-danger-strong">{error}</p> : null}
          <Button type="submit" variant="navy" fullWidth loading={busy}>
            Firmen-Konto anlegen
          </Button>
        </form>
      </SectionCard>
    )
  }

  return (
    <div className="space-y-5">
      <SectionCard title={firma.name} subtitle={[firma.rechtsform, firma.ort].filter(Boolean).join(' · ') || 'Firmen-Konto'}>
        <p className="text-sm text-claimondo-shield">
          {flotte.length} {flotte.length === 1 ? 'Fahrzeug' : 'Fahrzeuge'} in der Flotte.
        </p>
      </SectionCard>

      <SectionCard title="Fahrzeuge">
        {flotte.length === 0 ? (
          <p className="text-sm text-claimondo-shield">Noch keine Fahrzeuge — fügen Sie unten das erste hinzu.</p>
        ) : (
          <ul className="divide-y divide-claimondo-border">
            {flotte.map((v) => {
              const inner = (
                <>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ios-md bg-claimondo-bg">
                    <CarIcon className="h-4 w-4 text-claimondo-ondo" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-claimondo-navy">{v.kennzeichen ?? '—'}</p>
                    <p className="truncate text-xs text-claimondo-shield">
                      {[v.hersteller, v.modell].filter(Boolean).join(' ') || 'Fahrzeug'}
                    </p>
                    {scanAmByVehicleId ? (
                      <div className="mt-1">
                        <ZustandAmpelBadge letzterScanAm={scanAmByVehicleId[v.vehicleId] ?? null} />
                      </div>
                    ) : null}
                  </div>
                  {detailBasePath ? <ChevronRightIcon className="h-4 w-4 shrink-0 text-claimondo-ondo/60" /> : null}
                </>
              )
              return (
                <li key={v.flottenId} className="flex items-center gap-3 py-3">
                  {detailBasePath ? (
                    <Link
                      href={`${detailBasePath}/${v.vehicleId}`}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-ios-md py-1 transition-colors hover:bg-claimondo-bg"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-3">{inner}</div>
                  )}
                  <ConfirmEntfernenButton onConfirm={() => handleEntferne(v.flottenId)} />
                </li>
              )
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Fahrzeug hinzufügen">
        {zb1Verfuegbar ? (
          <div className="mb-4 space-y-2">
            <Button
              variant="ondo"
              fullWidth
              iconLeft={<CameraIcon className="h-4 w-4" />}
              onClick={() => setZb1Offen(true)}
            >
              Mehrere Fahrzeuge per ZB1 scannen
            </Button>
            <p className="text-xs text-claimondo-shield">Oder einzeln erfassen:</p>
          </div>
        ) : null}
        <form onSubmit={handleFuegeHinzu} className="space-y-4">
          <TextField
            label="Kennzeichen"
            value={fzForm.kennzeichen}
            onChange={(e) => setFzForm((p) => ({ ...p, kennzeichen: e.target.value }))}
            placeholder="z. B. K-AB 123"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Hersteller (optional)" value={fzForm.hersteller} onChange={(e) => setFzForm((p) => ({ ...p, hersteller: e.target.value }))} placeholder="VW" />
            <TextField label="Modell (optional)" value={fzForm.modell} onChange={(e) => setFzForm((p) => ({ ...p, modell: e.target.value }))} placeholder="Golf" />
          </div>
          <TextField label="FIN (optional)" value={fzForm.fin} onChange={(e) => setFzForm((p) => ({ ...p, fin: e.target.value }))} placeholder="17-stellig, z. B. WVWZZZ…" />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="HSN (optional)" value={fzForm.hsn} onChange={(e) => setFzForm((p) => ({ ...p, hsn: e.target.value }))} placeholder="z. B. 0603" />
            <TextField label="TSN (optional)" value={fzForm.tsn} onChange={(e) => setFzForm((p) => ({ ...p, tsn: e.target.value }))} placeholder="z. B. BGU" />
          </div>
          {error ? <p className="text-sm text-danger-strong">{error}</p> : null}
          <Button type="submit" variant="navy" fullWidth loading={busy}>
            Hinzufügen
          </Button>
        </form>
      </SectionCard>

      {zb1Offen && onScanZb1 && onLegeZb1 ? (
        <Zb1BatchScanner
          onScan={onScanZb1}
          onAnlegen={onLegeZb1}
          onFertig={() => {
            setZb1Offen(false)
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}
