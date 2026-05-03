'use client'

// AAR-761 Phase 3: Review-UI für Kunde-hochgeladene OCR-Belege.
// Zeigt pro Dokument die extrahierten Felder als editierbare Inputs +
// Freigeben/Ablehnen-Buttons. Beim Freigeben werden Korrekturen in
// ocr_extracted_data zurückgeschrieben und (für Mietwagen) der
// faelle.mietwagen_rechnung_vorhanden Flag gesetzt.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2Icon,
  FileTextIcon,
  XCircleIcon,
  EyeIcon,
  LoaderCircleIcon,
} from 'lucide-react'
import { Card, Stack, Row, Text, Icon } from '@/components/primitives'
import { tokens } from '@/lib/design-tokens'
import type { BelegTyp, BelegExtraktion } from '@/lib/ocr-beleg/types'
import {
  approveBeleg,
  rejectBeleg,
  type BelegReviewItem,
} from '@/lib/beleg-review/actions'

type Props = {
  items: BelegReviewItem[]
}

const TYP_LABEL: Record<BelegTyp, string> = {
  mietwagen_rechnung: 'Mietwagen-Rechnung',
  werkstatt_rechnung: 'Werkstatt-Rechnung',
  abschlepp_rechnung: 'Abschlepp-Rechnung',
  attest: 'Ärztliches Attest',
  sonstiges: 'Sonstiges Dokument',
}

type FormState = Record<string, string>

function initialForm(data: BelegExtraktion | null): FormState {
  if (!data) return {}
  const flat: FormState = {}
  for (const [k, v] of Object.entries(data as unknown as Record<string, unknown>)) {
    if (k === 'typ' || k === '_review') continue
    if (v === null || v === undefined) flat[k] = ''
    else if (typeof v === 'object') continue // Arrays/Nested lassen wir in Phase 3 unediert
    else flat[k] = String(v)
  }
  return flat
}

const FELD_LABELS: Record<string, string> = {
  rechnungsdatum: 'Rechnungsdatum',
  rechnungsnummer: 'Rechnungsnummer',
  rechnungsbetrag_brutto: 'Betrag brutto (€)',
  rechnungsbetrag_netto: 'Betrag netto (€)',
  ust_prozent: 'USt. (%)',
  aussteller_firma: 'Aussteller',
  aussteller_iban: 'IBAN',
  abhol_datum: 'Abhol-Datum',
  rueckgabe_datum: 'Rückgabe-Datum',
  tage_anzahl: 'Tage',
  fahrzeug_hinweis: 'Fahrzeug',
  fahrzeug_kennzeichen: 'Kennzeichen',
  abhol_ort: 'Abhol-Ort',
  abstellort: 'Abstellort',
  tarif_hinweis: 'Tarif-Hinweis',
  ausgestellt_fuer: 'Ausgestellt für',
}

export function BelegReviewList({ items }: Props) {
  if (items.length === 0) return null

  return (
    <Card p={0}>
      <div
        style={{
          paddingInline: tokens.spacing[4],
          paddingBlock: tokens.spacing[2],
          borderBottom: `1px solid ${tokens.colors.border}`,
          backgroundColor: tokens.colors.bg,
        }}
      >
        <Row gap={2} align="center">
          <Icon icon={EyeIcon} size={14} color="ondo" />
          <Text variant="caption" color="ondo">
            OCR-Belege zu prüfen ({items.length})
          </Text>
        </Row>
      </div>
      <Stack gap={0}>
        {items.map((item, i) => (
          <div
            key={item.id}
            style={{
              paddingInline: tokens.spacing[4],
              paddingBlock: tokens.spacing[3],
              borderTop: i > 0 ? `1px solid ${tokens.colors.border}` : 'none',
            }}
          >
            <BelegReviewRow item={item} />
          </div>
        ))}
      </Stack>
    </Card>
  )
}

function BelegReviewRow({ item }: { item: BelegReviewItem }) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(() => initialForm(item.ocr_extracted_data))
  const [showReject, setShowReject] = useState(false)
  const [rejectGrund, setRejectGrund] = useState('')
  const [pending, startTransition] = useTransition()

  function formToCorrections(): Partial<BelegExtraktion> {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(form)) {
      if (v === '') {
        out[k] = null
      } else if (
        k === 'rechnungsbetrag_brutto' ||
        k === 'rechnungsbetrag_netto' ||
        k === 'ust_prozent' ||
        k === 'tage_anzahl'
      ) {
        const n = Number(v)
        out[k] = Number.isFinite(n) ? n : null
      } else {
        out[k] = v
      }
    }
    return out as Partial<BelegExtraktion>
  }

  function handleApprove() {
    startTransition(async () => {
      const r = await approveBeleg({
        dokumentId: item.id,
        corrections: formToCorrections(),
      })
      if (r.success) {
        toast.success('Freigegeben')
        router.refresh()
      } else {
        toast.error(r.error ?? 'Freigabe fehlgeschlagen')
      }
    })
  }

  function handleReject() {
    if (!rejectGrund.trim()) {
      toast.error('Grund erforderlich')
      return
    }
    startTransition(async () => {
      const r = await rejectBeleg({ dokumentId: item.id, grund: rejectGrund })
      if (r.success) {
        toast.success('Abgelehnt')
        router.refresh()
      } else {
        toast.error(r.error ?? 'Ablehnung fehlgeschlagen')
      }
    })
  }

  const felder = Object.keys(form).filter((k) => FELD_LABELS[k])

  return (
    <Stack gap={3}>
      <Row gap={3} align="center" justify="between">
        <div style={{ display: 'flex', gap: tokens.spacing[2], alignItems: 'center', minWidth: 0 }}>
          <Icon icon={FileTextIcon} size={16} color="ondo" />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <Text variant="bodySm" color="navy">
              {TYP_LABEL[item.typ] ?? item.typ}
            </Text>
            <Text variant="bodyXs" color="ondo">
              {item.original_filename ?? 'OCR-Extrakt'} ·{' '}
              {new Date(item.hochgeladen_am).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}
            </Text>
          </div>
        </div>
        {item.preview_url && (
          <a
            href={item.preview_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11,
              color: tokens.colors.ondo,
              textDecoration: 'underline',
            }}
          >
            Datei ansehen
          </a>
        )}
      </Row>

      {felder.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: tokens.spacing[2],
          }}
        >
          {felder.map((k) => (
            <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Text variant="bodyXs" color="ondo">
                {FELD_LABELS[k]}
              </Text>
              <input
                type="text"
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                disabled={pending}
                style={{
                  height: 32,
                  paddingInline: tokens.spacing[2],
                  fontSize: 13,
                  color: tokens.colors.navy,
                  backgroundColor: tokens.colors.bg,
                  border: `1px solid ${tokens.colors.border}`,
                  borderRadius: tokens.radius.sm,
                }}
              />
            </label>
          ))}
        </div>
      ) : (
        <Text variant="bodyXs" color="ondo">
          Kein OCR-Extrakt vorhanden. Bitte Original prüfen.
        </Text>
      )}

      {showReject && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing[1] }}>
          <Text variant="bodyXs" color="ondo">
            Ablehnungs-Grund
          </Text>
          <textarea
            value={rejectGrund}
            onChange={(e) => setRejectGrund(e.target.value)}
            rows={2}
            disabled={pending}
            placeholder="z.B. Bild unscharf, falscher Beleg-Typ, unvollständig …"
            style={{
              padding: tokens.spacing[2],
              fontSize: 13,
              color: tokens.colors.navy,
              backgroundColor: tokens.colors.bg,
              border: `1px solid ${tokens.colors.border}`,
              borderRadius: tokens.radius.sm,
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        </div>
      )}

      <Row gap={2} justify="end">
        {showReject ? (
          <>
            <button
              type="button"
              onClick={() => {
                setShowReject(false)
                setRejectGrund('')
              }}
              disabled={pending}
              style={secondaryBtn}
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={pending}
              style={{ ...primaryBtn, backgroundColor: tokens.colors.danger }}
            >
              {pending ? (
                <LoaderCircleIcon size={14} className="animate-spin" />
              ) : (
                <XCircleIcon size={14} />
              )}
              Ablehnen
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setShowReject(true)}
              disabled={pending}
              style={{ ...secondaryBtn, color: tokens.colors.danger, borderColor: tokens.colors.danger }}
            >
              <XCircleIcon size={14} />
              Ablehnen
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={pending}
              style={primaryBtn}
            >
              {pending ? (
                <LoaderCircleIcon size={14} className="animate-spin" />
              ) : (
                <CheckCircle2Icon size={14} />
              )}
              Freigeben
            </button>
          </>
        )}
      </Row>
    </Stack>
  )
}

const secondaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 32,
  paddingInline: tokens.spacing[3],
  fontSize: 12,
  fontWeight: 500,
  color: tokens.colors.navy,
  backgroundColor: tokens.colors.white,
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: tokens.radius.sm,
  cursor: 'pointer',
}

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 32,
  paddingInline: tokens.spacing[3],
  fontSize: 12,
  fontWeight: 600,
  color: tokens.colors.white,
  backgroundColor: tokens.colors.success,
  border: 'none',
  borderRadius: tokens.radius.sm,
  cursor: 'pointer',
}
