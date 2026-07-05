'use client'

// SP4a Task 3 — Werkstatt-Card für die Kunde-Fallakte.
// Zeigt die vermittelte Werkstatt + Reparaturtermin-Status.
// Bei abgelehntem oder fehlendem Termin: Wunschtermin-Vorschlags-UI.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { WrenchIcon } from 'lucide-react'

import { reparaturTerminPhase, type ReparaturTerminStatus } from '@/lib/werkstatt/reparatur-termin-phase'
import { formatBerlin } from '@/lib/google-calendar/timezone'
import { schlageReparaturTerminVorPortal } from '@/app/kunde/faelle/[id]/reparatur-termin-actions'
import { WunschterminPicker } from '@/app/embed/gutachter-finder/_components/WunschterminPicker'
import { StatusBadge } from '@/components/shared/StatusBadge'
import PhoneButton from '@/components/shared/PhoneButton'
import { Card, Button } from '@/components/primitives'
import type { StatusBadgeTone } from '@/components/shared/StatusBadge'

// 1:1 Spiegelung aus WerkstattAuftraege.tsx (SP2) — kein Duplizieren, gleiche Quelle.
const TON_TO_BADGE_TONE: Record<'neutral' | 'info' | 'success' | 'warning', StatusBadgeTone> = {
  neutral: 'neutral',
  info: 'info',
  success: 'success',
  warning: 'warning',
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export type WerkstattCardProps = {
  claimId: string
  werkstatt: {
    name: string
    adresse_strasse: string | null
    adresse_plz: string | null
    adresse_ort: string | null
    telefon: string | null
  }
  termin: {
    id: string
    status: string
    wunschtermin: string | null
    bestaetigter_termin: string | null
    absage_grund: string | null
  } | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Vorschlags-UI (Wunschtermin eingeben + absenden)
// ─────────────────────────────────────────────────────────────────────────────

function VorschlagsUI({ claimId }: { claimId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [wunschtermin, setWunschtermin] = useState('')

  async function handleVorschlagen() {
    if (!wunschtermin) return
    const res = await schlageReparaturTerminVorPortal(claimId, wunschtermin)
    if (!res.ok) {
      toast.error(res.error ?? 'Fehler')
      return
    }
    toast.success('Wunschtermin gesendet.')
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-3 pt-1">
      <WunschterminPicker value={wunschtermin} onChange={setWunschtermin} />
      <Button
        variant="navy"
        size="sm"
        disabled={!wunschtermin}
        loading={isPending}
        onClick={handleVorschlagen}
      >
        Wunschtermin vorschlagen
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Haupt-Komponente
// ─────────────────────────────────────────────────────────────────────────────

export default function WerkstattCard({ claimId, werkstatt, termin }: WerkstattCardProps) {
  const adresseZeile1 = werkstatt.adresse_strasse ?? null
  const adresseZeile2 = [werkstatt.adresse_plz, werkstatt.adresse_ort].filter(Boolean).join(' ') || null

  // Termin-Phase ermitteln (null = noch kein Termin)
  const status = termin ? (termin.status as ReparaturTerminStatus) : null
  const phase = reparaturTerminPhase(status)
  const badgeTone = TON_TO_BADGE_TONE[phase.ton]

  // Zeitanzeige: bestätigter Termin bevorzugt, sonst Wunschtermin
  const terminIso = termin?.bestaetigter_termin ?? termin?.wunschtermin ?? null
  const terminAnzeige = terminIso
    ? formatBerlin(terminIso, {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' Uhr'
    : null

  const zeigeVorschlagsUI = !termin || termin.status === 'abgelehnt'

  return (
    <Card>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <WrenchIcon className="w-5 h-5 text-claimondo-ondo" />
          <h2 className="text-sm font-semibold text-claimondo-navy">Deine Werkstatt</h2>
        </div>

        {/* Werkstatt-Infos */}
        <div className="space-y-1">
          <p className="font-semibold text-claimondo-navy">{werkstatt.name}</p>
          {adresseZeile1 && (
            <p className="text-body-sm text-claimondo-ondo">{adresseZeile1}</p>
          )}
          {adresseZeile2 && (
            <p className="text-body-sm text-claimondo-ondo">{adresseZeile2}</p>
          )}
          {werkstatt.telefon && (
            <PhoneButton nummer={werkstatt.telefon} variant="inline" />
          )}
        </div>

        {/* Termin-Zustand */}
        {termin && termin.status !== 'abgelehnt' && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge tone={badgeTone} size="xs">{phase.label}</StatusBadge>
            </div>
            {terminAnzeige && (
              <p className="text-body-sm text-claimondo-navy">
                {termin.status === 'bestaetigt' ? 'Bestätigt: ' : 'Wunschtermin: '}
                {terminAnzeige}
              </p>
            )}
          </div>
        )}

        {/* Abgelehnt-Hinweis */}
        {termin?.status === 'abgelehnt' && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <StatusBadge tone={badgeTone} size="xs">{phase.label}</StatusBadge>
            </div>
            <p className="text-body-sm text-claimondo-ondo">
              Die Werkstatt konnte deinen Wunschtermin leider nicht annehmen.
            </p>
            {termin.absage_grund && (
              <p className="text-body-sm text-claimondo-ondo">
                Grund: {termin.absage_grund}
              </p>
            )}
          </div>
        )}

        {/* Vorschlags-UI — bei abgelehntem oder fehlendem Termin */}
        {zeigeVorschlagsUI && <VorschlagsUI claimId={claimId} />}
      </div>
    </Card>
  )
}
