'use client'

// AAR-762 Phase 2: Admin/KB-UI zum ad-hoc Anfordern eines Belegs per
// WhatsApp / SMS. Button öffnet Modal mit Typ-Dropdown + Kanal-Auswahl.
// Ruft server-seitig requestDokumentFromKunde aus lib/dokumente/ad-hoc-
// anforderung. Resolver (AAR-764) erzeugt KB-Task + Reminder-Kaskade.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { SendIcon } from 'lucide-react'
import { Modal, Stack, Row, Text, Icon } from '@/components/primitives'
import { tokens } from '@/lib/design-tokens'
import type { BelegTyp } from '@/lib/ocr-beleg/types'
import { requestDokumentFromKunde, type AdHocKanal } from '@/lib/dokumente/ad-hoc-anforderung'

const BELEG_OPTIONS: { value: BelegTyp; label: string }[] = [
  { value: 'mietwagen_rechnung', label: 'Mietwagen-Rechnung' },
  { value: 'werkstatt_rechnung', label: 'Werkstatt-Rechnung' },
  { value: 'abschlepp_rechnung', label: 'Abschlepp-Rechnung' },
  { value: 'attest', label: 'Ärztliches Attest' },
  { value: 'sonstiges', label: 'Sonstiges Dokument' },
]

const KANAL_OPTIONS: { value: AdHocKanal; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'E-Mail' },
]

type Props = {
  fallId: string
}

export function AdHocAnforderungsButton({ fallId }: Props) {
  const [open, setOpen] = useState(false)
  const [typ, setTyp] = useState<BelegTyp>('mietwagen_rechnung')
  const [kanal, setKanal] = useState<AdHocKanal>('whatsapp')
  const [begruendung, setBegruendung] = useState('')
  const [pending, startTransition] = useTransition()

  function handleSubmit() {
    startTransition(async () => {
      const r = await requestDokumentFromKunde({
        fallId,
        belegTyp: typ,
        kanal,
        begruendung: begruendung.trim() || undefined,
      })
      if (r.success) {
        toast.success(`${BELEG_OPTIONS.find((o) => o.value === typ)?.label} via ${KANAL_OPTIONS.find((k) => k.value === kanal)?.label} angefordert`)
        setOpen(false)
        setBegruendung('')
      } else {
        toast.error(r.error ?? 'Anforderung fehlgeschlagen')
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: tokens.spacing[2],
          height: 36,
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
        <Icon icon={SendIcon} size={14} color="ondo" />
        Dokument anfordern
      </button>

      <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Dokument anfordern" maxWidth={520}>
        <Stack gap={4}>
          <Stack gap={1}>
            <Text variant="headingMd" color="navy">
              Dokument beim Kunden anfordern
            </Text>
            <Text variant="bodySm" color="ondo">
              Wir senden dem Kunden einen Upload-Link im gewählten Kanal. Reminder + Eskalation
              laufen automatisch nach unserer Regel.
            </Text>
          </Stack>

          <Stack gap={2}>
            <Text variant="caption" color="ondo">
              Dokumenttyp
            </Text>
            <select
              value={typ}
              onChange={(e) => setTyp(e.target.value as BelegTyp)}
              disabled={pending}
              style={{
                width: '100%',
                height: 40,
                paddingLeft: tokens.spacing[3],
                paddingRight: tokens.spacing[3],
                fontSize: 14,
                color: tokens.colors.navy,
                backgroundColor: tokens.colors.bg,
                border: `1px solid ${tokens.colors.border}`,
                borderRadius: tokens.radius.sm,
              }}
            >
              {BELEG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Stack>

          <Stack gap={2}>
            <Text variant="caption" color="ondo">
              Kanal
            </Text>
            <Row gap={2}>
              {KANAL_OPTIONS.map((k) => {
                const active = k.value === kanal
                return (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKanal(k.value)}
                    disabled={pending}
                    style={{
                      flex: 1,
                      height: 40,
                      borderRadius: tokens.radius.sm,
                      border: `1px solid ${active ? tokens.colors.navy : tokens.colors.border}`,
                      backgroundColor: active ? tokens.colors.navy : tokens.colors.white,
                      color: active ? tokens.colors.white : tokens.colors.navy,
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: pending ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {k.label}
                  </button>
                )
              })}
            </Row>
          </Stack>

          <Stack gap={2}>
            <Text variant="caption" color="ondo">
              Begründung (optional) — wird dem Kunden angezeigt
            </Text>
            <textarea
              value={begruendung}
              onChange={(e) => setBegruendung(e.target.value)}
              disabled={pending}
              rows={3}
              placeholder="z.B. ‚Für die Versicherung brauchen wir die Mietwagen-Rechnung.'"
              style={{
                width: '100%',
                padding: tokens.spacing[3],
                fontSize: 13,
                color: tokens.colors.navy,
                backgroundColor: tokens.colors.bg,
                border: `1px solid ${tokens.colors.border}`,
                borderRadius: tokens.radius.sm,
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </Stack>

          <Row gap={2} justify="end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              style={{
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
              }}
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={pending}
              style={{
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
              }}
            >
              {pending ? 'Wird gesendet…' : 'Anfrage senden'}
            </button>
          </Row>
        </Stack>
      </Modal>
    </>
  )
}
