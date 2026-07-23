'use client'

// Firmen-Flotte Layer 2 Slice 2b Task B — Foto+Unterschrift-Steps
// Slice 2a built steps 1-4 (Kontakt / Fahrzeug+Haftpflicht / Unfallhergang / Bestaetigung).
// Slice 2b inserts two steps BEFORE Bestaetigung:
//   Step 4 — Fotos (gegner_fahrzeug / eigenes_fahrzeug / unfallort)
//   Step 5 — Unterschrift (SignaturePadInput)
//   Step 6 — Bestaetigung & Absenden
// compressImage is extracted into src/lib/dokumente/compress-image.ts.

import { useRef, useState } from 'react'
import { CameraIcon, CheckIcon, ImageIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { TextField } from '@/components/shared/forms/TextField'
import { VersichererSelect } from '@/components/shared/VersichererSelect'
import SignaturePadInput from '@/components/SignaturePadInput'
import { compressImage } from '@/lib/dokumente/compress-image'
import { VoiceDictation } from '@/components/onboarding/fields/VoiceDictation'
import { appendTranscript } from '@/components/onboarding/fields/append-transcript'
import { submitSchadenGegner } from './actions'
import type { GegnerFoto, GegnerFormData } from './gegner-form-types'

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  token: string
  context: {
    kennzeichen: string | null
    hersteller: string | null
    modell: string | null
    firmaName: string | null
  }
  versicherer: Array<{ id: string; name: string }>
}

type Step = 1 | 2 | 3 | 4 | 5 | 6

const TOTAL_STEPS = 6

const STEP_LABELS: Record<Step, string> = {
  1: 'Kontaktdaten',
  2: 'Fahrzeug & Haftpflicht',
  3: 'Unfallhergang',
  4: 'Fotos',
  5: 'Unterschrift',
  6: 'Bestätigung',
}

// ─── Photo-picker state ──────────────────────────────────────────────────────

type FotoTyp = GegnerFoto['typ']

type FotoState = {
  base64: string
  contentType: string
  previewUrl: string
}

// ─── Wizard ──────────────────────────────────────────────────────────────────

// FU2: Unfallort (Schadenlocation) per Browser-Geolocation erfassen — der Gegner ist am
// Unfallort. Best-effort: verweigert / nicht verfügbar / Timeout -> null (kein Fehler, der
// Submit läuft trotzdem). Getrennt vom Fahrzeug-Standort (Aaron 22.07.).
function erfasseUnfallort(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 60_000, enableHighAccuracy: false },
    )
  })
}

export function SchadenGegnerWizard({ token, context, versicherer }: Props) {
  const [step, setStep] = useState<Step>(1)
  const [submitted, setSubmitted] = useState(false)

  const [data, setData] = useState<GegnerFormData>({
    name: '',
    telefon: '',
    email: '',
    kennzeichen: '',
    fahrzeugtyp: '',
    versicherungId: undefined,
    versicherungsnummer: '',
    schadennummer: '',
    hergang: '',
    consent: false,
    fotos: [],
    unterschrift: undefined,
  })

  // Photo state — keyed by GegnerFoto.typ
  const [fotos, setFotos] = useState<Partial<Record<FotoTyp, FotoState[]>>>({})
  const [fotoErrors, setFotoErrors] = useState<Partial<Record<FotoTyp, string>>>({})
  const [fotoLoading, setFotoLoading] = useState<Partial<Record<FotoTyp, boolean>>>({})

  // Unterschrift state
  const [unterschrift, setUnterschrift] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function set<K extends keyof GegnerFormData>(key: K, value: GegnerFormData[K]) {
    setData((prev) => ({ ...prev, [key]: value }))
  }

  async function handleFotoChange(typ: FotoTyp, file: File) {
    setFotoErrors((prev) => ({ ...prev, [typ]: undefined }))
    setFotoLoading((prev) => ({ ...prev, [typ]: true }))
    try {
      const { base64, contentType } = await compressImage(file)
      const neu: FotoState = {
        base64,
        contentType,
        previewUrl: `data:${contentType};base64,${base64}`,
      }
      // Mehrere Fotos je Kategorie: an das bestehende Array anhaengen statt ersetzen.
      setFotos((prev) => ({ ...prev, [typ]: [...(prev[typ] ?? []), neu] }))
    } catch (err) {
      setFotoErrors((prev) => ({
        ...prev,
        [typ]: err instanceof Error ? err.message : 'Foto konnte nicht verarbeitet werden',
      }))
    } finally {
      setFotoLoading((prev) => ({ ...prev, [typ]: false }))
    }
  }

  function removeFoto(typ: FotoTyp, index: number) {
    setFotos((prev) => {
      const arr = (prev[typ] ?? []).filter((_, i) => i !== index)
      const next = { ...prev }
      if (arr.length) next[typ] = arr
      else delete next[typ]
      return next
    })
  }

  async function handleSubmit() {
    // Assemble fotos array from state
    const fotoArray: GegnerFoto[] = (
      Object.entries(fotos) as [FotoTyp, FotoState[]][]
    ).flatMap(([typ, states]) =>
      states.map((state) => ({ typ, base64: state.base64, contentType: state.contentType })),
    )

    setSubmitting(true)
    setSubmitError(null)

    // FU2: Unfallort (Schadenlocation) best-effort erfassen — blockt den Submit nicht.
    const unfallort = await erfasseUnfallort()

    const submitData: GegnerFormData = {
      ...data,
      fotos: fotoArray.length > 0 ? fotoArray : undefined,
      unterschrift: unterschrift ?? undefined,
      unfallortLat: unfallort?.lat,
      unfallortLng: unfallort?.lng,
    }

    const result = await submitSchadenGegner(token, submitData)
    setSubmitting(false)
    if (!result.ok) {
      setSubmitError(result.error)
      return
    }
    setSubmitted(true)
  }

  const contextLine = [context.firmaName, context.kennzeichen].filter(Boolean).join(' · ')
  const fahrzeugLabel = [context.hersteller, context.modell].filter(Boolean).join(' ')

  // ─── Success Screen ───────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <SectionCard>
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="w-14 h-14 rounded-full bg-success-soft flex items-center justify-center">
                <CheckIcon className="w-7 h-7 text-success-strong" />
              </div>
              <h1 className="text-heading-md text-claimondo-navy">
                Vielen Dank — Ihre Angaben wurden übermittelt.
              </h1>
              {data.telefon?.trim() ? (
                <p className="text-body-sm text-claimondo-ondo">
                  Wir haben Ihnen eine SMS geschickt. Bitte tippen Sie den Link darin an und
                  bestätigen Sie Ihre Angaben — erst dann melden wir den Schaden Ihrer
                  Haftpflichtversicherung.
                </p>
              ) : (
                <p className="text-body-sm text-claimondo-ondo">
                  Der Schaden wird bearbeitet. Sie erhalten bei Bedarf Rückmeldung.
                </p>
              )}
              <p className="text-body-xs text-claimondo-ondo/80">
                Hinweis: Sie sind unabhängig davon verpflichtet, den Schaden auch selbst Ihrer
                Haftpflichtversicherung zu melden.
              </p>
            </div>
          </SectionCard>
        </div>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-claimondo-bg flex flex-col">
      {/* Sticky Step-Progress */}
      <div className="sticky top-0 z-20 border-b border-claimondo-navy/[0.06] bg-white/[0.78] backdrop-blur-[22px] backdrop-saturate-150">
        <div className="h-1 w-full bg-claimondo-navy/[0.06]">
          <div
            className="h-full bg-gradient-to-r from-claimondo-navy to-claimondo-ondo transition-all duration-500 ease-[cubic-bezier(.16,1,.3,1)]"
            style={{ width: `${Math.round((step / TOTAL_STEPS) * 100)}%` }}
          />
        </div>
        <div className="mx-auto flex max-w-md items-center justify-center gap-2 px-5 py-3">
          {([1, 2, 3, 4, 5, 6] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                style={
                  s === step
                    ? {
                        boxShadow:
                          '0 0 0 5px color-mix(in srgb, var(--brand-secondary, #4573A2) 16%, transparent)',
                      }
                    : undefined
                }
                className={`grid h-7 w-7 place-items-center rounded-full border-2 text-[10px] font-semibold tracking-[-.01em] transition-all duration-300 ease-[cubic-bezier(.32,.72,0,1)] ${
                  s < step
                    ? 'bg-claimondo-navy border-claimondo-navy text-white scale-[1.04]'
                    : s === step
                      ? 'bg-claimondo-ondo border-claimondo-ondo text-white scale-[1.06]'
                      : 'bg-white border-claimondo-navy/[0.10] text-claimondo-ondo/60'
                }`}
              >
                {s < step ? <CheckIcon className="w-3 h-3" /> : s}
              </div>
              {i < TOTAL_STEPS - 1 && (
                <div
                  className={`h-0.5 w-4 rounded-full transition-colors ${
                    s < step ? 'bg-claimondo-ondo' : 'bg-claimondo-navy/[0.06]'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-4 sm:px-5 pt-5 pb-32 max-w-md mx-auto w-full">
        {/* Header — always visible */}
        <div className="mb-5">
          <p className="text-caption text-claimondo-ondo mb-1">
            Schritt {step} von {TOTAL_STEPS} — {STEP_LABELS[step]}
          </p>
          <h1 className="text-heading-lg text-claimondo-navy">Unfallschaden melden</h1>
          {contextLine ? (
            <p className="text-body-sm text-claimondo-ondo mt-1">
              Unfallgegner: {contextLine}
            </p>
          ) : null}
          {fahrzeugLabel ? (
            <p className="text-caption text-claimondo-shield mt-0.5">{fahrzeugLabel}</p>
          ) : null}
        </div>

        <SectionCard className="flex-1">
          {/* ═══ Schritt 1 — Ihre Kontaktdaten ═══ */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <TextField
                label="Name *"
                value={data.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Vor- und Nachname"
                required
                autoComplete="name"
              />
              <TextField
                label="Telefonnummer"
                value={data.telefon ?? ''}
                onChange={(e) => set('telefon', e.target.value)}
                placeholder="+49 …"
                type="tel"
                autoComplete="tel"
              />
              <TextField
                label="E-Mail-Adresse"
                value={data.email ?? ''}
                onChange={(e) => set('email', e.target.value)}
                placeholder="name@beispiel.de"
                type="email"
                autoComplete="email"
              />
            </div>
          )}

          {/* ═══ Schritt 2 — Fahrzeug & Haftpflicht ═══ */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <TextField
                label="Kennzeichen"
                value={data.kennzeichen ?? ''}
                onChange={(e) => set('kennzeichen', e.target.value)}
                placeholder="z. B. B-AB 1234"
                autoComplete="off"
              />
              <TextField
                label="Fahrzeugtyp"
                value={data.fahrzeugtyp ?? ''}
                onChange={(e) => set('fahrzeugtyp', e.target.value)}
                placeholder="z. B. PKW, LKW, Motorrad"
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-claimondo-shield">
                  Haftpflichtversicherung
                </label>
                <VersichererSelect
                  value={data.versicherungId ?? null}
                  onChange={(id) => set('versicherungId', id ?? undefined)}
                  versicherer={versicherer}
                  placeholder="Versicherung auswählen …"
                />
              </div>
              {/* Versicherungsnummer VOR Schadennummer: erst die Police, dann ein evtl.
                  schon laufender Vorgang. Beide optional — am Unfallort kennt kaum jemand
                  seine Policennummer auswendig, deshalb der Fundort-Hinweis statt Pflicht. */}
              <TextField
                label="Versicherungsnummer (optional)"
                value={data.versicherungsnummer ?? ''}
                onChange={(e) => set('versicherungsnummer', e.target.value)}
                placeholder="z. B. AH-1234567890"
                hint="Steht auf Ihrer Versicherungskarte oder im Versicherungsschein. Damit kann Ihre Versicherung den Vorgang sofort Ihrer Police zuordnen."
              />
              <TextField
                label="Schadennummer (optional)"
                value={data.schadennummer ?? ''}
                onChange={(e) => set('schadennummer', e.target.value)}
                placeholder="Ihre Schadennummer bei der Versicherung"
                hint="Nur falls Ihre Versicherung den Unfall bereits kennt und Ihnen eine Schadennummer genannt hat."
              />
            </div>
          )}

          {/* ═══ Schritt 3 — Unfallhergang ═══ */}
          {step === 3 && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-claimondo-shield">
                Unfallhergang
              </label>
              {/* Whisper-Sprachdiktat (wiederverwendete VoiceDictation, Quelle 'schaden' =
                  token-authed /api/schaden/voice-transcribe): einsprechen -> Groq-Transkript
                  wird an den bestehenden Text angehaengt (appendTranscript, nie ueberschrieben). */}
              <VoiceDictation
                source={{ kind: 'schaden', token }}
                onFinalTranscript={(text) =>
                  set('hergang', appendTranscript(data.hergang ?? '', text))
                }
              />
              {/* Plain <textarea> — no shared Textarea component exists;
                  styled identically to TextField's INPUT_CLS pattern (token-bound). */}
              <textarea
                value={data.hergang ?? ''}
                onChange={(e) => set('hergang', e.target.value)}
                placeholder="Beschreiben Sie kurz den Unfallhergang: Wo, wann und wie ist es passiert? — oder oben einsprechen."
                rows={6}
                className="w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy placeholder:text-claimondo-shield/60 focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/30 resize-y"
              />
              <p className="text-caption text-claimondo-shield">
                Geben Sie so viele Details wie möglich an — das erleichtert die Bearbeitung.
              </p>
            </div>
          )}

          {/* ═══ Schritt 4 — Fotos ═══ */}
          {step === 4 && (
            <div className="flex flex-col gap-5">
              <div className="rounded-ios-sm border border-info/30 bg-info-soft px-4 py-3 text-body-sm text-info-strong">
                Bitte nur Fahrzeugschäden fotografieren — keine Personen.
              </div>

              <FotoPicker
                label="Schaden am Fahrzeug des Unfallgegners"
                required
                states={fotos['gegner_fahrzeug'] ?? []}
                loading={!!fotoLoading['gegner_fahrzeug']}
                error={fotoErrors['gegner_fahrzeug']}
                onFile={(file) => handleFotoChange('gegner_fahrzeug', file)}
                onRemove={(i) => removeFoto('gegner_fahrzeug', i)}
              />

              <FotoPicker
                label="Schaden an Ihrem Fahrzeug"
                states={fotos['eigenes_fahrzeug'] ?? []}
                loading={!!fotoLoading['eigenes_fahrzeug']}
                error={fotoErrors['eigenes_fahrzeug']}
                onFile={(file) => handleFotoChange('eigenes_fahrzeug', file)}
                onRemove={(i) => removeFoto('eigenes_fahrzeug', i)}
              />

              <FotoPicker
                label="Unfallort (optional)"
                states={fotos['unfallort'] ?? []}
                loading={!!fotoLoading['unfallort']}
                error={fotoErrors['unfallort']}
                onFile={(file) => handleFotoChange('unfallort', file)}
                onRemove={(i) => removeFoto('unfallort', i)}
              />
            </div>
          )}

          {/* ═══ Schritt 5 — Unterschrift ═══ */}
          {step === 5 && (
            <div className="flex flex-col gap-4">
              <p className="text-body-sm text-claimondo-ondo leading-relaxed">
                Mit Ihrer Unterschrift bestätigen Sie die Richtigkeit Ihrer Angaben.
              </p>
              <SignaturePadInput
                value={unterschrift}
                onChange={setUnterschrift}
                placeholder="Hier unterschreiben"
              />
              <p className="text-caption text-claimondo-shield">
                Die Unterschrift ist optional — Sie können diesen Schritt überspringen.
              </p>
            </div>
          )}

          {/* ═══ Schritt 6 — Bestätigung & Absenden ═══ */}
          {step === 6 && (
            <div className="flex flex-col gap-5">
              {/* Summary */}
              <div className="flex flex-col gap-2">
                <h2 className="text-heading-sm text-claimondo-navy mb-1">Zusammenfassung</h2>
                <SummaryRow label="Name" value={data.name || '—'} />
                {data.telefon ? <SummaryRow label="Telefon" value={data.telefon} /> : null}
                {data.email ? <SummaryRow label="E-Mail" value={data.email} /> : null}
                {data.kennzeichen ? (
                  <SummaryRow label="Kennzeichen" value={data.kennzeichen} />
                ) : null}
                {data.fahrzeugtyp ? (
                  <SummaryRow label="Fahrzeugtyp" value={data.fahrzeugtyp} />
                ) : null}
                {data.versicherungId ? (
                  <SummaryRow
                    label="Haftpflichtversicherung"
                    value={
                      versicherer.find((v) => v.id === data.versicherungId)?.name ??
                      data.versicherungId
                    }
                  />
                ) : null}
                {data.versicherungsnummer ? (
                  <SummaryRow label="Versicherungsnummer" value={data.versicherungsnummer} />
                ) : null}
                {data.schadennummer ? (
                  <SummaryRow label="Schadennummer" value={data.schadennummer} />
                ) : null}
                {data.hergang ? (
                  <SummaryRow label="Unfallhergang" value={data.hergang} />
                ) : null}
                {/* Photo summary */}
                {(() => {
                  const anzahl = Object.values(fotos).reduce((n, a) => n + (a?.length ?? 0), 0)
                  return anzahl > 0 ? (
                    <SummaryRow label="Fotos" value={`${anzahl} Foto(s) beigefügt`} />
                  ) : null
                })()}
                {unterschrift ? <SummaryRow label="Unterschrift" value="Vorhanden" /> : null}
              </div>

              {/* Pflicht-Hinweis */}
              <div className="rounded-ios-sm border border-warning/30 bg-warning-soft px-4 py-3 text-body-sm text-warning-strong">
                Der Schaden wird der Haftpflichtversicherung des Unfallverursachers gemeldet.
                Sie sind verpflichtet, den Schaden auch selbst Ihrer Haftpflichtversicherung
                zu melden.
              </div>

              {/* Consent */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.consent}
                  onChange={(e) => set('consent', e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded border-claimondo-border accent-claimondo-ondo shrink-0"
                />
                <span className="text-body-sm text-claimondo-ondo leading-relaxed">
                  Ich stimme der Verarbeitung meiner Daten zur Unfallregulierung zu.{' '}
                  <span className="text-danger">*</span>
                </span>
              </label>

              {/* Submit error */}
              {submitError ? (
                <p className="rounded-ios-sm border border-danger/30 bg-danger-soft px-4 py-3 text-body-sm text-danger-strong">
                  {submitError}
                </p>
              ) : null}

              {/* Submit */}
              <Button
                variant="ondo"
                fullWidth
                loading={submitting}
                disabled={!data.consent || submitting}
                onClick={handleSubmit}
              >
                Schaden absenden
              </Button>
            </div>
          )}
        </SectionCard>

        {/* Navigation */}
        <div className="pt-4 flex gap-3">
          {step > 1 ? (
            <Button
              variant="ghost"
              onClick={() => setStep((s) => (s - 1) as Step)}
              disabled={submitting}
            >
              Zurück
            </Button>
          ) : null}

          {step < TOTAL_STEPS ? (
            <Button
              variant="ondo"
              fullWidth
              disabled={step === 1 && !data.name.trim()}
              onClick={() => setStep((s) => (s + 1) as Step)}
            >
              Weiter
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ─── FotoPicker ───────────────────────────────────────────────────────────────

function FotoPicker({
  label,
  required = false,
  states,
  loading,
  error,
  onFile,
  onRemove,
}: {
  label: string
  required?: boolean
  states: FotoState[]
  loading: boolean
  error: string | undefined
  onFile: (file: File) => void
  onRemove: (index: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold text-claimondo-shield">
        {label}
        {required && <span className="text-danger ml-1">*</span>}
        {!required && (
          <span className="ml-1 text-claimondo-ondo/60 font-normal">(optional)</span>
        )}
      </label>

      {/* Hidden file input — capture=environment opens camera on mobile */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label={`Foto auswählen: ${label}`}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          // Reset, damit direkt das naechste Foto gewaehlt werden kann (mehrere je Kategorie)
          e.target.value = ''
        }}
      />

      {/* Bereits erfasste Fotos dieser Kategorie — Kachel-Grid, je Kachel entfernbar */}
      {states.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {states.map((s, i) => (
            <div
              key={i}
              className="relative aspect-square rounded-ios-md overflow-hidden border border-claimondo-border bg-claimondo-bg"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.previewUrl}
                alt={`Vorschau ${i + 1}: ${label}`}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label="Foto entfernen"
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-claimondo-navy/80 flex items-center justify-center"
              >
                <XIcon className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-ios-md border border-claimondo-border bg-claimondo-bg px-4 py-4 text-body-sm text-claimondo-ondo">
          <div className="w-4 h-4 border-2 border-claimondo-ondo border-t-transparent rounded-full animate-spin" />
          Foto wird verarbeitet …
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center gap-1.5 rounded-ios-md border-2 border-dashed border-claimondo-navy/20 bg-claimondo-bg px-4 py-4 text-body-sm text-claimondo-ondo hover:border-claimondo-ondo hover:bg-white transition-colors"
        >
          <div className="flex gap-3 text-claimondo-ondo/60">
            <CameraIcon className="w-5 h-5" />
            <ImageIcon className="w-5 h-5" />
          </div>
          <span className="font-semibold text-claimondo-navy">
            {states.length > 0 ? 'Weiteres Foto hinzufügen' : 'Foto aufnehmen oder auswählen'}
          </span>
          <span className="text-caption text-claimondo-shield">Kamera oder Galerie · mehrere möglich</span>
        </button>
      )}

      {error ? (
        <p className="text-caption text-danger-strong">{error}</p>
      ) : null}
    </div>
  )
}

// ─── Shared UI ───────────────────────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 rounded-ios-sm bg-claimondo-navy/[0.03] border border-claimondo-navy/[0.06]">
      <span className="text-caption font-semibold uppercase tracking-[0.12em] text-claimondo-ondo">
        {label}
      </span>
      <span className="text-body-sm text-claimondo-navy break-words">{value}</span>
    </div>
  )
}
