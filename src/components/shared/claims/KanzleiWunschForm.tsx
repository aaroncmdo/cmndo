'use client'

// AAR-841: Shared Form-Component für Kanzlei-Wunsch-Frage.
//
// Verwendet in drei UI-Stellen:
//   - Self-Service Schritt-4 (Section am Ende, vor Submit)
//   - Dispatcher-Modal nach Lead-Konversion
//   - Re-Frage-Modal im Kunden-Portal nach Phase 4
//
// Aaron-Anpassung 2: Default ist 'noch_unentschieden' — wenn Kunde nichts
// ändert, läuft der Re-Frage-Cron später. Niedrigere Reibung im Submit-Flow.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ScaleIcon, BuildingIcon, XIcon, HelpCircleIcon } from 'lucide-react'
import { setKanzleiWunsch } from '@/lib/kanzlei/actions'

type KanzleiWunsch = 'partnerkanzlei' | 'eigene_kanzlei' | 'keine_kanzlei' | 'noch_unentschieden'

type Props = {
  claimId: string
  gefragtInPhase: 'lead_konvertierung' | 'phase_4_re_frage' | 'kb_override'
  /** Wird nach erfolgreichem Submit aufgerufen — Modal schließen oder weiternavigieren */
  onSuccess?: () => void
  /** Optional: Initial-Wunsch-Wert (z.B. wenn KB einen bereits gesetzten Wunsch ändert) */
  initialWunsch?: KanzleiWunsch
  /** Optional: Submit-Button-Label überschreiben (default: "Speichern") */
  submitLabel?: string
  /** Optional: Compact-Variante ohne explizite Headline */
  variant?: 'card' | 'plain'
}

const OPTIONS: { value: KanzleiWunsch; label: string; sub: string; icon: typeof ScaleIcon }[] = [
  {
    value: 'partnerkanzlei',
    label: 'Ja, eure Partnerkanzlei einbinden',
    sub:   'Empfohlen — wir koordinieren alles',
    icon:  ScaleIcon,
  },
  {
    value: 'eigene_kanzlei',
    label: 'Ja, eine eigene Kanzlei',
    sub:   'Du gibst Kontaktdaten an, wir senden das Paket',
    icon:  BuildingIcon,
  },
  {
    value: 'keine_kanzlei',
    label: 'Nein, ohne Kanzlei',
    sub:   'Wir führen die VS-Kommunikation selbst',
    icon:  XIcon,
  },
  {
    value: 'noch_unentschieden',
    label: 'Weiß ich noch nicht — fragt mich später',
    sub:   'Wir fragen erneut wenn das Gutachten da ist',
    icon:  HelpCircleIcon,
  },
]

export function KanzleiWunschForm({
  claimId,
  gefragtInPhase,
  onSuccess,
  initialWunsch = 'noch_unentschieden',
  submitLabel = 'Speichern',
  variant = 'card',
}: Props) {
  const [wunsch, setWunsch] = useState<KanzleiWunsch>(initialWunsch)
  const [eigeneName,    setEigeneName]    = useState('')
  const [eigeneEmail,   setEigeneEmail]   = useState('')
  const [eigeneTelefon, setEigeneTelefon] = useState('')
  const [eigeneKontakt, setEigeneKontakt] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (wunsch === 'eigene_kanzlei') {
      if (!eigeneName.trim()) {
        toast.error('Kanzlei-Name ist Pflicht')
        return
      }
      if (!eigeneEmail.trim() && !eigeneTelefon.trim()) {
        toast.error('Email oder Telefon der Kanzlei ist Pflicht')
        return
      }
    }

    startTransition(async () => {
      const res = await setKanzleiWunsch({
        claim_id: claimId,
        wunsch,
        eigene_kanzlei: wunsch === 'eigene_kanzlei'
          ? {
              name:          eigeneName,
              email:         eigeneEmail || undefined,
              telefon:       eigeneTelefon || undefined,
              kontaktperson: eigeneKontakt || undefined,
            }
          : undefined,
        gefragt_in_phase: gefragtInPhase,
      })

      if (res.ok) {
        const autoVersendet = res.data?.auto_paket_versendet === true
        toast.success(autoVersendet ? 'Gespeichert. Kanzlei-Paket wurde versendet.' : 'Gespeichert.')
        onSuccess?.()
      } else {
        toast.error(res.error)
      }
    })
  }

  const containerCls = variant === 'card'
    ? 'bg-white rounded-xl border border-claimondo-border p-5 space-y-4'
    : 'space-y-4'

  return (
    <form onSubmit={handleSubmit} className={containerCls}>
      {variant === 'card' && (
        <div>
          <h3 className="text-sm font-semibold text-claimondo-navy">Möchtest du eine Kanzlei einbinden?</h3>
          <p className="text-xs text-claimondo-light-blue mt-0.5">Eine Kanzlei vertritt deine Ansprüche gegenüber der Versicherung.</p>
        </div>
      )}

      <div className="space-y-2">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon
          const checked = wunsch === opt.value
          return (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                checked
                  ? 'border-claimondo-ondo bg-claimondo-ondo/5'
                  : 'border-claimondo-border hover:bg-claimondo-bg'
              }`}
            >
              <input
                type="radio"
                name="kanzlei_wunsch"
                value={opt.value}
                checked={checked}
                onChange={() => setWunsch(opt.value)}
                className="mt-1"
              />
              <Icon className={`w-4 h-4 mt-1 shrink-0 ${checked ? 'text-claimondo-ondo' : 'text-claimondo-light-blue'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${checked ? 'text-claimondo-navy' : 'text-claimondo-navy'}`}>{opt.label}</p>
                <p className="text-xs text-claimondo-light-blue">{opt.sub}</p>
              </div>
            </label>
          )
        })}
      </div>

      {wunsch === 'eigene_kanzlei' && (
        <div className="bg-claimondo-bg rounded-lg p-3 space-y-2 border border-claimondo-border">
          <p className="text-xs font-medium text-claimondo-navy">Kontaktdaten der Kanzlei</p>
          <input
            type="text"
            value={eigeneName}
            onChange={(e) => setEigeneName(e.target.value)}
            placeholder="Kanzlei-Name *"
            className="w-full px-3 py-2 rounded-lg border border-claimondo-border text-sm bg-white"
          />
          <input
            type="email"
            value={eigeneEmail}
            onChange={(e) => setEigeneEmail(e.target.value)}
            placeholder="Email"
            className="w-full px-3 py-2 rounded-lg border border-claimondo-border text-sm bg-white"
          />
          <input
            type="tel"
            value={eigeneTelefon}
            onChange={(e) => setEigeneTelefon(e.target.value)}
            placeholder="Telefon"
            className="w-full px-3 py-2 rounded-lg border border-claimondo-border text-sm bg-white"
          />
          <input
            type="text"
            value={eigeneKontakt}
            onChange={(e) => setEigeneKontakt(e.target.value)}
            placeholder="Ansprechpartner (optional)"
            className="w-full px-3 py-2 rounded-lg border border-claimondo-border text-sm bg-white"
          />
          <p className="text-[11px] text-claimondo-light-blue">Email oder Telefon ist Pflicht.</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-2.5 rounded-lg bg-claimondo-navy text-white text-sm font-medium hover:bg-claimondo-navy disabled:opacity-50 transition-colors"
      >
        {isPending ? 'Wird gespeichert…' : submitLabel}
      </button>
    </form>
  )
}
