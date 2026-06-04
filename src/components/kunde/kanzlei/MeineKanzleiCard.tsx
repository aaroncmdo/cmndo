'use client'

// AAR-765: „Meine Kanzlei"-Sektion in der Kunde-Fallakte.
// Zeigt die dem Fall zugeordnete Partnerkanzlei (LexDrive o.Ä.) mit
// Ansprechpartner, Kontaktdaten und Quick-Actions. Ersetzt das dünne
// Hardcode-Pattern aus SaeuleMeinAnwalt (welches nur LexDrive kannte).

import {
  ScaleIcon,
  CheckCircle2Icon,
  ClockIcon,
  PhoneIcon,
  MailIcon,
  MapPinIcon,
  MessageSquareIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Card, Stack, Row, Text, Icon } from '@/components/primitives'
import { tokens } from '@/lib/design-tokens'

export type MeineKanzleiProps = {
  kanzlei: {
    name: string | null
    email: string | null
    adresse: string | null
  } | null
  /** Fall-spezifische Ansprechpartner-Daten, stechen die Kanzlei-Default-
   *  Werte (kanzleien.ansprechpartner / kanzleien.email) */
  ansprechpartner: {
    name: string | null
    position: string | null
    email: string | null
    telefon: string | null
  }
  vollmachtSigniertAm: string | null
  uebergebenAm: string | null
}

const LEXDRIVE_WHATSAPP = '4932221096850'

export function MeineKanzleiCard({
  kanzlei,
  ansprechpartner,
  vollmachtSigniertAm,
  uebergebenAm,
}: MeineKanzleiProps) {
  const t = useTranslations('meineKanzlei')
  // Card versteckt sich wenn weder Kanzlei noch Ansprechpartner-Name gesetzt
  // ist — dann hat der Fall noch keine Kanzlei-Verbindung.
  const hatKanzlei = !!kanzlei?.name || !!ansprechpartner.name
  if (!hatKanzlei) return null

  const kanzleiName = kanzlei?.name ?? 'LexDrive'
  const apName = ansprechpartner.name ?? kanzleiName
  const apEmail = ansprechpartner.email ?? kanzlei?.email ?? null
  const apTel = ansprechpartner.telefon ?? null
  const apPos = ansprechpartner.position ?? t('fachanwaltDefault')
  const waHref = `https://wa.me/${LEXDRIVE_WHATSAPP}?text=${encodeURIComponent(t('whatsappIntro'))}`

  return (
    <Card p={5}>
      <Stack gap={4}>
        <Row gap={2} align="center" justify="between">
          <Row gap={2} align="center">
            <Icon icon={ScaleIcon} size={18} color="ondo" />
            <Text variant="headingSm" color="navy">
              {t('titel')}
            </Text>
          </Row>
          {vollmachtSigniertAm ? (
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
                color: 'var(--brand-success, #059669)',
                backgroundColor: 'var(--brand-success-soft, #ecfdf5)',
              }}
            >
              <CheckCircle2Icon size={10} />
              {t('vollmachtErteilt')}
            </span>
          ) : uebergebenAm ? (
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
                color: 'var(--brand-warning, #d97706)',
                backgroundColor: 'var(--brand-warning-soft, #fffbeb)',
              }}
            >
              <ClockIcon size={10} />
              {t('vollmachtAusstehend')}
            </span>
          ) : null}
        </Row>

        <Stack gap={1}>
          <Text variant="bodyXs" color="ondo">
            {t('ansprechpartner')}
          </Text>
          <Text variant="body" color="navy">
            {apName}
          </Text>
          <Text variant="bodyXs" color="ondo">
            {apPos} · {kanzleiName}
          </Text>
        </Stack>

        {(apTel || apEmail || kanzlei?.adresse) && (
          <Stack gap={2}>
            {apTel && (
              <Row gap={2} align="center">
                <Icon icon={PhoneIcon} size={14} color="ondo" />
                <a
                  href={`tel:${apTel.replace(/\s/g, '')}`}
                  style={{ fontSize: 13, color: tokens.colors.navy, textDecoration: 'none' }}
                >
                  {apTel}
                </a>
              </Row>
            )}
            {apEmail && (
              <Row gap={2} align="center">
                <Icon icon={MailIcon} size={14} color="ondo" />
                <a
                  href={`mailto:${apEmail}`}
                  style={{
                    fontSize: 13,
                    color: tokens.colors.navy,
                    textDecoration: 'none',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {apEmail}
                </a>
              </Row>
            )}
            {kanzlei?.adresse && (
              <Row gap={2} align="center">
                <Icon icon={MapPinIcon} size={14} color="ondo" />
                <Text variant="bodySm" color="navy">
                  {kanzlei.adresse}
                </Text>
              </Row>
            )}
          </Stack>
        )}

        <Row gap={2}>
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              height: 40,
              borderRadius: tokens.radius.sm,
              backgroundColor: tokens.colors.navy,
              color: tokens.colors.white,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <MessageSquareIcon size={14} />
            {t('whatsappChat')}
          </a>
          {apTel && (
            <a
              href={`tel:${apTel.replace(/\s/g, '')}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                height: 40,
                paddingInline: tokens.spacing[4],
                borderRadius: tokens.radius.sm,
                border: `1px solid ${tokens.colors.border}`,
                backgroundColor: tokens.colors.white,
                color: tokens.colors.navy,
                fontSize: 13,
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              <PhoneIcon size={14} />
              {t('anrufen')}
            </a>
          )}
        </Row>

        <Text variant="bodyXs" color="ondo">
          {t('rechtsText')}
        </Text>
      </Stack>
    </Card>
  )
}
