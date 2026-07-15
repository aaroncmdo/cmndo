'use client'

// ZB1-Batch-Anlage Task 5 (rollenagnostisch, siehe .superpowers/sdd/task-5-brief.md).
// Drei Phasen in einem Drawer: scannen (Kamera/Galerie -> onScan pro Bild) -> review
// (editierbare Liste, Status-Badge, Halter-Warnung, entfernbar) -> ergebnis (Zusammenfassung
// aus onAnlegen, Fehler-Zeilen zurueck in Review). Wird von zwei Portalen genutzt
// (Flottenmanager /flotte, Admin /admin/vertrieb/firmen-flotte/[id] -- Task 7/8), die je ihre
// eigenen Server-Actions als onScan/onAnlegen reinreichen (unterschiedliches Firma-Scoping).
//
// Kamera/Upload-Mechanik (compressImage) 1:1 aus src/app/upload/zb1/[token]/Zb1UploadClient.tsx
// portiert (kein Shared-Util fuer Canvas-Komprimierung vorhanden -- bewusst lokal dupliziert,
// wie schon FIN_REGEX ueber mehrere Files in src/lib/flotte/, siehe dortige Kommentare).

import { useRef, useState, type ChangeEvent } from 'react'
import { CameraIcon, ImageIcon, Trash2Icon, AlertTriangleIcon, XIcon } from 'lucide-react'
import { Button, Drawer, Badge } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { TextField } from '@/components/shared/forms/TextField'
import type { ScanErgebnis } from '@/lib/flotte/zb1-scan'
import type { BatchAnlageErgebnis, BatchAnlageZeile } from '@/lib/flotte/zb1-batch-anlage'
import type { EditierbareFahrzeugFelder } from '@/lib/flotte/zb1-vehicle'

const MAX_DIMENSION = 2400 // Pixel -- identisch zu Zb1UploadClient (H8)
const JPEG_QUALITY = 0.85

/** Identisch zur compressImage-Logik aus Zb1UploadClient, nur Rueckgabe auf reines base64
 *  verschlankt (der Aufrufer hier braucht kein contentType -- onScan nimmt nur den String). */
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height / width) * MAX_DIMENSION)
            width = MAX_DIMENSION
          } else {
            width = Math.round((width / height) * MAX_DIMENSION)
            height = MAX_DIMENSION
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas-Context nicht verfuegbar'))
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Komprimierung fehlgeschlagen'))
            const r2 = new FileReader()
            r2.onload = (ev) => {
              const dataUrl = ev.target?.result as string
              resolve(dataUrl.split(',')[1] ?? '')
            }
            r2.onerror = () => reject(new Error('Base64-Konvertierung fehlgeschlagen'))
            r2.readAsDataURL(blob)
          },
          'image/jpeg',
          JPEG_QUALITY,
        )
      }
      img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'))
    reader.readAsDataURL(file)
  })
}

/** FIN normalisiert fuer den Batch-Dedup-Vergleich (getrimmt + Grossbuchstaben, leer -> null). */
function normFin(fin: string | null): string | null {
  const t = fin?.trim().toUpperCase()
  return t ? t : null
}

function parseBaujahr(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

/** Eine Zeile in der Batch-Liste: der Scan-Treffer + das Bild + ein reiner UI-Key
 *  (React-Listen-Identitaet -- unabhaengig vom Array-Index, damit ein Entfernen mitten in der
 *  Liste nicht die Eingabefokus-Identitaet einer anderen Zeile durcheinanderbringt). */
type Zeile = ScanErgebnis & { base64: string; key: string }

type Phase = 'scannen' | 'review' | 'ergebnis'

type Anzeige = { label: string; tone: 'success' | 'warning' | 'info' | 'danger' }

/** Status-Ableitung je Zeile (Review-Phase) -- reine Label+Tone-Auswahl fuer die Badge-Primitive,
 *  keine Farb-Map/-Ternary (Ratchet check:status-registry). Prioritaet: bereits-in-Flotte vor
 *  keine-FIN vor niedrige-Confidence, sonst ok. */
function leiteZeilenAnzeige(z: Zeile): Anzeige {
  if (z.bereitsInFlotte) return { label: 'bereits in Flotte', tone: 'info' }
  if (!z.felder.fin) return { label: 'keine FIN', tone: 'warning' }
  if (z.confidence < 0.8) return { label: '⚠ bitte prüfen', tone: 'warning' }
  return { label: 'ok', tone: 'success' }
}

// Reine Label-Map ohne Farb-Klassen (nur Badge-tone-Enum-Werte, keine Tailwind-Farbstrings) --
// unschaedlich fuer den Status-Registry-Ratchet.
const ERGEBNIS_ANZEIGE: Record<BatchAnlageErgebnis['status'], Anzeige> = {
  angelegt: { label: 'Angelegt', tone: 'success' },
  aktualisiert: { label: 'Aktualisiert', tone: 'info' },
  stub: { label: 'Als Stub angelegt', tone: 'warning' },
  fehler: { label: 'Fehler', tone: 'danger' },
}

const PHASE_SUBTITLE: Record<Phase, string> = {
  scannen: 'Schritt 1 von 3 · Karten scannen',
  review: 'Schritt 2 von 3 · Angaben prüfen',
  ergebnis: 'Schritt 3 von 3 · Ergebnis',
}

type Props = {
  /** Teil des Props-Vertrags (identisch fuer beide Caller, Task 7/8) -- wird hier nicht
   *  destrukturiert/verwendet, weil onScan/onAnlegen die Firma bereits serverseitig gebunden
   *  reinreichen. Bewusst kein ungenutzter lokaler Binding (kein Dead-Code-Fund). */
  firmaId: string
  onScan: (base64: string) => Promise<{ ok: true; ergebnis: ScanErgebnis } | { ok: false; error: string }>
  onAnlegen: (zeilen: (BatchAnlageZeile & { base64: string })[]) => Promise<BatchAnlageErgebnis[]>
  onFertig: () => void
}

export default function Zb1BatchScanner({ onScan, onAnlegen, onFertig }: Props) {
  const [phase, setPhase] = useState<Phase>('scannen')
  const [zeilen, setZeilen] = useState<Zeile[]>([])
  const [ergebnis, setErgebnis] = useState<BatchAnlageErgebnis[] | null>(null)

  const [scanning, setScanning] = useState(false)
  const [scanFehler, setScanFehler] = useState<string | null>(null)
  const [dedupHinweis, setDedupHinweis] = useState<string | null>(null)
  const [anlegenLaeuft, setAnlegenLaeuft] = useState(false)
  const [anlegenFehler, setAnlegenFehler] = useState<string | null>(null)

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const busy = scanning || anlegenLaeuft

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setScanFehler('Bitte ein Bild auswählen.')
      return
    }
    setScanFehler(null)
    setDedupHinweis(null)
    setScanning(true)
    try {
      const base64 = await compressImage(file)
      const result = await onScan(base64)
      if (!result.ok) {
        setScanFehler(result.error)
        return
      }
      const neueFin = normFin(result.ergebnis.felder.fin)
      const istDuplikat = neueFin !== null && zeilen.some((z) => normFin(z.felder.fin) === neueFin)
      if (istDuplikat) {
        setDedupHinweis('Diese Karte ist bereits in der Liste.')
        return
      }
      setZeilen((prev) => [...prev, { ...result.ergebnis, base64, key: crypto.randomUUID() }])
    } catch (err) {
      setScanFehler(err instanceof Error ? err.message : 'Bild konnte nicht verarbeitet werden.')
    } finally {
      setScanning(false)
    }
  }

  function onDateiAusgewaehlt(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void handleFile(file)
  }

  function entferneZeile(index: number) {
    setZeilen((prev) => prev.filter((_, i) => i !== index))
  }

  function aktualisiereFeld(index: number, patch: Partial<EditierbareFahrzeugFelder>) {
    setZeilen((prev) => prev.map((z, i) => (i === index ? { ...z, felder: { ...z.felder, ...patch } } : z)))
  }

  async function handleAlleAnlegen() {
    if (zeilen.length === 0) return
    setAnlegenFehler(null)
    setAnlegenLaeuft(true)
    try {
      const payload: (BatchAnlageZeile & { base64: string })[] = zeilen.map((z) => ({
        felder: z.felder,
        bereitsInFlotte: z.bereitsInFlotte,
        base64: z.base64,
      }))
      const res = await onAnlegen(payload)
      setErgebnis(res)
      setPhase('ergebnis')
    } catch (err) {
      setAnlegenFehler(err instanceof Error ? err.message : 'Anlegen fehlgeschlagen. Bitte erneut versuchen.')
    } finally {
      setAnlegenLaeuft(false)
    }
  }

  function zurueckZuFehlerZeilen() {
    if (!ergebnis) return
    const fehlerIndizes = new Set(ergebnis.filter((e) => e.status === 'fehler').map((e) => e.zeileIndex))
    setZeilen((prev) => prev.filter((_, i) => fehlerIndizes.has(i)))
    setErgebnis(null)
    setPhase('review')
  }

  const fehlerCount = ergebnis?.filter((e) => e.status === 'fehler').length ?? 0

  return (
    <Drawer
      open
      onClose={onFertig}
      side="right"
      width={720}
      noPadding
      hideCloseButton
      closeOnBackdrop={!busy}
      closeOnEsc={!busy}
      ariaLabel="Fahrzeuge per ZB1 scannen"
    >
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-claimondo-border px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-claimondo-navy">Fahrzeuge per ZB1 scannen</h2>
            <p className="text-xs text-claimondo-ondo">{PHASE_SUBTITLE[phase]}</p>
          </div>
          <button
            type="button"
            onClick={onFertig}
            disabled={busy}
            aria-label="Schließen"
            className="shrink-0 rounded-ios-md p-2 text-claimondo-ondo hover:bg-claimondo-bg hover:text-claimondo-navy disabled:cursor-not-allowed disabled:opacity-40"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {phase === 'scannen' ? (
            <div className="space-y-4">
              <p className="text-sm text-claimondo-shield">
                Fotografieren Sie den Fahrzeugschein (ZB1) jedes Fahrzeugs nacheinander. Nach jedem
                Foto wird die Karte automatisch ausgelesen und in die Liste aufgenommen.
              </p>
              {scanFehler ? <p className="text-sm text-danger-strong">{scanFehler}</p> : null}
              {dedupHinweis ? <p className="text-sm text-warning-strong">{dedupHinweis}</p> : null}
              {zeilen.length === 0 ? (
                <p className="text-sm text-claimondo-shield">Noch keine Karte gescannt.</p>
              ) : (
                <SectionCard title={`Gescannte Karten (${zeilen.length})`}>
                  <ul className="divide-y divide-claimondo-border">
                    {zeilen.map((z) => {
                      const anzeige = leiteZeilenAnzeige(z)
                      return (
                        <li key={z.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <span className="min-w-0 truncate text-claimondo-navy">
                            {z.felder.kennzeichen ||
                              [z.felder.hersteller, z.felder.modell].filter(Boolean).join(' ') ||
                              'Ohne Kennzeichen'}
                          </span>
                          <Badge tone={anzeige.tone} size="sm">
                            {anzeige.label}
                          </Badge>
                        </li>
                      )
                    })}
                  </ul>
                </SectionCard>
              )}
            </div>
          ) : null}

          {phase === 'review' ? (
            <div className="space-y-4">
              {zeilen.length === 0 ? (
                <p className="text-center text-sm text-claimondo-shield">Keine Fahrzeuge in der Liste.</p>
              ) : (
                <>
                  {anlegenFehler ? <p className="text-sm text-danger-strong">{anlegenFehler}</p> : null}
                  {zeilen.map((z, i) => {
                    const anzeige = leiteZeilenAnzeige(z)
                    return (
                      <SectionCard
                        key={z.key}
                        title={z.felder.kennzeichen || `Fahrzeug ${i + 1}`}
                        subtitle={[z.felder.hersteller, z.felder.modell].filter(Boolean).join(' ') || undefined}
                        hint={
                          <Badge tone={anzeige.tone} size="sm">
                            {anzeige.label}
                          </Badge>
                        }
                        headerAction={
                          <Button
                            variant="bare"
                            size="icon"
                            ariaLabel="Zeile entfernen"
                            disabled={busy}
                            onClick={() => entferneZeile(i)}
                            iconLeft={<Trash2Icon className="h-4 w-4" />}
                          />
                        }
                        bodyClassName="space-y-3"
                      >
                        {z.halterWarnung && z.halterZb1 ? (
                          <div className="flex items-start gap-2 rounded-ios-md border border-warning/30 bg-warning-soft p-3">
                            <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" />
                            <p className="text-xs text-warning-strong">
                              Achtung: Auf der ZB1 steht ein anderer Halter „{z.halterZb1}". Bitte
                              prüfen, ob das plausibel ist (z. B. Leasing).
                            </p>
                          </div>
                        ) : null}
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          <TextField
                            label="Kennzeichen"
                            value={z.felder.kennzeichen ?? ''}
                            onChange={(e) => aktualisiereFeld(i, { kennzeichen: e.target.value || null })}
                            placeholder="z. B. K-AB 123"
                            disabled={busy}
                          />
                          <TextField
                            label="FIN"
                            value={z.felder.fin ?? ''}
                            onChange={(e) => aktualisiereFeld(i, { fin: e.target.value || null })}
                            placeholder="17-stellig"
                            disabled={busy}
                          />
                          <TextField
                            label="Hersteller"
                            value={z.felder.hersteller ?? ''}
                            onChange={(e) => aktualisiereFeld(i, { hersteller: e.target.value || null })}
                            placeholder="z. B. VW"
                            disabled={busy}
                          />
                          <TextField
                            label="Modell"
                            value={z.felder.modell ?? ''}
                            onChange={(e) => aktualisiereFeld(i, { modell: e.target.value || null })}
                            placeholder="z. B. Golf"
                            disabled={busy}
                          />
                          <TextField
                            label="HSN"
                            value={z.felder.hsn ?? ''}
                            onChange={(e) => aktualisiereFeld(i, { hsn: e.target.value || null })}
                            placeholder="4-stellig"
                            disabled={busy}
                          />
                          <TextField
                            label="TSN"
                            value={z.felder.tsn ?? ''}
                            onChange={(e) => aktualisiereFeld(i, { tsn: e.target.value || null })}
                            placeholder="3-stellig"
                            disabled={busy}
                          />
                          <TextField
                            label="Farbe"
                            value={z.felder.farbe ?? ''}
                            onChange={(e) => aktualisiereFeld(i, { farbe: e.target.value || null })}
                            placeholder="z. B. Schwarz"
                            disabled={busy}
                          />
                          <TextField
                            label="Erstzulassung"
                            value={z.felder.erstzulassung ?? ''}
                            onChange={(e) => aktualisiereFeld(i, { erstzulassung: e.target.value || null })}
                            placeholder="MM/JJJJ"
                            disabled={busy}
                          />
                          <TextField
                            label="Baujahr"
                            value={z.felder.baujahr ?? ''}
                            onChange={(e) => aktualisiereFeld(i, { baujahr: parseBaujahr(e.target.value) })}
                            placeholder="z. B. 2019"
                            inputMode="numeric"
                            disabled={busy}
                          />
                          <TextField
                            label="Fahrzeugklasse"
                            value={z.felder.fahrzeugklasse ?? ''}
                            onChange={(e) => aktualisiereFeld(i, { fahrzeugklasse: e.target.value || null })}
                            placeholder="z. B. M1"
                            disabled={busy}
                          />
                        </div>
                      </SectionCard>
                    )
                  })}
                </>
              )}
            </div>
          ) : null}

          {phase === 'ergebnis' && ergebnis ? (
            <div className="space-y-4">
              <SectionCard title="Zusammenfassung">
                <p className="text-sm text-claimondo-navy">
                  {ergebnis.filter((e) => e.status === 'angelegt').length} angelegt ·{' '}
                  {ergebnis.filter((e) => e.status === 'aktualisiert').length} aktualisiert ·{' '}
                  {ergebnis.filter((e) => e.status === 'stub').length} als Stub · {fehlerCount} Fehler
                </p>
              </SectionCard>
              <ul className="space-y-2">
                {ergebnis.map((e) => {
                  const anzeige = ERGEBNIS_ANZEIGE[e.status]
                  return (
                    <li
                      key={e.zeileIndex}
                      className="flex items-start justify-between gap-3 rounded-ios-md border border-claimondo-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-claimondo-navy">
                          {e.kennzeichen || `Fahrzeug ${e.zeileIndex + 1}`}
                        </p>
                        {e.status === 'fehler' && e.error ? (
                          <p className="text-xs text-danger-strong">{e.error}</p>
                        ) : null}
                      </div>
                      <Badge tone={anzeige.tone} size="sm">
                        {anzeige.label}
                      </Badge>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-claimondo-border px-6 py-4">
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onDateiAusgewaehlt}
            className="hidden"
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            onChange={onDateiAusgewaehlt}
            className="hidden"
          />

          {phase === 'scannen' ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2">
                <Button
                  variant="ondo"
                  iconLeft={<CameraIcon className="h-4 w-4" />}
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={scanning}
                  loading={scanning}
                >
                  Weitere Karte scannen
                </Button>
                <Button
                  variant="ghost"
                  iconLeft={<ImageIcon className="h-4 w-4" />}
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={scanning}
                >
                  Aus Galerie wählen
                </Button>
              </div>
              {zeilen.length > 0 ? (
                <Button variant="navy" onClick={() => setPhase('review')}>
                  Zum Review ({zeilen.length})
                </Button>
              ) : null}
            </div>
          ) : null}

          {phase === 'review' ? (
            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" onClick={() => setPhase('scannen')} disabled={busy}>
                Weitere Karte scannen
              </Button>
              <Button
                variant="navy"
                onClick={handleAlleAnlegen}
                disabled={zeilen.length === 0 || busy}
                loading={anlegenLaeuft}
              >
                Alle anlegen
              </Button>
            </div>
          ) : null}

          {phase === 'ergebnis' ? (
            <div className="flex items-center justify-between gap-3">
              {fehlerCount > 0 ? (
                <Button variant="ghost" onClick={zurueckZuFehlerZeilen}>
                  Fehlgeschlagene Zeilen erneut bearbeiten
                </Button>
              ) : (
                <span />
              )}
              <Button variant="navy" onClick={onFertig}>
                Fertig
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </Drawer>
  )
}
