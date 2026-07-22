'use client'

// B (Fahrzeug-Zustandsdoku) Task 5: Capture-Wizard (mobil). Fotostrecke (Pflicht-Perspektiven
// + optional Tacho) -> KI-Analyse -> human-in-the-loop Review (Funde bestätigen/verwerfen,
// optional Nahaufnahme) -> Vorschäden. Server-Actions kommen als Props von der Detail-Seite.
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CameraIcon, CheckIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { compressImage } from '@/lib/dokumente/compress-image'
import {
  PFLICHT_PERSPEKTIVEN,
  OPTIONALE_PERSPEKTIVEN,
  PERSPEKTIVE_LABEL,
  alleErfasst,
} from '@/lib/vehicles/zustand-perspektiven'
import type { ZustandFund } from '@/lib/vehicles/zustand-scan-ki'

type Phase = 'idle' | 'capturing' | 'analysing' | 'review' | 'done'
type FundEntscheidung = { bestaetigt: boolean; nahaufnahmeFotoId: string | null }

type StartResult = { ok: true; scanId: string } | { ok: false; error: string }
type FotoResult = { ok: true; fotoId: string; storagePath: string } | { ok: false; error: string }
type AnalyseResult = { ok: true; funde: ZustandFund[] } | { ok: false; error: string }
type FinalResult = { ok: true; angelegt: number } | { ok: false; error: string }

type Props = {
  vehicleId: string
  onStart: (vehicleId: string) => Promise<StartResult>
  onFoto: (
    scanId: string,
    perspektive: string,
    dataUrl: string,
    istNahaufnahme: boolean,
    vorschadenId?: string | null,
  ) => Promise<FotoResult>
  onAnalyse: (scanId: string) => Promise<AnalyseResult>
  onFinalize: (
    scanId: string,
    bestaetigteFunde: (ZustandFund & { nahaufnahmeFotoId?: string | null })[],
    kilometerstand?: number | null,
  ) => Promise<FinalResult>
}

const ALLE_PERSPEKTIVEN = [...PFLICHT_PERSPEKTIVEN, ...OPTIONALE_PERSPEKTIVEN]

async function dateiZuDataUrl(file: File): Promise<string> {
  const { base64, contentType } = await compressImage(file)
  return `data:${contentType};base64,${base64}`
}

export function ZustandsScanWizard({ vehicleId, onStart, onFoto, onAnalyse, onFinalize }: Props) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [scanId, setScanId] = useState<string | null>(null)
  const [erfasst, setErfasst] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [funde, setFunde] = useState<ZustandFund[]>([])
  const [entscheidungen, setEntscheidungen] = useState<Record<number, FundEntscheidung>>({})
  const [kilometerstand, setKilometerstand] = useState('')
  const [angelegt, setAngelegt] = useState(0)

  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const nahRefs = useRef<Record<number, HTMLInputElement | null>>({})

  async function starten() {
    setBusy('start')
    setFehler(null)
    const res = await onStart(vehicleId)
    setBusy(null)
    if (!res.ok) return setFehler(res.error)
    setScanId(res.scanId)
    setPhase('capturing')
  }

  async function fotoGewaehlt(perspektive: string, file: File | undefined) {
    if (!file || !scanId) return
    setBusy(perspektive)
    setFehler(null)
    try {
      const dataUrl = await dateiZuDataUrl(file)
      const res = await onFoto(scanId, perspektive, dataUrl, false)
      if (!res.ok) {
        setFehler(res.error)
        return
      }
      setErfasst((prev) => ({ ...prev, [perspektive]: true }))
    } catch {
      setFehler('Foto konnte nicht verarbeitet werden.')
    } finally {
      setBusy(null)
    }
  }

  async function analysieren() {
    if (!scanId) return
    setPhase('analysing')
    setFehler(null)
    const res = await onAnalyse(scanId)
    if (!res.ok) {
      setFehler(res.error)
      setPhase('capturing')
      return
    }
    setFunde(res.funde)
    // Default: jeder Fund vorbestätigt (der FM verwirft die falschen).
    setEntscheidungen(
      Object.fromEntries(res.funde.map((_, i) => [i, { bestaetigt: true, nahaufnahmeFotoId: null }])),
    )
    setPhase('review')
  }

  async function nahaufnahmeGewaehlt(fundIndex: number, file: File | undefined) {
    if (!file || !scanId) return
    setBusy(`nah-${fundIndex}`)
    try {
      const dataUrl = await dateiZuDataUrl(file)
      const res = await onFoto(scanId, 'nahaufnahme', dataUrl, true)
      if (res.ok) {
        setEntscheidungen((prev) => ({
          ...prev,
          [fundIndex]: { ...prev[fundIndex], nahaufnahmeFotoId: res.fotoId },
        }))
      }
    } catch {
      /* Nahaufnahme ist optional -> fail-soft */
    } finally {
      setBusy(null)
    }
  }

  async function abschliessen() {
    if (!scanId) return
    setBusy('final')
    setFehler(null)
    const bestaetigte: (ZustandFund & { nahaufnahmeFotoId?: string | null })[] = []
    funde.forEach((f, i) => {
      if (entscheidungen[i]?.bestaetigt) {
        bestaetigte.push({ ...f, nahaufnahmeFotoId: entscheidungen[i]?.nahaufnahmeFotoId ?? null })
      }
    })
    const km = kilometerstand.trim() ? Number(kilometerstand.trim()) : null
    const res = await onFinalize(scanId, bestaetigte, Number.isFinite(km as number) ? km : null)
    setBusy(null)
    if (!res.ok) return setFehler(res.error)
    setAngelegt(res.angelegt)
    setPhase('done')
    router.refresh()
  }

  if (phase === 'idle') {
    return (
      <Button variant="ondo" size="sm" iconLeft={<CameraIcon className="h-4 w-4" />} loading={busy === 'start'} onClick={starten}>
        Zustand dokumentieren
      </Button>
    )
  }

  if (phase === 'done') {
    return (
      <div className="rounded-ios-lg border border-claimondo-border bg-success-soft p-3">
        <p className="text-body-sm text-success-strong">
          Zustandsdoku abgeschlossen — {angelegt} {angelegt === 1 ? 'Vorschaden' : 'Vorschäden'} erfasst.
        </p>
      </div>
    )
  }

  if (phase === 'analysing') {
    return <p className="text-body-sm text-claimondo-ondo">Fotos werden analysiert …</p>
  }

  if (phase === 'review') {
    const bestaetigtAnzahl = Object.values(entscheidungen).filter((e) => e.bestaetigt).length
    return (
      <div className="space-y-3">
        <p className="text-body-sm text-claimondo-ondo">
          {funde.length === 0
            ? 'Keine Schäden erkannt. Sie können den Scan trotzdem abschließen (dokumentiert den geprüften Zustand).'
            : `${funde.length} mögliche${funde.length === 1 ? 'r Schaden' : ' Schäden'} erkannt. Bitte prüfen und bestätigen.`}
        </p>
        {funde.map((f, i) => {
          const e = entscheidungen[i]
          return (
            <div key={i} className="space-y-2 rounded-ios-lg border border-claimondo-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-claimondo-navy">
                    {f.art} — {f.bereich} ({PERSPEKTIVE_LABEL[f.perspektive] ?? f.perspektive})
                  </p>
                  <p className="text-caption text-claimondo-ondo/70">
                    Schwere: {f.schwere} · Sicherheit: {f.confidence}%
                  </p>
                  {f.beschreibung && <p className="text-caption text-claimondo-ondo/60">{f.beschreibung}</p>}
                </div>
                <div className="flex gap-1.5">
                  <Button
                    variant={e?.bestaetigt ? 'navy' : 'ghost'}
                    size="sm"
                    onClick={() => setEntscheidungen((p) => ({ ...p, [i]: { ...p[i], bestaetigt: true } }))}
                  >
                    Bestätigen
                  </Button>
                  <Button
                    variant={e?.bestaetigt ? 'ghost' : 'navy'}
                    size="sm"
                    onClick={() => setEntscheidungen((p) => ({ ...p, [i]: { ...p[i], bestaetigt: false } }))}
                  >
                    Verwerfen
                  </Button>
                </div>
              </div>
              {e?.bestaetigt && (
                <div>
                  <input
                    ref={(el) => {
                      nahRefs.current[i] = el
                    }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(ev) => nahaufnahmeGewaehlt(i, ev.target.files?.[0])}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={busy === `nah-${i}`}
                    iconLeft={e.nahaufnahmeFotoId ? <CheckIcon className="h-4 w-4" /> : <CameraIcon className="h-4 w-4" />}
                    onClick={() => nahRefs.current[i]?.click()}
                  >
                    {e.nahaufnahmeFotoId ? 'Nahaufnahme aufgenommen' : 'Nahaufnahme (optional)'}
                  </Button>
                </div>
              )}
            </div>
          )
        })}
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-caption text-claimondo-ondo/60">Kilometerstand (optional)</label>
            <input
              value={kilometerstand}
              onChange={(e) => setKilometerstand(e.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              placeholder="km"
              className="mt-0.5 block rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy"
            />
          </div>
          <Button variant="ondo" size="sm" loading={busy === 'final'} onClick={abschliessen}>
            Abschließen ({bestaetigtAnzahl})
          </Button>
        </div>
        {fehler && <p className="text-caption text-danger-strong">{fehler}</p>}
      </div>
    )
  }

  // phase === 'capturing'
  const pflichtErfasst = alleErfasst(Object.keys(erfasst).filter((k) => erfasst[k]))
  return (
    <div className="space-y-3">
      <p className="text-body-sm text-claimondo-ondo">
        Fotografieren Sie das Fahrzeug aus allen Pflicht-Perspektiven. Am Ende erkennt die KI mögliche Schäden.
      </p>
      <div className="space-y-2">
        {ALLE_PERSPEKTIVEN.map((p) => {
          const optional = (OPTIONALE_PERSPEKTIVEN as readonly string[]).includes(p)
          return (
            <div key={p} className="flex items-center justify-between gap-2 rounded-ios-lg border border-claimondo-border p-2.5">
              <span className="text-body-sm text-claimondo-navy">
                {PERSPEKTIVE_LABEL[p] ?? p}
                {optional && <span className="text-claimondo-ondo/50"> (optional)</span>}
              </span>
              <input
                ref={(el) => {
                  fileRefs.current[p] = el
                }}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(ev) => fotoGewaehlt(p, ev.target.files?.[0])}
              />
              <Button
                variant={erfasst[p] ? 'ghost' : 'navy'}
                size="sm"
                loading={busy === p}
                iconLeft={erfasst[p] ? <CheckIcon className="h-4 w-4" /> : <CameraIcon className="h-4 w-4" />}
                onClick={() => fileRefs.current[p]?.click()}
              >
                {erfasst[p] ? 'Ersetzen' : 'Foto'}
              </Button>
            </div>
          )
        })}
      </div>
      {fehler && <p className="text-caption text-danger-strong">{fehler}</p>}
      <Button variant="ondo" size="sm" disabled={!pflichtErfasst} onClick={analysieren}>
        Fertig — Schäden erkennen
      </Button>
    </div>
  )
}
