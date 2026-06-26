'use client'

// Werkstatt-Box in der Fallakte: zeigt die Werkstatt-KVA-Schaetzung (Snapshot, getrennt
// vom SV-Gutachten) + die Reparaturfreigabe. Staff (admin/KB) kann hier „Reparatur
// freigeben" — die Werkstatt sieht den Status in „Meine Vermittlungen".
// Record-Cast wegen Type-Lag (AGENTS §6).

import { useState } from 'react'
import { WrenchIcon, CheckCircle2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { useFall } from '../FallContext'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives'
import { reparaturFreigeben, reparaturFreigabeZuruecknehmen } from '../_actions/reparatur-freigabe'

const kvaFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

export function WerkstattKvaSection() {
  const { claim, userRolle, refreshFall } = useFall()
  const [saving, setSaving] = useState(false)

  const rec = claim as Record<string, unknown> | null
  const werkstattId = (rec?.werkstatt_id as string | null) ?? null
  const brutto = rec?.kostenvoranschlag_brutto as number | null
  const netto = rec?.kostenvoranschlag_netto as number | null
  const betrag = brutto ?? netto
  const claimId = rec?.id as string | undefined
  const freigegebenAm = (rec?.reparatur_freigegeben_am as string | null) ?? null

  // Nur fuer werkstatt-vermittelte Faelle (oder wenn ein KVA-Betrag vorliegt).
  if (!werkstattId && betrag == null) return null

  const istStaff = userRolle === 'admin' || userRolle === 'kundenbetreuer'

  async function setFreigabe(frei: boolean) {
    if (!claimId) return
    setSaving(true)
    try {
      const res = frei
        ? await reparaturFreigeben(claimId)
        : await reparaturFreigabeZuruecknehmen(claimId)
      if (!res.ok) {
        toast.error(res.error ?? 'Fehler')
        return
      }
      toast.success(frei ? 'Reparatur freigegeben.' : 'Freigabe zurückgenommen.')
      refreshFall()
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard
      icon={<WrenchIcon className="w-4 h-4 text-claimondo-ondo/70" />}
      title="Werkstatt-Vermittlung"
      hint="getrennte Spur vom SV-Gutachten"
    >
      {betrag != null && (
        <div className="flex items-baseline gap-2">
          <span className="text-body font-semibold text-claimondo-navy">{kvaFormat.format(betrag)}</span>
          {brutto == null && netto != null && <span className="text-caption text-claimondo-ondo/70">(Netto)</span>}
          <span className="text-caption text-claimondo-ondo/70">Werkstatt-KVA</span>
        </div>
      )}

      <div className="mt-3 border-t border-claimondo-border pt-3">
        {freigegebenAm ? (
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-body-sm font-medium text-success-strong">
              <CheckCircle2Icon className="w-4 h-4" /> Reparatur freigegeben
            </span>
            {istStaff && (
              <Button variant="ghost" size="sm" loading={saving} onClick={() => setFreigabe(false)}>
                Zurücknehmen
              </Button>
            )}
          </div>
        ) : istStaff ? (
          <Button
            variant="navy"
            size="sm"
            loading={saving}
            onClick={() => setFreigabe(true)}
            iconLeft={<CheckCircle2Icon className="w-4 h-4" />}
          >
            Reparatur freigeben
          </Button>
        ) : (
          <span className="text-caption text-claimondo-ondo/70">Reparatur noch nicht freigegeben.</span>
        )}
      </div>
    </SectionCard>
  )
}
