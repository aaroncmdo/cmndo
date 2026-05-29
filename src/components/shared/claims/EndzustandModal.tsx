'use client'

// AAR-840: Endzustand-Modal
//
// Vier Modi: in_kommunikation_vs / reguliert / abgelehnt / storniert.
// Ruft die passende markClaimAs*-Server-Action. Pflicht-Felder pro Modus
// werden client-seitig validiert; Server-Action validiert nochmal serverseitig.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CheckCircleIcon, XCircleIcon, PauseCircleIcon, PhoneCallIcon, AlertTriangleIcon, ScaleIcon, ClockIcon } from 'lucide-react'
import { Modal } from '@/components/primitives'
import {
  markClaimAsInKommunikationVs,
  markClaimAsReguliert,
  markClaimAsAbgelehnt,
  markClaimAsStorniert,
  markClaimAsKlage,
  markClaimAsVerjaehrt,
} from '@/lib/claims/endzustand-actions'

export type EndzustandMode = 'in_kommunikation_vs' | 'reguliert' | 'abgelehnt' | 'storniert' | 'klage_rechtsstreit' | 'verjaehrt'

const TITLES: Record<EndzustandMode, { label: string; sublabel: string; icon: typeof CheckCircleIcon }> = {
  in_kommunikation_vs: {
    label:    'In Kommunikation mit Versicherung',
    sublabel: 'Phase 6 manuell setzen — Kunde sieht „Wir verhandeln gerade"',
    icon:     PhoneCallIcon,
  },
  reguliert: {
    label:    'Schaden regulieren',
    sublabel: 'Endzustand: Versicherung hat akzeptiert + zahlt',
    icon:     CheckCircleIcon,
  },
  abgelehnt: {
    label:    'Schaden ablehnen',
    sublabel: 'VS lehnt ab — vorläufig (nachforderbar) oder endgültig (Abschluss)',
    icon:     XCircleIcon,
  },
  storniert: {
    label:    'Schaden stornieren',
    sublabel: 'Endzustand: Bearbeitung gestoppt — irreversibel',
    icon:     PauseCircleIcon,
  },
  klage_rechtsstreit: {
    label:    'Klage / Rechtsstreit',
    sublabel: 'Endzustand: Fall geht in den Rechtsstreit',
    icon:     ScaleIcon,
  },
  verjaehrt: {
    label:    'Verjährt',
    sublabel: 'Endzustand: Anspruch ist verjährt',
    icon:     ClockIcon,
  },
}

const ABLEHNUNGS_GRUENDE: { value: string; label: string }[] = [
  { value: 'verjaehrung',                 label: 'Verjährung' },
  { value: 'haftung_strittig',            label: 'Haftung strittig' },
  { value: 'fahrzeug_bereits_repariert',  label: 'Fahrzeug bereits repariert' },
  { value: 'vollmacht_fehlt',             label: 'Vollmacht fehlt' },
  { value: 'sonstiges',                   label: 'Sonstiges' },
]

type Props = {
  open: boolean
  onClose: () => void
  claimId: string
  mode: EndzustandMode
}

export function EndzustandModal({ open, onClose, claimId, mode }: Props) {
  const [grund, setGrund] = useState('')
  const [regulierungsBetrag, setRegulierungsBetrag] = useState('')
  const [vsAblehnungsGrund, setVsAblehnungsGrund] = useState('verjaehrung')
  const [stornoConfirm, setStornoConfirm] = useState('')
  const [ablehnungFinal, setAblehnungFinal] = useState(false)
  const [notifyCustomer, setNotifyCustomer] = useState(
    mode === 'storniert' || mode === 'in_kommunikation_vs' || mode === 'verjaehrt' ? false : true,
  )
  const [isPending, startTransition] = useTransition()

  const t = TITLES[mode]
  const Icon = t.icon

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!grund.trim()) {
      toast.error('Begründung ist Pflicht')
      return
    }
    if (mode === 'reguliert') {
      const betrag = Number.parseFloat(regulierungsBetrag.replace(',', '.'))
      if (!(betrag > 0)) {
        toast.error('Regulierungsbetrag muss positiv sein')
        return
      }
    }
    if (mode === 'storniert' && stornoConfirm.trim().toUpperCase() !== 'STORNIEREN') {
      toast.error('Bitte STORNIEREN zur Bestätigung eintippen')
      return
    }

    startTransition(async () => {
      let res: { ok: boolean; error?: string } = { ok: false }
      if (mode === 'in_kommunikation_vs') {
        res = await markClaimAsInKommunikationVs({
          claim_id: claimId,
          grund,
          notify_customer: notifyCustomer,
        })
      } else if (mode === 'reguliert') {
        res = await markClaimAsReguliert({
          claim_id: claimId,
          regulierungs_betrag: Number.parseFloat(regulierungsBetrag.replace(',', '.')),
          grund,
          notify_customer: notifyCustomer,
        })
      } else if (mode === 'abgelehnt') {
        res = await markClaimAsAbgelehnt({
          claim_id: claimId,
          vs_ablehnungs_grund: vsAblehnungsGrund,
          grund_freitext: grund,
          final: ablehnungFinal,
          notify_customer: notifyCustomer,
        })
      } else if (mode === 'storniert') {
        res = await markClaimAsStorniert({
          claim_id: claimId,
          grund,
          notify_customer: notifyCustomer,
        })
      } else if (mode === 'klage_rechtsstreit') {
        res = await markClaimAsKlage({
          claim_id: claimId,
          grund,
          notify_customer: notifyCustomer,
        })
      } else if (mode === 'verjaehrt') {
        res = await markClaimAsVerjaehrt({
          claim_id: claimId,
          grund,
          notify_customer: notifyCustomer,
        })
      }

      if (res.ok) {
        toast.success(`${t.label} — gesetzt`)
        // Reset
        setGrund('')
        setRegulierungsBetrag('')
        setStornoConfirm('')
        onClose()
      } else {
        toast.error(res.error ?? 'Aktion fehlgeschlagen')
      }
    })
  }

  return (
    <Modal open={open} onClose={onClose} ariaLabel={t.label} maxWidth={520}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-claimondo-navy/10 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-claimondo-navy" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-claimondo-navy">{t.label}</h2>
            <p className="text-xs text-claimondo-light-blue mt-0.5">{t.sublabel}</p>
          </div>
        </div>

        {/* Mode-spezifische Felder */}
        {mode === 'reguliert' && (
          <div>
            <label className="block text-xs font-medium text-claimondo-navy mb-1">
              Regulierungsbetrag (EUR) <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={regulierungsBetrag}
              onChange={(e) => setRegulierungsBetrag(e.target.value)}
              placeholder="z.B. 4500.00"
              className="w-full px-3 py-2 rounded-ios-lg border border-claimondo-border text-sm focus:outline-none focus:ring-2 focus:ring-claimondo-ondo"
            />
          </div>
        )}

        {mode === 'abgelehnt' && (
          <>
            <div>
              <label className="block text-xs font-medium text-claimondo-navy mb-1">
                Ablehnungsgrund <span className="text-red-600">*</span>
              </label>
              <select
                value={vsAblehnungsGrund}
                onChange={(e) => setVsAblehnungsGrund(e.target.value)}
                className="w-full px-3 py-2 rounded-ios-lg border border-claimondo-border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-claimondo-ondo"
              >
                {ABLEHNUNGS_GRUENDE.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-claimondo-navy mb-1">
                Art der Ablehnung
              </label>
              <select
                value={ablehnungFinal ? 'final' : 'vorlaeufig'}
                onChange={(e) => setAblehnungFinal(e.target.value === 'final')}
                className="w-full px-3 py-2 rounded-ios-lg border border-claimondo-border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-claimondo-ondo"
              >
                <option value="vorlaeufig">Vorläufig — Nachforderung möglich (bleibt in Regulierung)</option>
                <option value="final">Endgültig — Abschluss</option>
              </select>
            </div>
          </>
        )}

        {/* Begründung — immer Pflicht */}
        <div>
          <label className="block text-xs font-medium text-claimondo-navy mb-1">
            Begründung (Audit) <span className="text-red-600">*</span>
          </label>
          <textarea
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
            rows={3}
            placeholder={
              mode === 'reguliert'    ? 'z.B. „4500€ vom Kunden akzeptiert"'
              : mode === 'abgelehnt'  ? 'z.B. „VS lehnt mit Verweis auf §… ab"'
              : mode === 'storniert'  ? 'z.B. „Kunde wünscht Abbruch der Bearbeitung"'
              :                          'z.B. „Telefonat mit Frau Müller von Allianz, Az 123/456"'
            }
            className="w-full px-3 py-2 rounded-ios-lg border border-claimondo-border text-sm focus:outline-none focus:ring-2 focus:ring-claimondo-ondo"
          />
        </div>

        {/* Storno-Confirm (Schutz vor versehentlichem Klick) */}
        {mode === 'storniert' && (
          <div className="bg-amber-50 border border-amber-200 rounded-ios-lg p-3 text-xs flex items-start gap-2">
            <AlertTriangleIcon className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <p className="text-amber-900">
                Stornierung ist irreversibel. Tippe <strong>STORNIEREN</strong> zur Bestätigung.
              </p>
              <input
                type="text"
                value={stornoConfirm}
                onChange={(e) => setStornoConfirm(e.target.value)}
                placeholder="STORNIEREN"
                className="w-full px-2 py-1.5 rounded border border-amber-300 text-sm font-mono"
              />
            </div>
          </div>
        )}

        {/* Notify-Toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={notifyCustomer}
            onChange={(e) => setNotifyCustomer(e.target.checked)}
            className="w-4 h-4 rounded border-claimondo-light-blue"
          />
          <span className="text-sm text-claimondo-navy">Kunde informieren (WhatsApp + Email)</span>
        </label>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-2 border-t border-claimondo-border">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 rounded-ios-lg border border-claimondo-border text-sm text-claimondo-light-blue hover:bg-claimondo-bg disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded-ios-lg bg-claimondo-navy text-white text-sm font-medium hover:bg-claimondo-navy disabled:opacity-50"
          >
            {isPending ? 'Wird gespeichert…' : t.label}
          </button>
        </div>
      </form>
    </Modal>
  )
}
