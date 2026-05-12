'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Plus, Trash2, Info } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/primitives'
import { VersichererSelect } from '@/components/shared/VersichererSelect'
import { useFlowStore } from '@/lib/flow/flow-store'
import { updateLeadGegner } from '@/lib/actions/update-lead-gegner'
import {
  schritt2cSchema,
  type Schritt2cInput,
} from '@/lib/flow/schemas/schritt2c'

// AAR-474 C8: Gegner-Daten-Form. React-Hook-Form + Zod, VersichererSelect als
// Autocomplete. Conditional Hinweise bei Fahrerflucht / Auslandskennzeichen.
// Submit schreibt via updateLeadGegner → redirect /schritt-3.

type Versicherer = { id: string; name: string }

type Props = {
  leadId: string
  versicherer: Versicherer[]
}

export function GegnerClient({ leadId, versicherer }: Props) {
  const router = useRouter()
  const setCurrentStep = useFlowStore((s) => s.setCurrentStep)
  const markGegnerErfasst = useFlowStore((s) => s.markGegnerErfasst)
  const [pending, startTransition] = useTransition()

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Schritt2cInput>({
    resolver: zodResolver(schritt2cSchema),
    mode: 'onBlur',
    defaultValues: {
      gegner_name: '',
      gegner_kennzeichen: '',
      gegner_versicherung_id: null,
      gegner_schadennummer: '',
      zeugen_kontakte: [],
      fahrerflucht: false,
      auslandskennzeichen: false,
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'zeugen_kontakte',
  })

  const fahrerflucht = watch('fahrerflucht')
  const auslandskennzeichen = watch('auslandskennzeichen')

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await updateLeadGegner(leadId, values)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      markGegnerErfasst()
      setCurrentStep(3)
      router.push('/schaden-melden/schritt-3')
    })
  })

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {/* Flags */}
      <div className="rounded-3xl border border-claimondo-border bg-white shadow-[0_2px_6px_rgba(15,30,68,.05),0_8px_24px_rgba(15,30,68,.04)] p-4">
        <div className="space-y-3">
          <Controller
            control={control}
            name="fahrerflucht"
            render={({ field }) => (
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(c) => field.onChange(c === true)}
                />
                <span className="text-sm text-claimondo-navy">
                  <span className="font-semibold">Fahrerflucht</span> — der
                  Unfallgegner hat sich unerlaubt entfernt
                </span>
              </label>
            )}
          />
          <Controller
            control={control}
            name="auslandskennzeichen"
            render={({ field }) => (
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(c) => field.onChange(c === true)}
                />
                <span className="text-sm text-claimondo-navy">
                  <span className="font-semibold">Auslandskennzeichen</span> —
                  das gegnerische Fahrzeug hatte ein ausländisches Kennzeichen
                </span>
              </label>
            )}
          />
        </div>
      </div>

      {fahrerflucht ? (
        <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            <strong>Polizei-Aktenzeichen</strong> wird zur Weiterverarbeitung
            dringend benötigt. Bitte im nächsten Schritt (ZB1) angeben.
          </p>
        </div>
      ) : null}

      {/* Gegner-Name */}
      <div>
        <Label htmlFor="gegner_name">
          Name des Unfallgegners{fahrerflucht ? ' (optional)' : ''}
        </Label>
        <Input
          id="gegner_name"
          {...register('gegner_name')}
          placeholder="Vor- und Nachname"
          aria-invalid={!!errors.gegner_name}
        />
        {errors.gegner_name ? (
          <p className="mt-1 text-xs text-red-600">{errors.gegner_name.message}</p>
        ) : null}
      </div>

      {/* Kennzeichen */}
      <div>
        <Label htmlFor="gegner_kennzeichen">
          Kennzeichen{fahrerflucht ? ' (optional)' : ''}
        </Label>
        <Input
          id="gegner_kennzeichen"
          {...register('gegner_kennzeichen')}
          placeholder="B-AB 1234"
          aria-invalid={!!errors.gegner_kennzeichen}
        />
        {auslandskennzeichen ? (
          <p className="mt-1 text-xs text-claimondo-ondo">
            Ausländisches Kennzeichen — geben Sie es so gut wie möglich ein.
          </p>
        ) : null}
        {errors.gegner_kennzeichen ? (
          <p className="mt-1 text-xs text-red-600">
            {errors.gegner_kennzeichen.message}
          </p>
        ) : null}
      </div>

      {/* Versicherung */}
      <div>
        <Label>Versicherung des Gegners</Label>
        <Controller
          control={control}
          name="gegner_versicherung_id"
          render={({ field, fieldState }) => (
            <VersichererSelect
              value={field.value ?? null}
              onChange={field.onChange}
              versicherer={versicherer}
              error={!!fieldState.error}
              ariaLabel="Versicherung des Gegners wählen"
            />
          )}
        />
        <p className="mt-1 text-xs text-claimondo-ondo">
          Aus der ZB1 / Versicherungs-Karte ablesbar. Falls unbekannt, freilassen.
        </p>
      </div>

      {/* Schadennummer */}
      <div>
        <Label htmlFor="gegner_schadennummer">
          Schadennummer der gegnerischen Versicherung (optional)
        </Label>
        <Input
          id="gegner_schadennummer"
          {...register('gegner_schadennummer')}
          placeholder="z. B. VN-2026-12345"
        />
      </div>

      {/* Zeugen */}
      <div className="rounded-3xl border border-claimondo-border bg-white shadow-[0_2px_6px_rgba(15,30,68,.05),0_8px_24px_rgba(15,30,68,.04)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <Label>Zeugen</Label>
          <Button
            type="button"
            tone="bare"
            size="sm"
            onPress={() =>
              fields.length < 5 && append({ name: '', telefon: '' })
            }
            disabled={fields.length >= 5}
            iconLeft={<Plus className="h-4 w-4" />}
          >
            Zeuge hinzufügen
          </Button>
        </div>

        {fields.length === 0 ? (
          <p className="text-sm text-claimondo-ondo">
            Keine Zeugen erfasst. Maximal 5 möglich.
          </p>
        ) : (
          <ul className="space-y-3">
            {fields.map((f, i) => (
              <li
                key={f.id}
                className="grid grid-cols-1 gap-2 rounded-lg border border-claimondo-border bg-claimondo-bg p-3 sm:grid-cols-[1fr_1fr_auto]"
              >
                <div>
                  <Input
                    {...register(`zeugen_kontakte.${i}.name` as const)}
                    placeholder="Name"
                    aria-invalid={!!errors.zeugen_kontakte?.[i]?.name}
                  />
                  {errors.zeugen_kontakte?.[i]?.name ? (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.zeugen_kontakte[i]?.name?.message}
                    </p>
                  ) : null}
                </div>
                <div>
                  <Input
                    {...register(`zeugen_kontakte.${i}.telefon` as const)}
                    placeholder="Telefon (optional)"
                    aria-invalid={!!errors.zeugen_kontakte?.[i]?.telefon}
                  />
                  {errors.zeugen_kontakte?.[i]?.telefon ? (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.zeugen_kontakte[i]?.telefon?.message}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  tone="bare"
                  size="icon"
                  onPress={() => remove(i)}
                  ariaLabel={`Zeuge ${i + 1} entfernen`}
                  className="justify-self-end"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sticky bottom-4 flex items-center justify-end rounded-3xl border border-claimondo-border bg-white shadow-[0_2px_6px_rgba(15,30,68,.05),0_8px_24px_rgba(15,30,68,.04)] p-4 shadow-[var(--shadow-claimondo-sm)]">
        <Button
          type="submit"
          tone="ondo"
          disabled={pending}
        >
          {pending ? 'Wird gespeichert …' : 'Weiter zu ZB1'}
        </Button>
      </div>
    </form>
  )
}
