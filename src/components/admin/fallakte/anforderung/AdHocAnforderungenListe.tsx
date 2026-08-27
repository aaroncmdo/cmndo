'use client'

// AAR-762 Phase 3: Liste offener Ad-hoc-Anforderungen mit Aktionen
// (Upload-Link kopieren, Anfrage stornieren, erneut senden).
// Katalog-basierte Anforderungen haben eigene Liste (AnforderungenListe).

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  Link2Icon,
  MailIcon,
  MessageCircleIcon,
  PhoneIcon,
  RotateCcwIcon,
  SendIcon,
  XCircleIcon,
  FileTextIcon,
  CheckCircle2Icon,
  ClockIcon,
  AlertTriangleIcon,
} from 'lucide-react'
import { Card, Stack, Row, Text, Icon } from '@/components/primitives'
import { tokens } from '@/lib/design-tokens'
import {
  cancelAdHocAnforderung,
  resendAdHocAnforderung,
  type AdHocAnforderungRow,
} from '@/lib/dokumente/ad-hoc-anforderung'
import { resolveAdhocAnforderungStatus, type AdhocToneKey } from '@/lib/dokumente/adhoc-status'

type Props = {
  anforderungen: AdHocAnforderungRow[]
}

const KANAL_ICON: Record<string, typeof MessageCircleIcon> = {
  whatsapp: MessageCircleIcon,
  sms: PhoneIcon,
  email: MailIcon,
}

const KANAL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'E-Mail',
}

// Ton -> Icon/Farbe. Das WELCHER-Ton (+ Label + canAct) lebt in der puren,
// getesteten resolveAdhocAnforderungStatus (drift-fest gegen das DB-Vokabular
// gesendet/teilweise/komplett/abgelaufen).
const TONE_STYLE: Record<AdhocToneKey, { icon: typeof ClockIcon; color: string; bg: string }> = {
  done: { icon: CheckCircle2Icon, color: '#059669', bg: '#ecfdf5' },
  terminal: { icon: XCircleIcon, color: '#6b7280', bg: '#f3f4f6' },
  expired: { icon: AlertTriangleIcon, color: '#dc2626', bg: '#fef2f2' },
  open: { icon: ClockIcon, color: '#d97706', bg: '#fffbeb' },
}

export function AdHocAnforderungenListe({ anforderungen }: Props) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  if (anforderungen.length === 0) return null

  function handleCopy(url: string) {
    navigator.clipboard.writeText(url).then(
      () => toast.success('Upload-Link kopiert'),
      () => toast.error('Kopieren fehlgeschlagen'),
    )
  }

  function handleCancel(id: string) {
    setPendingId(id)
    startTransition(async () => {
      const r = await cancelAdHocAnforderung(id)
      setPendingId(null)
      if (r.success) {
        toast.success('Anfrage storniert')
        router.refresh()
      } else {
        toast.error(r.error ?? 'Stornieren fehlgeschlagen')
      }
    })
  }

  function handleResend(id: string) {
    setPendingId(id)
    startTransition(async () => {
      const r = await resendAdHocAnforderung(id)
      setPendingId(null)
      if (r.success) {
        toast.success('Anfrage erneut gesendet')
        router.refresh()
      } else {
        toast.error(r.error ?? 'Resend fehlgeschlagen')
      }
    })
  }

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
          <Icon icon={SendIcon} size={14} color="ondo" />
          <Text variant="caption" color="ondo">
            Ad-hoc Dokument-Anforderungen ({anforderungen.length})
          </Text>
        </Row>
      </div>
      <Stack gap={0}>
        {anforderungen.map((a, i) => {
          const view = resolveAdhocAnforderungStatus(a.status, a.expires_at)
          const toneStyle = TONE_STYLE[view.toneKey]
          const StatusIcon = toneStyle.icon
          const KanalIcon = KANAL_ICON[a.kanal] ?? MessageCircleIcon
          const expired = view.expired
          const canAct = view.canAct
          const busy = pendingId === a.id
          return (
            <div
              key={a.id}
              style={{
                paddingInline: tokens.spacing[4],
                paddingBlock: tokens.spacing[3],
                borderTop: i > 0 ? `1px solid ${tokens.colors.border}` : 'none',
              }}
            >
              <Row gap={3} align="center" justify="between">
                <div style={{ display: 'flex', gap: tokens.spacing[2], alignItems: 'center', minWidth: 0, flex: 1 }}>
                  <Icon icon={FileTextIcon} size={14} color="ondo" />
                  <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <Text variant="bodySm" color="navy" truncate>
                      {a.label}
                    </Text>
                    <Row gap={2} align="center">
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 10,
                          color: tokens.colors.ondo,
                        }}
                      >
                        <KanalIcon size={10} /> {KANAL_LABEL[a.kanal] ?? a.kanal}
                      </span>
                      <Text variant="bodyXs" color="ondo">
                        Gesendet:{' '}
                        {new Date(a.gesendet_am).toLocaleDateString('de-DE', {
                          timeZone: 'Europe/Berlin',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </Text>
                      {canAct && (
                        <Text variant="bodyXs" color={expired ? 'danger' : 'ondo'}>
                          Läuft ab:{' '}
                          {new Date(a.expires_at).toLocaleDateString('de-DE', {
                            timeZone: 'Europe/Berlin',
                            day: '2-digit',
                            month: '2-digit',
                          })}
                        </Text>
                      )}
                    </Row>
                  </div>
                </div>

                <Row gap={2} align="center">
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 10,
                      fontWeight: 500,
                      paddingInline: 8,
                      paddingBlock: 3,
                      borderRadius: tokens.radius.full,
                      color: toneStyle.color,
                      backgroundColor: toneStyle.bg,
                    }}
                  >
                    <StatusIcon size={10} />
                    {view.label}
                  </span>

                  {canAct && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleCopy(a.upload_url)}
                        title="Upload-Link kopieren"
                        style={iconBtnStyle}
                      >
                        <Link2Icon size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResend(a.id)}
                        disabled={busy}
                        title="Erneut senden"
                        style={iconBtnStyle}
                      >
                        <RotateCcwIcon size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancel(a.id)}
                        disabled={busy}
                        title="Anfrage stornieren"
                        style={{ ...iconBtnStyle, color: 'var(--brand-danger, #dc2626)' }}
                      >
                        <XCircleIcon size={14} />
                      </button>
                    </>
                  )}
                </Row>
              </Row>
            </div>
          )
        })}
      </Stack>
    </Card>
  )
}

const iconBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: tokens.radius.sm,
  border: `1px solid ${tokens.colors.border}`,
  backgroundColor: tokens.colors.white,
  color: tokens.colors.navy,
  cursor: 'pointer',
}
