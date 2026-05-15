'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/primitives'
import { miniWizardSchema, type MiniWizardInput } from '@/lib/flow/schemas/mini-wizard'
import { createLeadFromMiniWizard } from '@/lib/actions/create-lead-from-mini-wizard'

// AAR-902 Prototyp: 4-Felder-Mini-Wizard. Eine Seite, kein Step-by-Step.
// Konzept: docs/14.05.2026/mini-wizard-magic-link-konzept.md Section "Phase 1".

const TODAY_LOCAL_DATETIME = (() => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
})()

const SCHULDFRAGE_OPTIONS = [
  {
    value: 'gegner' as const,
    title: 'Der Gegner ist schuld',
    desc: 'Klassischer Haftpflichtfall — die Gegnerversicherung reguliert. Sie zahlen nichts dazu.',
  },
  {
    value: 'unklar' as const,
    title: 'Die Schuldfrage ist unklar',
    desc: 'Wir klären das gemeinsam mit Ihnen und unseren Anwälten.',
  },
  {
    value: 'eigenverantwortung' as const,
    title: 'Ich bin selbst schuld',
    desc: 'Kasko-Fall — Sie hören gleich auf der nächsten Seite, wie wir trotzdem helfen können.',
  },
]

type MiniWizardClientProps = {
  // 15.05.2026: Promo-Code wird direkt im Form transportiert (Cookie-Layer
  // weg). Server-Component liest `?p=<code>` aus URL, validiert das Format
  // und reicht den Code als Prop durch. Form schreibt ihn als hidden field
  // in die FormData; createLeadFromMiniWizard liest ihn aus dem Input und
  // resolved makler_id + promotion_code_id. Vorher (PR #1308 + #1319) lief
  // das über `cookies().set()` aus Server-Component/Server-Action und hat
  // drei verschiedene CMM-14-Crash-Quellen erzeugt (Sentry NEXTJS-8/9 +
  // Digest 2740258766) — der Cookie-Layer hat hier keinen Mehrwert (Cookie
  // wurde NUR für DIESE Anlage gelesen, keine Cross-Session-Attribution).
  initialPromo?: string | null
}

export function MiniWizardClient({ initialPromo = null }: MiniWizardClientProps = {}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<MiniWizardInput>({
    resolver: zodResolver(miniWizardSchema),
    mode: 'onBlur',
    defaultValues: {
      schuldfrage: 'gegner',
      unfalldatum: TODAY_LOCAL_DATETIME,
      unfallort: '',
      email: '',
      telefon: '',
      vorname: '',
      nachname: '',
      dsgvo_consent: false as unknown as true,
      promoCode: initialPromo ?? '',
    },
  })

  const onSubmit = handleSubmit((values) => {
    setServerError(null)
    startTransition(async () => {
      const result = await createLeadFromMiniWizard(values)
      if (!result.success) {
        setServerError(result.error)
        toast.error(result.error)
        return
      }
      router.push(result.redirectTo)
    })
  })

  return (
    <form onSubmit={onSubmit} className="space-y-7" noValidate>
      {/* Hidden promo-code aus ?p=<code> — schon im defaultValues gesetzt, hier
          nur per register sichtbar machen, damit RHF den Wert beim Submit
          mitschickt. */}
      <input type="hidden" {...register('promoCode')} />
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
              {SCHULDFRAGE_OPTIONS.map((opt) => {
                const active = field.value === opt.value
                return (
                  <label
                    key={opt.value}
                    className={[
                      'flex cursor-pointer items-start gap-3 rounded-ios-sm border p-4 transition',
                      active
                        ? 'border-claimondo-ondo bg-claimondo-ondo/5'
                        : 'border-claimondo-border bg-white',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      value={opt.value}
                      checked={active}
                      onChange={() => field.onChange(opt.value)}
                      className="mt-1 h-4 w-4 accent-claimondo-ondo"
                    />
                    <div>
                      <div className="font-medium text-claimondo-navy">{opt.title}</div>
                      <div className="text-sm text-claimondo-ondo">{opt.desc}</div>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        />
      </fieldset>

      {/* Unfall */}
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
            placeholder="Straße, Stadt — z.B. Hauptstraße 12, Köln"
            {...register('unfallort')}
          />
          {errors.unfallort ? (
            <p className="mt-1 text-sm text-red-600">{errors.unfallort.message}</p>
          ) : null}
        </div>
      </fieldset>

      {/* Kontakt */}
      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-claimondo-navy">
          Wie erreichen wir Sie?
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="vorname">Vorname</Label>
            <Input
              id="vorname"
              autoComplete="given-name"
              placeholder="Max"
              {...register('vorname')}
              aria-invalid={!!errors.vorname}
            />
            {errors.vorname ? (
              <p className="mt-1 text-sm text-red-600">{errors.vorname.message}</p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="nachname">Nachname</Label>
            <Input
              id="nachname"
              autoComplete="family-name"
              placeholder="Mustermann"
              {...register('nachname')}
              aria-invalid={!!errors.nachname}
            />
            {errors.nachname ? (
              <p className="mt-1 text-sm text-red-600">{errors.nachname.message}</p>
            ) : null}
          </div>
        </div>
        <div>
          <Label htmlFor="telefon">Telefon</Label>
          <Input
            id="telefon"
            type="tel"
            autoComplete="tel"
            placeholder="+49 221 1234567"
            {...register('telefon')}
            aria-invalid={!!errors.telefon}
          />
          {errors.telefon ? (
            <p className="mt-1 text-sm text-red-600">{errors.telefon.message}</p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="email">E-Mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="max@example.com"
            {...register('email')}
          />
          <p className="mt-1 text-xs text-claimondo-ondo">
            Sie bekommen direkt nach dem Absenden einen sicheren Login-Link an diese Adresse.
          </p>
          {errors.email ? (
            <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
          ) : null}
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
                className="mt-0.5"
              />
            )}
          />
          <span className="text-sm text-claimondo-navy">
            Ich willige ein, dass meine Daten zur Fall-Bearbeitung gespeichert und verarbeitet
            werden. Zusätzlich prüfen wir, ob meine Telefonnummer auf WhatsApp aktiv ist, damit
            Statusinformationen schneller zugestellt werden können. Die{' '}
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
          className="rounded-ios-sm border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {serverError}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" tone="ondo" disabled={isPending}>
          {isPending ? 'Wird gesendet …' : 'Login-Link erhalten'}
        </Button>
      </div>
    </form>
  )
}
