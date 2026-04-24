'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  SCHADENTYP_VALUES,
  SCHULDFRAGE_VALUES,
  FAHRZEUG_HERSTELLER_VALUES,
  schritt1Schema,
  type Schritt1Input,
} from '@/lib/flow/schemas/schritt1'
import { createLeadFromSchritt1 } from '@/lib/actions/create-lead'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'
import { useFlowStore } from '@/lib/flow/flow-store'
import type { VoiceExtraction } from '@/lib/flow/schemas/voice-extraction'

// AAR-470 C4: wird von /schritt-1/voice befüllt, bevor per ?prefilled=1
// hierher zurückgeleitet wird.
const VOICE_PREFILL_KEY = 'claimondo-voice-prefill'

type VoicePrefillPayload = VoiceExtraction & { transcript: string }

// Mapping Voice-Extraktion → schritt1-Form:
// Schuldfrage kennt im Voice-Schema zusätzlich "geteilt"/"selbst" — die lassen
// wir bewusst weg (User entscheidet nachträglich manuell). Schadentyp kennt
// Voice zusätzlich "spurwechsel"/"wildunfall" → in "sonstiges" einsortieren.
function mapVoiceToForm(
  payload: VoicePrefillPayload,
): Partial<Schritt1Input> {
  const schadentyp: Schritt1Input['schadentyp'] | undefined = (() => {
    switch (payload.schadentyp) {
      case 'auffahrunfall':
      case 'kreuzung':
      case 'parkschaden':
        return payload.schadentyp
      case 'spurwechsel':
      case 'wildunfall':
      case 'sonstiges':
        return 'sonstiges'
      default:
        return undefined
    }
  })()
  const schuldfrage: Schritt1Input['schuldfrage'] | undefined = (() => {
    switch (payload.schuldfrage) {
      case 'gegner':
        return 'gegner'
      case 'selbst':
        return 'eigenverantwortung'
      case 'geteilt':
      case 'unklar':
        return 'unklar'
      default:
        return undefined
    }
  })()

  let unfalldatum: string | undefined
  if (payload.unfall_datum && !Number.isNaN(Date.parse(payload.unfall_datum))) {
    const d = new Date(payload.unfall_datum)
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    unfalldatum = d.toISOString().slice(0, 16)
  }

  return {
    unfalldatum,
    unfallort: payload.unfall_ort ?? undefined,
    schadentyp,
    schadens_hergang: payload.schadens_hergang || payload.transcript,
    polizei_vor_ort: payload.polizei_vor_ort ?? undefined,
    polizei_aktenzeichen: payload.polizei_aktenzeichen ?? undefined,
    schuldfrage,
  }
}

// AAR-468 C2: Schritt 1 Tippen-Modus. React-Hook-Form + Zod-Resolver +
// Server-Action. Voice-Toggle leitet auf /schritt-1/voice (AAR-470 C4).
// Bei schuldfrage='eigenverantwortung' landet Lead als disqualifiziert,
// Redirect auf /selbstverschulden (AAR-469 C3 Screen).

const TODAY_LOCAL_DATETIME = (() => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
})()

export function Schritt1Client() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const setLeadId = useFlowStore((s) => s.setLeadId)
  const setSchadenhergang = useFlowStore((s) => s.setSchadenhergang)
  const [isPending, startTransition] = useTransition()
  const [serverError, setServerError] = useState<string | null>(null)
  const [voiceBanner, setVoiceBanner] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    formState: { errors, isValid },
  } = useForm<Schritt1Input>({
    resolver: zodResolver(schritt1Schema),
    mode: 'onBlur',
    defaultValues: {
      unfalldatum: TODAY_LOCAL_DATETIME,
      unfallort: '',
      schadentyp: 'auffahrunfall',
      schadens_hergang: '',
      polizei_vor_ort: false,
      polizei_aktenzeichen: '',
      schuldfrage: 'gegner',
      fahrzeug_hersteller: 'Volkswagen',
      fahrzeug_modell: '',
      fahrzeug_baujahr: new Date().getFullYear(),
      fahrzeug_standort_plz: '',
      fahrzeug_standort_adresse: '',
      fahrzeug_standort_lat: null,
      fahrzeug_standort_lng: null,
      fahrzeug_standort_place_id: '',
      vorname: '',
      nachname: '',
      email: '',
      telefon: '',
      dsgvo_consent: false as unknown as true,
    },
  })

  const polizeiVorOrt = watch('polizei_vor_ort')
  const dsgvoConsent = watch('dsgvo_consent')

  useEffect(() => {
    if (searchParams.get('prefilled') !== '1') return
    try {
      const raw = sessionStorage.getItem(VOICE_PREFILL_KEY)
      if (!raw) return
      sessionStorage.removeItem(VOICE_PREFILL_KEY)
      const payload = JSON.parse(raw) as VoicePrefillPayload
      const patch = mapVoiceToForm(payload)
      reset((prev) => ({ ...prev, ...patch }), { keepDefaultValues: true })
      if (payload.transcript) {
        setSchadenhergang('voice', payload.transcript)
      }
      setVoiceBanner(
        'Wir haben Ihre Aufnahme transkribiert und das Formular vorausgefüllt. Bitte kontrollieren Sie die Werte.',
      )
    } catch (err) {
      console.warn('[AAR-470] Prefill-Parse fehlgeschlagen:', err)
    }
  }, [searchParams, reset, setSchadenhergang])

  const onSubmit = handleSubmit((values) => {
    setServerError(null)
    startTransition(async () => {
      const result = await createLeadFromSchritt1(values, false)
      if (!result.success) {
        setServerError(result.error)
        toast.error(result.error)
        return
      }
      setLeadId(result.leadId)
      router.push(
        result.abortToSelbstverschulden
          ? '/schaden-melden/selbstverschulden'
          : '/schaden-melden/schritt-2',
      )
    })
  })

  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate>
      {voiceBanner ? (
        <div
          role="status"
          className="rounded-md border border-claimondo-ondo/30 bg-claimondo-ondo/5 p-3 text-sm text-claimondo-navy"
        >
          {voiceBanner}
        </div>
      ) : null}
      {/* Mode-Toggle */}
      <div className="flex gap-2 rounded-lg bg-claimondo-bg p-1">
        <button
          type="button"
          aria-pressed="true"
          className="flex-1 rounded-md bg-white px-4 py-2 text-sm font-semibold text-claimondo-navy shadow-sm"
        >
          Tippen
        </button>
        <button
          type="button"
          onClick={() => router.push('/schaden-melden/schritt-1/voice')}
          className="flex-1 rounded-md px-4 py-2 text-sm font-medium text-claimondo-ondo hover:text-claimondo-navy"
        >
          Einsprechen
        </button>
      </div>

      {/* Unfall-Daten */}
      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-claimondo-navy">
          Wann und wo ist es passiert?
        </legend>

        <div>
          <Label htmlFor="unfalldatum">Unfalldatum</Label>
          <Input
            id="unfalldatum"
            type="datetime-local"
            max={TODAY_LOCAL_DATETIME}
            {...register('unfalldatum')}
          />
          {errors.unfalldatum ? (
            <p className="mt-1 text-sm text-red-600">{errors.unfalldatum.message}</p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="unfallort">Unfallort</Label>
          <Input
            id="unfallort"
            placeholder="Straße, Stadt"
            {...register('unfallort')}
          />
          {errors.unfallort ? (
            <p className="mt-1 text-sm text-red-600">{errors.unfallort.message}</p>
          ) : null}
        </div>
      </fieldset>

      {/* Schadentyp (Chips) */}
      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold text-claimondo-navy">
          Art des Schadens
        </legend>
        <Controller
          control={control}
          name="schadentyp"
          render={({ field }) => (
            <div className="flex flex-wrap gap-2">
              {SCHADENTYP_VALUES.map((v) => {
                const active = field.value === v
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={active}
                    onClick={() => field.onChange(v)}
                    className={[
                      'rounded-full border px-4 py-2 text-sm font-medium transition',
                      active
                        ? 'border-claimondo-ondo bg-claimondo-ondo text-white'
                        : 'border-claimondo-border bg-white text-claimondo-navy hover:border-claimondo-ondo',
                    ].join(' ')}
                  >
                    {SCHADENTYP_LABELS[v]}
                  </button>
                )
              })}
            </div>
          )}
        />
        {errors.schadentyp ? (
          <p className="text-sm text-red-600">{errors.schadentyp.message}</p>
        ) : null}
      </fieldset>

      {/* Hergang */}
      <div>
        <Label htmlFor="schadens_hergang">Was ist passiert?</Label>
        <Textarea
          id="schadens_hergang"
          rows={5}
          placeholder="Beschreibe kurz den Unfallhergang …"
          {...register('schadens_hergang')}
        />
        {errors.schadens_hergang ? (
          <p className="mt-1 text-sm text-red-600">{errors.schadens_hergang.message}</p>
        ) : null}
      </div>

      {/* Polizei */}
      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold text-claimondo-navy">
          War die Polizei vor Ort?
        </legend>
        <Controller
          control={control}
          name="polizei_vor_ort"
          render={({ field }) => (
            <div className="flex gap-4">
              {[
                { val: true, label: 'Ja' },
                { val: false, label: 'Nein' },
              ].map((opt) => {
                const active = field.value === opt.val
                return (
                  <button
                    key={opt.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => field.onChange(opt.val)}
                    className={[
                      'rounded-md border px-6 py-2 text-sm font-medium',
                      active
                        ? 'border-claimondo-ondo bg-claimondo-ondo text-white'
                        : 'border-claimondo-border bg-white text-claimondo-navy',
                    ].join(' ')}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          )}
        />
        {polizeiVorOrt ? (
          <div>
            <Label htmlFor="polizei_aktenzeichen">Aktenzeichen</Label>
            <Input
              id="polizei_aktenzeichen"
              placeholder="z.B. ST/1234/2026"
              {...register('polizei_aktenzeichen')}
            />
            {errors.polizei_aktenzeichen ? (
              <p className="mt-1 text-sm text-red-600">
                {errors.polizei_aktenzeichen.message}
              </p>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      {/* Schuldfrage */}
      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold text-claimondo-navy">
          Wer ist schuld?
        </legend>
        <Controller
          control={control}
          name="schuldfrage"
          render={({ field }) => (
            <div className="space-y-2">
              {SCHULDFRAGE_VALUES.map((v) => {
                const active = field.value === v
                return (
                  <label
                    key={v}
                    className={[
                      'flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition',
                      active
                        ? 'border-claimondo-ondo bg-claimondo-ondo/5'
                        : 'border-claimondo-border bg-white',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      value={v}
                      checked={active}
                      onChange={() => field.onChange(v)}
                      className="h-4 w-4 accent-claimondo-ondo"
                    />
                    <div>
                      <div className="font-medium text-claimondo-navy">
                        {SCHULDFRAGE_LABELS[v].title}
                      </div>
                      <div className="text-sm text-claimondo-ondo">
                        {SCHULDFRAGE_LABELS[v].desc}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        />
      </fieldset>

      {/* Fahrzeug */}
      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-claimondo-navy">
          Dein Fahrzeug
        </legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="fahrzeug_hersteller">Hersteller</Label>
            <Controller
              control={control}
              name="fahrzeug_hersteller"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="fahrzeug_hersteller">
                    <SelectValue placeholder="Hersteller wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {FAHRZEUG_HERSTELLER_VALUES.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.fahrzeug_hersteller ? (
              <p className="mt-1 text-sm text-red-600">
                {errors.fahrzeug_hersteller.message}
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="fahrzeug_modell">Modell</Label>
            <Input
              id="fahrzeug_modell"
              placeholder="z.B. Golf 7"
              {...register('fahrzeug_modell')}
            />
            {errors.fahrzeug_modell ? (
              <p className="mt-1 text-sm text-red-600">
                {errors.fahrzeug_modell.message}
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="fahrzeug_baujahr">Baujahr</Label>
            <Input
              id="fahrzeug_baujahr"
              type="number"
              inputMode="numeric"
              min={1970}
              max={new Date().getFullYear()}
              {...register('fahrzeug_baujahr', { valueAsNumber: true })}
            />
            {errors.fahrzeug_baujahr ? (
              <p className="mt-1 text-sm text-red-600">
                {errors.fahrzeug_baujahr.message}
              </p>
            ) : null}
          </div>

          {/* AAR-663: Wo steht das Fahrzeug aktuell? Google-Places-Autocomplete
              liefert Adresse + PLZ + Koordinaten in einem Step — Koords sind
              Voraussetzung damit findBestSV ohne Dispatcher-Intervention
              funktioniert (Self-Service-Dispatch). */}
          <div>
            <Label htmlFor="fahrzeug_standort_adresse">
              Wo steht das Fahrzeug aktuell?{' '}
              {watch('fahrzeug_standort_lat') != null && (
                <span className="text-[#4573A2] text-xs ml-1">✓ Standort erfasst</span>
              )}
            </Label>
            <GooglePlaceAutocomplete
              defaultValue={watch('fahrzeug_standort_adresse') ?? ''}
              placeholder="Straße, Hausnr., PLZ, Ort — bitte aus Dropdown wählen"
              onSelect={(place) => {
                setValue('fahrzeug_standort_adresse', place.adresse, { shouldValidate: true })
                setValue('fahrzeug_standort_plz', place.plz, { shouldValidate: true })
                setValue('fahrzeug_standort_lat', place.lat, { shouldValidate: true })
                setValue('fahrzeug_standort_lng', place.lng, { shouldValidate: true })
                setValue('fahrzeug_standort_place_id', place.place_id, { shouldValidate: true })
              }}
              className="w-full bg-white border border-claimondo-border rounded-md px-3 py-2 text-sm text-claimondo-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-claimondo-navy"
            />
            <p className="mt-1 text-xs text-claimondo-ondo">
              Wir nutzen die Adresse, um direkt einen Gutachter in deiner Nähe vorzuschlagen.
            </p>
            {/* Hidden fallback — wenn Autocomplete mal nicht lädt, muss PLZ trotzdem rein */}
            <input type="hidden" {...register('fahrzeug_standort_plz')} />
            {errors.fahrzeug_standort_plz ? (
              <p className="mt-1 text-sm text-red-600">
                Bitte wähle deinen Fahrzeug-Standort aus dem Dropdown.
              </p>
            ) : null}
          </div>
        </div>
      </fieldset>

      {/* Kontakt */}
      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-claimondo-navy">
          Deine Kontaktdaten
        </legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="vorname">Vorname</Label>
            <Input id="vorname" autoComplete="given-name" {...register('vorname')} />
            {errors.vorname ? (
              <p className="mt-1 text-sm text-red-600">{errors.vorname.message}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="nachname">Nachname</Label>
            <Input
              id="nachname"
              autoComplete="family-name"
              {...register('nachname')}
            />
            {errors.nachname ? (
              <p className="mt-1 text-sm text-red-600">{errors.nachname.message}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="email">E-Mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              {...register('email')}
            />
            {errors.email ? (
              <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="telefon">Telefon</Label>
            <Input
              id="telefon"
              type="tel"
              autoComplete="tel"
              placeholder="+49 221 1234567"
              {...register('telefon')}
            />
            {errors.telefon ? (
              <p className="mt-1 text-sm text-red-600">{errors.telefon.message}</p>
            ) : null}
          </div>
        </div>
      </fieldset>

      {/* DSGVO */}
      <div>
        <label className="flex items-start gap-3">
          <Controller
            control={control}
            name="dsgvo_consent"
            render={({ field }) => (
              <Checkbox
                checked={!!field.value}
                onCheckedChange={(v) => field.onChange(v === true)}
                aria-invalid={errors.dsgvo_consent ? 'true' : 'false'}
              />
            )}
          />
          <span className="text-sm text-claimondo-navy">
            Ich willige ein, dass meine Daten zur Fall-Bearbeitung gespeichert und
            verarbeitet werden. Die{' '}
            <a href="/datenschutz" className="underline" target="_blank">
              Datenschutzerklärung
            </a>{' '}
            habe ich zur Kenntnis genommen.
          </span>
        </label>
        {errors.dsgvo_consent ? (
          <p className="mt-1 text-sm text-red-600">{errors.dsgvo_consent.message}</p>
        ) : null}
      </div>

      {serverError ? (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {serverError}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={!dsgvoConsent || isPending || !isValid}
          className="bg-claimondo-ondo hover:bg-claimondo-shield"
        >
          {isPending ? 'Wird gespeichert …' : 'Weiter zu Schritt 2'}
        </Button>
      </div>
    </form>
  )
}

const SCHADENTYP_LABELS: Record<(typeof SCHADENTYP_VALUES)[number], string> = {
  auffahrunfall: 'Auffahrunfall',
  parkschaden: 'Parkschaden',
  kreuzung: 'Kreuzung',
  sonstiges: 'Sonstiges',
}

const SCHULDFRAGE_LABELS: Record<
  (typeof SCHULDFRAGE_VALUES)[number],
  { title: string; desc: string }
> = {
  gegner: {
    title: 'Der Gegner ist schuld',
    desc: 'Klassischer Haftpflichtfall — die Gegnerversicherung reguliert.',
  },
  unklar: {
    title: 'Die Schuldfrage ist unklar',
    desc: 'Wir klären das gemeinsam mit dir und unseren Anwälten.',
  },
  eigenverantwortung: {
    title: 'Ich bin selbst schuld',
    desc: 'Kasko-Fall — dafür sind wir leider nicht der richtige Partner.',
  },
}
