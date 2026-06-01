'use client'

// Geteilter Feld-Renderer: mappt einen OnboardingFeld-Typ auf die passende
// fields/*-Komponente. Extrahiert aus WizardClient (2026-06-01, P2a) damit der
// gestufte Kunden-Renderer (WizardClient) UND der flache Dispatcher-Renderer
// (DispatchLeadForm) denselben Render-Vertrag nutzen — eine Quelle, kein Zoo.

import type { OnboardingFeld } from './types'
import { TextField } from './fields/TextField'
import { TextareaField } from './fields/TextareaField'
import { SegmentedField } from './fields/SegmentedField'
import { ToggleCardsField } from './fields/ToggleCardsField'
import { SelectField } from './fields/SelectField'
import { CheckboxField } from './fields/CheckboxField'
import { SlotField } from './fields/SlotField'
import { SignatureField } from './fields/SignatureField'
import { FileField } from './fields/FileField'
import { Zb1UploadField } from './fields/Zb1UploadField'
import { TerminField } from './fields/TerminField'

export function FieldRenderer({
  feld,
  value,
  onChange,
  disabled,
  svId,
  anfrageId,
  preSelectedSvLeadId,
  fallId,
  zb1Token,
  token,
}: {
  feld: OnboardingFeld
  value: unknown
  onChange: (val: unknown) => void
  disabled: boolean
  svId?: string | null
  anfrageId?: string | null
  preSelectedSvLeadId?: string | null
  fallId?: string | null
  zb1Token?: string | null
  token?: string | null
}) {
  switch (feld.typ) {
    case 'text':
    case 'email':
    case 'tel':
    case 'number':
      return (
        <TextField
          feld={feld}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          disabled={disabled}
        />
      )
    case 'textarea':
      return (
        <TextareaField
          feld={feld}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          disabled={disabled}
        />
      )
    case 'segmented':
      return (
        <SegmentedField
          feld={feld}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          disabled={disabled}
        />
      )
    case 'toggle-cards':
      return (
        <ToggleCardsField
          feld={feld}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          disabled={disabled}
        />
      )
    case 'select':
      return (
        <SelectField
          feld={feld}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          disabled={disabled}
        />
      )
    case 'checkbox':
      return (
        <CheckboxField
          feld={feld}
          value={(value as boolean) ?? false}
          onChange={onChange as (v: boolean) => void}
          disabled={disabled}
        />
      )
    case 'slot':
      return (
        <SlotField
          feld={feld}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          disabled={disabled}
          svId={svId}
          // 2026-05-11 Funnel v2: SlotField ist Tier-aware. preSelectedSvLeadId
          // kommt von der Karten-Auswahl (claimondo:select-sv Event).
          svLeadId={preSelectedSvLeadId}
          anfrageId={anfrageId}
        />
      )
    case 'signature':
      return (
        <SignatureField
          feld={feld}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          disabled={disabled}
        />
      )
    case 'file':
      return (
        <FileField
          feld={feld}
          value={(value as string[]) ?? []}
          onChange={onChange as (v: string[]) => void}
          disabled={disabled}
        />
      )
    case 'zb1-upload':
      return (
        <Zb1UploadField
          feld={feld}
          value={value}
          onChange={onChange}
          disabled={disabled}
          token={zb1Token ?? null}
          fallId={fallId ?? null}
        />
      )
    case 'termin':
      return (
        <TerminField
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          disabled={disabled}
          token={token}
        />
      )
    default:
      return null
  }
}
