'use client'

// AAR-759 Phase 2: Admin/KB-Edit-UI fuer Mietwagen-Daten.
// Ersetzt die read-only MietwagenStatusCard im Admin-Kontext — baut
// direkt auf dieselbe Datenstruktur auf.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { CarIcon, PencilIcon, SaveIcon, XIcon } from 'lucide-react'
import { Card, Stack, Row, Text, Icon } from '@/components/primitives'
import { tokens } from '@/lib/design-tokens'
import { updateMietwagen } from '@/lib/mietwagen/actions'
import { MietwagenStatusCard } from '@/components/shared/mietwagen'

type MietwagenFallData = {
  mietwagen_hat: boolean | null
  mietwagen_seit_datum: string | null
  mietwagen_limit_tage: number | null
  mietwagen_limit_grund: string | null
  mietwagen_rechnung_vorhanden: boolean | null
  mietwagen_argumentations_puffer: number | null
  mietwagen_vermieter: string | null
}

type Props = {
  fallId: string
  fall: MietwagenFallData
}

export function MietwagenEditCard({ fallId, fall }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({
    mietwagen_hat: fall.mietwagen_hat ?? false,
    mietwagen_seit_datum: fall.mietwagen_seit_datum ?? '',
    mietwagen_limit_tage: fall.mietwagen_limit_tage ?? 14,
    mietwagen_limit_grund: fall.mietwagen_limit_grund ?? '',
    mietwagen_vermieter: fall.mietwagen_vermieter ?? '',
    mietwagen_argumentations_puffer: fall.mietwagen_argumentations_puffer ?? 3,
  })

  function handleSave() {
    if (form.mietwagen_hat && !form.mietwagen_seit_datum) {
      toast.error('Abhol-Datum ist erforderlich wenn Mietwagen aktiv ist')
      return
    }
    startTransition(async () => {
      const r = await updateMietwagen(fallId, {
        mietwagen_hat: form.mietwagen_hat,
        mietwagen_seit_datum: form.mietwagen_hat ? form.mietwagen_seit_datum || null : null,
        mietwagen_limit_tage: form.mietwagen_hat ? Number(form.mietwagen_limit_tage) : null,
        mietwagen_limit_grund: form.mietwagen_hat ? form.mietwagen_limit_grund || null : null,
        mietwagen_vermieter: form.mietwagen_hat ? form.mietwagen_vermieter || null : null,
        mietwagen_argumentations_puffer: Number(form.mietwagen_argumentations_puffer),
      })
      if (r.success) {
        toast.success('Mietwagen-Daten gespeichert')
        setEditing(false)
        router.refresh()
      } else {
        toast.error(r.error ?? 'Speichern fehlgeschlagen')
      }
    })
  }

  function handleCancel() {
    setForm({
      mietwagen_hat: fall.mietwagen_hat ?? false,
      mietwagen_seit_datum: fall.mietwagen_seit_datum ?? '',
      mietwagen_limit_tage: fall.mietwagen_limit_tage ?? 14,
      mietwagen_limit_grund: fall.mietwagen_limit_grund ?? '',
      mietwagen_vermieter: fall.mietwagen_vermieter ?? '',
      mietwagen_argumentations_puffer: fall.mietwagen_argumentations_puffer ?? 3,
    })
    setEditing(false)
  }

  if (!editing) {
    // Read-only Modus: zeigt existierende Status-Card + Edit-Button.
    // Wenn noch nichts gesetzt, bekommt Admin einen klaren CTA zum Anlegen.
    const nichtsGesetzt = !fall.mietwagen_hat
    return (
      <Card p={5}>
        <Stack gap={3}>
          <Row align="center" justify="between">
            <Row gap={2} align="center">
              <Icon icon={CarIcon} size={14} color="ondo" />
              <Text variant="caption" color="ondo">
                Mietwagen
              </Text>
            </Row>
            <button
              type="button"
              onClick={() => setEditing(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: tokens.spacing[1],
                height: 32,
                paddingLeft: tokens.spacing[3],
                paddingRight: tokens.spacing[3],
                borderRadius: tokens.radius.sm,
                border: `1px solid ${tokens.colors.border}`,
                backgroundColor: tokens.colors.white,
                color: tokens.colors.navy,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <PencilIcon size={12} />
              Bearbeiten
            </button>
          </Row>
          {nichtsGesetzt ? (
            <Text variant="bodySm" color="ondo">
              Noch keine Mietwagen-Daten erfasst. Klicken Sie auf „Bearbeiten" um sie
              zu hinterlegen.
            </Text>
          ) : (
            <MietwagenStatusCard rolle="kb" fall={fall} />
          )}
        </Stack>
      </Card>
    )
  }

  // Edit-Modus
  return (
    <Card p={5}>
      <Stack gap={4}>
        <Row align="center" justify="between">
          <Text variant="headingSm" color="navy">
            Mietwagen bearbeiten
          </Text>
          <button
            type="button"
            onClick={handleCancel}
            disabled={pending}
            aria-label="Abbrechen"
            style={{
              width: 32,
              height: 32,
              borderRadius: tokens.radius.full,
              border: 'none',
              backgroundColor: tokens.colors.bg,
              color: tokens.colors.ondo,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <XIcon size={14} />
          </button>
        </Row>

        {/* Toggle: Hat Mietwagen */}
        <Row gap={3} align="center">
          <input
            id="mietwagen_hat"
            type="checkbox"
            checked={form.mietwagen_hat}
            onChange={(e) => setForm({ ...form, mietwagen_hat: e.target.checked })}
            disabled={pending}
            style={{ width: 18, height: 18, accentColor: tokens.colors.navy }}
          />
          <label htmlFor="mietwagen_hat" style={{ cursor: 'pointer' }}>
            <Text variant="body" color="navy">
              Kunde hat einen Mietwagen genommen
            </Text>
          </label>
        </Row>

        {form.mietwagen_hat && (
          <Stack gap={3}>
            <Field label="Abhol-Datum">
              <input
                type="date"
                value={form.mietwagen_seit_datum}
                onChange={(e) => setForm({ ...form, mietwagen_seit_datum: e.target.value })}
                disabled={pending}
                style={inputStyle}
              />
            </Field>

            <Row gap={3}>
              <Field label="Limit (Tage)">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={form.mietwagen_limit_tage}
                  onChange={(e) =>
                    setForm({ ...form, mietwagen_limit_tage: Number(e.target.value) })
                  }
                  disabled={pending}
                  style={inputStyle}
                />
              </Field>
              <Field label="Argumentations-Puffer (Tage)">
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={form.mietwagen_argumentations_puffer}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      mietwagen_argumentations_puffer: Number(e.target.value),
                    })
                  }
                  disabled={pending}
                  style={inputStyle}
                />
              </Field>
            </Row>

            <Field label="Limit-Grund">
              <select
                value={form.mietwagen_limit_grund}
                onChange={(e) => setForm({ ...form, mietwagen_limit_grund: e.target.value })}
                disabled={pending}
                style={inputStyle}
              >
                <option value="">— bitte wählen —</option>
                <option value="Reparaturdauer">Reparaturdauer</option>
                <option value="VS-Anforderung">VS-Anforderung</option>
                <option value="Ausleihvertrag">Ausleihvertrag</option>
                <option value="Sonderregelung">Sonderregelung</option>
              </select>
            </Field>

            <Field label="Vermieter-Name">
              <input
                type="text"
                value={form.mietwagen_vermieter}
                onChange={(e) => setForm({ ...form, mietwagen_vermieter: e.target.value })}
                disabled={pending}
                placeholder="z.B. Sixt, Europcar, Enterprise"
                style={inputStyle}
              />
            </Field>
          </Stack>
        )}

        <Row gap={2} justify="end">
          <button
            type="button"
            onClick={handleCancel}
            disabled={pending}
            style={secondaryBtnStyle}
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            style={primaryBtnStyle(pending)}
          >
            <SaveIcon size={14} style={{ marginRight: tokens.spacing[1] }} />
            {pending ? 'Wird gespeichert…' : 'Speichern'}
          </button>
        </Row>
      </Stack>
    </Card>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 40,
  paddingLeft: tokens.spacing[3],
  paddingRight: tokens.spacing[3],
  fontSize: 14,
  color: tokens.colors.navy,
  backgroundColor: tokens.colors.bg,
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: tokens.radius.sm,
  fontFamily: 'inherit',
}

const secondaryBtnStyle: React.CSSProperties = {
  height: 40,
  paddingLeft: tokens.spacing[4],
  paddingRight: tokens.spacing[4],
  borderRadius: tokens.radius.sm,
  border: `1px solid ${tokens.colors.border}`,
  backgroundColor: tokens.colors.white,
  color: tokens.colors.navy,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
}

function primaryBtnStyle(pending: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    paddingLeft: tokens.spacing[4],
    paddingRight: tokens.spacing[4],
    borderRadius: tokens.radius.sm,
    border: 'none',
    backgroundColor: tokens.colors.navy,
    color: tokens.colors.white,
    fontSize: 13,
    fontWeight: 600,
    cursor: pending ? 'progress' : 'pointer',
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack gap={1}>
      <Text variant="caption" color="ondo">
        {label}
      </Text>
      {children}
    </Stack>
  )
}
