'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Info, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/primitives'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { useFlowStore } from '@/lib/flow/flow-store'
import { schritt4Schema, type Schritt4FormValues } from '@/lib/flow/schemas/schritt4'
import { signupAndConvertLead } from '@/lib/actions/signup-and-convert'
// AAR-841 Frontend: Kanzlei-Frage als Modal direkt nach erfolgreicher Konversion
import { KanzleiWunschModal } from '@/components/shared/claims'

// AAR-476 C10: Signup + optionale zweistufige Makler-Consent-Box.
//
// Consent-Logik (Aaron-Entscheidung 17.04.):
//   Stufe 1 „Minimal": angehakt + disabled — ohne Minimal-Consent ergibt
//     der Promo-Code keinen Sinn, kann der User nicht ablehnen.
//   Stufe 2 „Vollzugriff": Default unchecked — aktives Opt-in.
//
// Bei erfolgreichem Signup: Flow-Store reset + Redirect /kunde. Ob Auto-Login
// passiert hängt von Supabase email_confirmation ab — falls Email-Verify aktiv,
// landet der User auf /kunde und bekommt dort einen „Bitte Email bestätigen"-Screen.

type LeadMeta = {
  id: string
  email: string | null
  maklerFirma: string | null
  hasPromotionCode: boolean
}

export function SignupClient({ lead }: { lead: LeadMeta }) {
  const router = useRouter()
  const resetFlow = useFlowStore((s) => s.reset)
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<Schritt4FormValues>({
    resolver: zodResolver(schritt4Schema),
    defaultValues: {
      email: lead.email ?? '',
      password: '',
      password_confirm: '',
      agb_accepted: false as unknown as true,
      datenschutz_accepted: false as unknown as true,
      consent_vollzugriff: false,
    },
  })

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = form

  // AAR-841: Modal nach Convert-Success vor Redirect. claimId wird aus
  // signupAndConvertLead-Return geholt; Redirect läuft über onClose.
  const [kanzleiModalOpen, setKanzleiModalOpen] = useState(false)
  const [convertedClaimId, setConvertedClaimId] = useState<string | null>(null)

  async function onSubmit(values: Schritt4FormValues) {
    setSubmitting(true)
    try {
      const result = await signupAndConvertLead({
        leadId: lead.id,
        email: values.email,
        password: values.password,
        consent_vollzugriff: values.consent_vollzugriff,
      })
      if (!result.success) {
        if (result.code === 'EMAIL_EXISTS') {
          toast.error(result.error, {
            action: {
              label: 'Zum Login',
              onClick: () => router.push('/login'),
            },
          })
        } else {
          toast.error(result.error)
        }
        return
      }
      resetFlow()
      toast.success('Account erstellt.')
      // AAR-841: Wenn claimId verfügbar, Modal öffnen — sonst direkt redirect
      if (result.claimId) {
        setConvertedClaimId(result.claimId)
        setKanzleiModalOpen(true)
      } else {
        router.push('/kunde')
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleKanzleiModalClose() {
    setKanzleiModalOpen(false)
    router.push('/kunde')
  }

  const showMaklerBox = lead.hasPromotionCode && !!lead.maklerFirma

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          {...register('email')}
          aria-invalid={!!errors.email}
        />
        {errors.email && (
          <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="password">Passwort</Label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          {...register('password')}
          className="flex h-10 w-full rounded-ios-sm border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          aria-invalid={!!errors.password}
        />
        <p className="mt-1 text-xs text-claimondo-ondo">
          Mindestens 8 Zeichen, eine Ziffer, einen Buchstaben.
        </p>
        {errors.password && (
          <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="password_confirm">Passwort bestätigen</Label>
        <PasswordInput
          id="password_confirm"
          autoComplete="new-password"
          {...register('password_confirm')}
          className="flex h-10 w-full rounded-ios-sm border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          aria-invalid={!!errors.password_confirm}
        />
        {errors.password_confirm && (
          <p className="mt-1 text-xs text-red-600">
            {errors.password_confirm.message}
          </p>
        )}
      </div>

      {showMaklerBox && (
        <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-4">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-claimondo-ondo" />
            <div className="flex-1">
              <div className="font-semibold text-claimondo-navy">
                Sie wurden von {lead.maklerFirma} zu uns vermittelt.
              </div>
              <p className="mt-1 text-sm text-claimondo-ondo">
                {lead.maklerFirma} darf Sie zu diesem Schadenfall kontaktieren
                und den Bearbeitungsstand einsehen. Wählen Sie den Umfang:
              </p>

              <div className="mt-4 space-y-3">
                <label className="flex items-start gap-2">
                  <Checkbox checked disabled className="mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-claimondo-navy">
                      Minimal (empfohlen)
                    </div>
                    <div className="text-xs text-claimondo-ondo">
                      {lead.maklerFirma} sieht nur Ihren Fall-Status (offen /
                      in Bearbeitung / abgeschlossen). Keine Detaildaten.
                    </div>
                  </div>
                </label>

                <Controller
                  name="consent_vollzugriff"
                  control={control}
                  render={({ field }) => (
                    <label className="flex items-start gap-2">
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(!!v)}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="text-sm font-medium text-claimondo-navy">
                          Vollzugriff (optional)
                        </div>
                        <div className="text-xs text-claimondo-ondo">
                          Zusätzlich darf {lead.maklerFirma} die Fall-Detaildaten
                          einsehen (Fahrzeug, Gegner, Schaden­beschreibung,
                          Korrespondenz). Widerrufbar jederzeit im Kunden-Portal.
                        </div>
                      </div>
                    </label>
                  )}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Controller
          name="agb_accepted"
          control={control}
          render={({ field }) => (
            <label className="flex items-start gap-2">
              <Checkbox
                checked={field.value as unknown as boolean}
                onCheckedChange={(v) => field.onChange(!!v)}
                className="mt-0.5"
                aria-invalid={!!errors.agb_accepted}
              />
              <span className="text-sm text-claimondo-navy">
                Ich akzeptiere die{' '}
                <Link
                  href="/agb"
                  target="_blank"
                  className="text-claimondo-ondo underline"
                >
                  AGB
                </Link>
                .
              </span>
            </label>
          )}
        />
        {errors.agb_accepted && (
          <p className="text-xs text-red-600">{errors.agb_accepted.message}</p>
        )}

        <Controller
          name="datenschutz_accepted"
          control={control}
          render={({ field }) => (
            <label className="flex items-start gap-2">
              <Checkbox
                checked={field.value as unknown as boolean}
                onCheckedChange={(v) => field.onChange(!!v)}
                className="mt-0.5"
                aria-invalid={!!errors.datenschutz_accepted}
              />
              <span className="text-sm text-claimondo-navy">
                Ich akzeptiere die{' '}
                <Link
                  href="/datenschutz"
                  target="_blank"
                  className="text-claimondo-ondo underline"
                >
                  Datenschutzerklärung
                </Link>
                .
              </span>
            </label>
          )}
        />
        {errors.datenschutz_accepted && (
          <p className="text-xs text-red-600">
            {errors.datenschutz_accepted.message}
          </p>
        )}
      </div>

      <Button
        type="submit"
        tone="navy"
        fullWidth
        disabled={submitting}
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Account wird erstellt …
          </>
        ) : (
          'Account erstellen & Fall absenden'
        )}
      </Button>

      {/* AAR-841: Kanzlei-Frage als Modal direkt nach Convert-Success */}
      {convertedClaimId && (
        <KanzleiWunschModal
          open={kanzleiModalOpen}
          claimId={convertedClaimId}
          gefragtInPhase="lead_konvertierung"
          onClose={handleKanzleiModalClose}
        />
      )}
    </form>
  )
}
