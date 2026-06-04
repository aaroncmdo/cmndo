'use client'

// AAR-761 Phase 2: Kunde-Upload-Card für Belege (Mietwagen-Rechnung,
// Werkstatt-Rechnung, Abschlepp-Rechnung, Attest, Sonstiges).
//
// Flow:
//   1. Kunde waehlt Typ aus Dropdown
//   2. Kamera-Capture oder File-Picker
//   3. File als Base64 an /api/ocr-beleg geschickt
//   4. OCR laeuft serverseitig (Claude-Vision Sonnet 4.6)
//   5. Eintrag in fall_dokumente mit ocr_extracted_data
//   6. Kunde sieht "Hochgeladen — KB prüft" Toast, Card zeigt letzten Upload
//
// KB-Review-UI kommt in AAR-761 Phase 3. Dieser Card zeigt dem Kunden
// nur dass sein Upload angekommen ist.

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { CameraIcon, CheckCircle2Icon, FileTextIcon, Loader2Icon, UploadIcon } from 'lucide-react'
import { Card, Stack, Row, Text, Icon } from '@/components/primitives'
import { tokens } from '@/lib/design-tokens'
import type { BelegTyp } from '@/lib/ocr-beleg/types'

type BelegUploadCardProps = {
  fallId: string
}

// Portal-i18n: Die `value`-Werte sind der DB-/Server-Vertrag (an /api/ocr-beleg
// durchgereicht + persistiert) — sie bleiben deutsch/stabil. Nur die ANZEIGE
// (Label + Beschreibung) wird über die i18n-Keys lokalisiert (analog
// BeratungBuchen-THEMEN).
type BelegTypOption = {
  value: BelegTyp
  labelKey: string
  beschreibungKey: string
}

const OPTIONS: BelegTypOption[] = [
  {
    value: 'mietwagen_rechnung',
    labelKey: 'optMietwagenLabel',
    beschreibungKey: 'optMietwagenBeschreibung',
  },
  {
    value: 'werkstatt_rechnung',
    labelKey: 'optWerkstattLabel',
    beschreibungKey: 'optWerkstattBeschreibung',
  },
  {
    value: 'abschlepp_rechnung',
    labelKey: 'optAbschleppLabel',
    beschreibungKey: 'optAbschleppBeschreibung',
  },
  {
    value: 'attest',
    labelKey: 'optAttestLabel',
    beschreibungKey: 'optAttestBeschreibung',
  },
  {
    value: 'sonstiges',
    labelKey: 'optSonstigesLabel',
    beschreibungKey: 'optSonstigesBeschreibung',
  },
]

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function BelegUploadCard({ fallId }: BelegUploadCardProps) {
  const t = useTranslations('belegUpload')
  // Lokalisiertes Anzeige-Label für einen (deutschen) BelegTyp-Vertragswert.
  const labelFor = (value: BelegTyp) => {
    const opt = OPTIONS.find((o) => o.value === value)
    return opt ? t(opt.labelKey) : value
  }
  const [typ, setTyp] = useState<BelegTyp>('mietwagen_rechnung')
  const [uploading, setUploading] = useState(false)
  const [lastSuccess, setLastSuccess] = useState<{ typ: BelegTyp; at: Date } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const base64 = await fileToBase64(file)
      const res = await fetch('/api/ocr-beleg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fall_id: fallId, typ, image_base64: base64 }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? t('fehlerUpload'))
      }
      setLastSuccess({ typ, at: new Date() })
      toast.success(t('toastErfolg', { label: labelFor(typ) }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('fehlerUpload'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const selectedOption = OPTIONS.find((o) => o.value === typ)!

  return (
    <Card p={5}>
      <Stack gap={4}>
        <Stack gap={1}>
          <Row gap={2} align="center">
            <Icon icon={UploadIcon} size={18} color="ondo" />
            <Text variant="headingSm" color="navy">
              {t('titel')}
            </Text>
          </Row>
          <Text variant="bodySm" color="ondo">
            {t('sub')}
          </Text>
        </Stack>

        <Stack gap={2}>
          <Text variant="caption" color="ondo">
            {t('dokumenttyp')}
          </Text>
          <select
            value={typ}
            onChange={(e) => setTyp(e.target.value as BelegTyp)}
            disabled={uploading}
            style={{
              width: '100%',
              height: 44,
              paddingLeft: tokens.spacing[3],
              paddingRight: tokens.spacing[3],
              fontSize: 14,
              color: tokens.colors.navy,
              backgroundColor: tokens.colors.bg,
              border: `1px solid ${tokens.colors.border}`,
              borderRadius: tokens.radius.sm,
            }}
          >
            {OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
          <Text variant="bodyXs" color="ondo">
            {t(selectedOption.beschreibungKey)}
          </Text>
        </Stack>

        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
          }}
        />

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            width: '100%',
            height: 52,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: tokens.spacing[2],
            borderRadius: tokens.radius.sm,
            border: 'none',
            cursor: uploading ? 'progress' : 'pointer',
            backgroundColor: uploading ? tokens.colors.border : tokens.colors.navy,
            color: tokens.colors.white,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {uploading ? (
            <>
              <Loader2Icon size={16} className="animate-spin" />
              {t('wirdAusgelesen')}
            </>
          ) : (
            <>
              <CameraIcon size={16} />
              {t('fotoOderDatei')}
            </>
          )}
        </button>

        {lastSuccess && (
          <Row
            gap={2}
            align="center"
            p={3}
            bg="bg"
            radius="sm"
          >
            <CheckCircle2Icon size={16} style={{ color: tokens.colors.success, flexShrink: 0 }} />
            <Stack gap={0}>
              <Text variant="bodySm" color="navy">
                {t('erfolgHochgeladen', { label: labelFor(lastSuccess.typ) })}
              </Text>
              <Text variant="bodyXs" color="ondo">
                {t('erfolgSub')}
              </Text>
            </Stack>
          </Row>
        )}

        <Row gap={1} align="center">
          <Icon icon={FileTextIcon} size={12} color="ondo" />
          <Text variant="bodyXs" color="ondo">
            {t('formatHinweis')}
          </Text>
        </Row>
      </Stack>
    </Card>
  )
}
