'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Camera, Upload, FileText, Loader2, CheckCircle2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/primitives'
import { useFlowStore } from '@/lib/flow/flow-store'
import { updateLeadZb1Manual } from '@/lib/actions/update-lead-zb1-manual'
import { zb1Schema, type Zb1FormValues } from '@/lib/flow/schemas/schritt3'

// AAR-475 C9: ZB1-Scan-Flow. Drei Modi:
// 1. Mobile Camera (default wenn Touch-Device erkannt)
// 2. Desktop File-Upload
// 3. Manuelles Fallback-Formular
// OCR wird via /api/ocr/zb1-scan aufgerufen (shared Vision-Parser).

type UiMode = 'idle' | 'uploading' | 'preview' | 'manual'

type OcrExtracted = {
  hsn: string | null
  tsn: string | null
  fin_vin: string | null
  kennzeichen: string | null
  erstzulassung: string | null
  fahrzeug_baujahr: number | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  // Halter-Felder (werden bei ist_fahrzeughalter=false aus OCR angezeigt)
  halter_vorname: string | null
  halter_nachname: string | null
  halter_strasse: string | null
  halter_plz: string | null
  halter_stadt: string | null
}

type OcrResponse = {
  success: boolean
  extracted?: OcrExtracted | null
  confidence?: number
  lowConfidence?: boolean
  error?: string
}

export function Schritt3Client({ leadId, istFahrzeughalter }: { leadId: string; istFahrzeughalter: boolean }) {
  const router = useRouter()
  const markZb1Erfasst = useFlowStore((s) => s.markZb1Erfasst)
  const setCurrentStep = useFlowStore((s) => s.setCurrentStep)

  const [uiMode, setUiMode] = useState<UiMode>('idle')
  const [confidence, setConfidence] = useState<number | null>(null)
  const [ocrHalter, setOcrHalter] = useState<{
    vorname: string; nachname: string; strasse: string; plz: string; stadt: string
  }>({ vorname: '', nachname: '', strasse: '', plz: '', stadt: '' })
  const [pending, startTransition] = useTransition()
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Zb1FormValues>({
    resolver: zodResolver(zb1Schema),
    mode: 'onBlur',
    defaultValues: {
      hsn: '',
      tsn: '',
      fin: '',
      erstzulassung: '',
      kennzeichen: '',
    },
  })

  const handleFile = async (file: File) => {
    if (file.type === 'image/heic' || file.type === 'image/heif') {
      toast.error('HEIC wird nicht unterstützt. Bitte als JPG oder PNG hochladen.')
      return
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Bitte ein Bild hochladen (JPG, PNG, WEBP)')
      return
    }

    setUiMode('uploading')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('leadId', leadId)

    try {
      const res = await fetch('/api/ocr/zb1-scan', { method: 'POST', body: formData })
      const json = (await res.json()) as OcrResponse
      if (!json.success) {
        toast.error(json.error ?? 'OCR fehlgeschlagen')
        setUiMode('idle')
        return
      }

      setConfidence(json.confidence ?? 0)

      if (json.extracted) {
        reset({
          hsn: json.extracted.hsn ?? '',
          tsn: json.extracted.tsn ?? '',
          fin: json.extracted.fin_vin ?? '',
          erstzulassung: json.extracted.erstzulassung ?? '',
          kennzeichen: json.extracted.kennzeichen ?? '',
        })
        // Halter-Felder aus OCR vorausfüllen (bei ist_fahrzeughalter=false)
        if (!istFahrzeughalter) {
          setOcrHalter({
            vorname: json.extracted.halter_vorname ?? '',
            nachname: json.extracted.halter_nachname ?? '',
            strasse: json.extracted.halter_strasse ?? '',
            plz: json.extracted.halter_plz ?? '',
            stadt: json.extracted.halter_stadt ?? '',
          })
        }
      }

      if (json.lowConfidence) {
        toast.warning(
          'Einige Felder wurden nicht sicher erkannt — bitte prüfen und ergänzen.',
        )
      } else {
        toast.success('Fahrzeugschein erfolgreich ausgelesen.')
      }
      setUiMode('preview')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
      setUiMode('idle')
    }
  }

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const halterPayload = !istFahrzeughalter ? ocrHalter : undefined
      const result = await updateLeadZb1Manual(leadId, values, uiMode === 'manual', halterPayload)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      markZb1Erfasst()
      setCurrentStep(4)
      router.push('/schaden-melden/schritt-4')
    })
  })

  if (uiMode === 'uploading') {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-claimondo-border bg-white shadow-claimondo-md p-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-claimondo-ondo" />
        <div>
          <p className="font-semibold text-claimondo-navy">Wir lesen Ihren Fahrzeugschein aus …</p>
          <p className="mt-1 text-sm text-claimondo-ondo">Das dauert normalerweise 5–10 Sekunden.</p>
        </div>
      </div>
    )
  }

  if (uiMode === 'idle') {
    return (
      <div className="space-y-6">
        <div className="rounded-3xl border border-claimondo-border bg-white shadow-claimondo-md p-6">
          <h2 className="mb-2 text-lg font-semibold text-claimondo-navy">
            Fahrzeugschein scannen
          </h2>
          <p className="mb-4 text-sm text-claimondo-ondo">
            Wir brauchen nur die Vorderseite (ZB1). Felder{' '}
            <strong>A</strong> (Kennzeichen), <strong>B</strong> (Erstzulassung),{' '}
            <strong>E</strong> (FIN) und <strong>2.1/2.2</strong> (HSN/TSN) müssen
            gut lesbar sein.
            {!istFahrzeughalter && (
              <span className="mt-1 block text-claimondo-navy font-medium">
                Wir lesen außerdem die Halterdaten (Felder C.1–C.4) aus — bitte auch diesen Bereich des Scheins abbilden.
              </span>
            )}
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Button
              type="button"
              tone="ondo"
              onPress={() => cameraInputRef.current?.click()}
              iconLeft={<Camera className="h-4 w-4" />}
            >
              Mit Kamera scannen
            </Button>

            <input
              ref={uploadInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Button
              type="button"
              tone="ghost"
              onPress={() => uploadInputRef.current?.click()}
              iconLeft={<Upload className="h-4 w-4" />}
            >
              Datei hochladen
            </Button>
          </div>
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={() => setUiMode('manual')}
            className="text-sm text-claimondo-ondo underline hover:text-claimondo-shield"
          >
            Ich habe keinen Fahrzeugschein zur Hand — manuell eingeben
          </button>
        </div>
      </div>
    )
  }

  // preview oder manual — in beiden Fällen dasselbe Form
  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {uiMode === 'preview' ? (
        <div className="flex gap-3 rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            Fahrzeugschein ausgelesen{' '}
            {confidence !== null ? `(Erkennungsrate ${Math.round(confidence * 100)}%)` : ''}{' '}
            — bitte prüfen und ggf. korrigieren.
          </p>
        </div>
      ) : (
        <div className="flex gap-3 rounded-lg border border-claimondo-border bg-claimondo-bg p-4 text-sm text-claimondo-navy">
          <FileText className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            Daten aus dem Fahrzeugschein (ZB1). Die Angaben finden Sie auf der
            Vorderseite unter den Feldern A, B, E, 2.1 und 2.2.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="hsn">HSN (Feld 2.1, 4 Ziffern)</Label>
          <Input
            id="hsn"
            inputMode="numeric"
            maxLength={4}
            {...register('hsn')}
            placeholder="0603"
            aria-invalid={!!errors.hsn}
          />
          {errors.hsn ? (
            <p className="mt-1 text-xs text-red-600">{errors.hsn.message}</p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="tsn">TSN (Feld 2.2, 3 Zeichen)</Label>
          <Input
            id="tsn"
            maxLength={3}
            {...register('tsn')}
            placeholder="BNC"
            aria-invalid={!!errors.tsn}
          />
          {errors.tsn ? (
            <p className="mt-1 text-xs text-red-600">{errors.tsn.message}</p>
          ) : null}
        </div>
      </div>

      <div>
        <Label htmlFor="fin">FIN / Fahrgestellnummer (Feld E, 17 Zeichen)</Label>
        <Input
          id="fin"
          maxLength={17}
          {...register('fin')}
          placeholder="WVWZZZ1KZAW123456"
          aria-invalid={!!errors.fin}
          className="font-mono tracking-wide"
        />
        {errors.fin ? (
          <p className="mt-1 text-xs text-red-600">{errors.fin.message}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="erstzulassung">Erstzulassung (Feld B)</Label>
          <Input
            id="erstzulassung"
            {...register('erstzulassung')}
            placeholder="15.03.2020"
            aria-invalid={!!errors.erstzulassung}
          />
          {errors.erstzulassung ? (
            <p className="mt-1 text-xs text-red-600">{errors.erstzulassung.message}</p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="kennzeichen">Kennzeichen (Feld A, optional)</Label>
          <Input
            id="kennzeichen"
            {...register('kennzeichen')}
            placeholder="B-AB 1234"
          />
        </div>
      </div>

      {/* Halter-Daten — nur wenn Fahrer ≠ Fahrzeughalter */}
      {!istFahrzeughalter && (
        <div className="rounded-xl border border-claimondo-border bg-claimondo-bg p-4 space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-claimondo-ondo" />
            <p className="text-sm font-semibold text-claimondo-navy">
              Halterdaten (aus Fahrzeugschein)
            </p>
          </div>
          {(uiMode === 'preview' && (ocrHalter.vorname || ocrHalter.nachname)) ? (
            <p className="text-xs text-green-700 bg-green-50 rounded px-3 py-2 border border-green-200">
              Halterdaten erfolgreich aus Fahrzeugschein ausgelesen — bitte prüfen.
            </p>
          ) : (
            <p className="text-xs text-claimondo-ondo">
              Bitte Halterdaten manuell eingeben (aus Fahrzeugschein Feld C.1–C.4).
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="halter_vorname">Vorname Halter</Label>
              <input
                id="halter_vorname"
                type="text"
                value={ocrHalter.vorname}
                onChange={(e) => setOcrHalter((p) => ({ ...p, vorname: e.target.value }))}
                className="mt-1 w-full rounded-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-navy"
              />
            </div>
            <div>
              <Label htmlFor="halter_nachname">Nachname Halter</Label>
              <input
                id="halter_nachname"
                type="text"
                value={ocrHalter.nachname}
                onChange={(e) => setOcrHalter((p) => ({ ...p, nachname: e.target.value }))}
                className="mt-1 w-full rounded-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-navy"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="halter_strasse">Straße + Hausnr.</Label>
            <input
              id="halter_strasse"
              type="text"
              value={ocrHalter.strasse}
              onChange={(e) => setOcrHalter((p) => ({ ...p, strasse: e.target.value }))}
              className="mt-1 w-full rounded-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-navy"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="halter_plz">PLZ</Label>
              <input
                id="halter_plz"
                type="text"
                maxLength={5}
                value={ocrHalter.plz}
                onChange={(e) => setOcrHalter((p) => ({ ...p, plz: e.target.value }))}
                className="mt-1 w-full rounded-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-navy"
              />
            </div>
            <div>
              <Label htmlFor="halter_stadt">Ort</Label>
              <input
                id="halter_stadt"
                type="text"
                value={ocrHalter.stadt}
                onChange={(e) => setOcrHalter((p) => ({ ...p, stadt: e.target.value }))}
                className="mt-1 w-full rounded-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-navy"
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => {
            setUiMode('idle')
            setConfidence(null)
            reset()
          }}
          className="text-sm text-claimondo-ondo underline hover:text-claimondo-shield"
        >
          Anderes Bild hochladen
        </button>

        <Button
          type="submit"
          tone="ondo"
          disabled={pending}
        >
          {pending ? 'Wird gespeichert …' : 'Weiter zum Account'}
        </Button>
      </div>
    </form>
  )
}
