'use client'

import { useState, useTransition } from 'react'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/primitives'
import { setzeNetzwerkComped } from './netzwerk-abo-actions'

// Admin-Netzwerk-Sektion (SV-Detail): macht den Netzwerkpartner-Status sichtbar
// (Matching-Override P1.4, Whitelabel-Perk, Provisions-Suppression haengen daran)
// und bietet den EINZIGEN admin-gefuehrten Hebel: comped setzen/entziehen.
// Stripe-gefuehrte Abos (aktiv/ueberfaellig) sind hier bewusst read-only.

export type NetzwerkAboRow = {
  id: string
  status: string
  gueltigBis: string | null
  stripeSubscriptionId: string | null
  erstelltAm: string
  /** Server-abgeleitet via istAktivesAbo (comped/aktiv & nicht abgelaufen). */
  istAktiv: boolean
}

type Props = {
  svId: string
  abos: NetzwerkAboRow[]
  loadError: string | null
}

const STRIPE_GEFUEHRT = new Set(['aktiv', 'ueberfaellig'])
const inputCls = 'rounded-ios-sm border border-claimondo-border px-2 py-1 text-body-xs bg-white'

export default function NetzwerkAboSektion({ svId, abos, loadError }: Props) {
  const [pending, startTransition] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)
  const [gueltigBis, setGueltigBis] = useState('')
  const [grund, setGrund] = useState('')

  // Nur ein AKTIVES comped blockt das Freistellen; ein abgelaufenes darf erneuert werden.
  const hatAktivComped = abos.some((a) => a.status === 'comped' && a.istAktiv)
  const hatComped = abos.some((a) => a.status === 'comped')
  const hatStripeAbo = abos.some((a) => STRIPE_GEFUEHRT.has(a.status))

  function toggle(ziel: 'setzen' | 'entziehen') {
    const frage = ziel === 'setzen'
      ? 'Diesen SV als Netzwerkpartner freistellen (comped)? Er rankt dann im Matching über kostenfreien SVs und erhält die Partner-Perks (Whitelabel, Provisions-Suppression im Freundes-Graph) — ohne Stripe-Abrechnung.'
      : 'Comped-Freistellung entziehen? Der SV verliert Matching-Vorrang und Partner-Perks (sofern kein zahlendes Stripe-Abo besteht).'
    if (!confirm(frage)) return

    setFehler(null)
    startTransition(async () => {
      const opts = ziel === 'setzen' ? { gueltigBis: gueltigBis || null, grund } : undefined
      const res = await setzeNetzwerkComped(svId, ziel, opts)
      if (!res.ok) setFehler(res.error ?? 'Unbekannter Fehler')
      else if (ziel === 'setzen') { setGueltigBis(''); setGrund('') }
    })
  }

  return (
    <SectionCard
      title="Netzwerkpartner"
      hint={abos.length === 0 ? <StatusBadge domain="netzwerk-abo" code="kein_abo" /> : undefined}
    >
      {loadError ? (
        <p className="text-body-xs text-danger">Netzwerk-Abo konnte nicht geladen werden: {loadError}</p>
      ) : (
        <div className="space-y-3">
          {abos.length > 0 && (
            <ul className="space-y-2">
              {abos.map((a) => {
                const abgelaufen = a.status === 'comped' && !a.istAktiv
                return (
                  <li key={a.id} className="flex items-center gap-3 flex-wrap">
                    <StatusBadge domain="netzwerk-abo" code={a.status} />
                    {abgelaufen && (
                      <span className="text-body-xs text-warning-strong font-medium">abgelaufen</span>
                    )}
                    <span className="text-body-xs text-claimondo-ondo/70">
                      seit {new Date(a.erstelltAm).toLocaleDateString('de-DE')}
                    </span>
                    {a.gueltigBis && (
                      <span className="text-body-xs text-claimondo-ondo/70">
                        gültig bis {new Date(a.gueltigBis).toLocaleDateString('de-DE')}
                      </span>
                    )}
                    {a.stripeSubscriptionId && (
                      <span className="text-body-xs text-claimondo-ondo/50 font-mono" title="Stripe-Subscription">
                        {a.stripeSubscriptionId}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {hatStripeAbo ? (
            <p className="text-body-xs text-claimondo-ondo/70">
              Dieses Abo ist Stripe-geführt (Webhook + Mahnlauf) — Änderungen nur über Stripe, nicht hier.
            </p>
          ) : hatAktivComped ? (
            <Button variant="ghost" size="sm" loading={pending} onClick={() => toggle('entziehen')}>
              Comped entziehen
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-0.5">
                  <span className="text-caption text-claimondo-ondo/70">Befristet bis (optional)</span>
                  <input
                    type="date"
                    value={gueltigBis}
                    onChange={(e) => setGueltigBis(e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-0.5 flex-1 min-w-[180px]">
                  <span className="text-caption text-claimondo-ondo/70">Grund (optional, für Verlauf)</span>
                  <input
                    type="text"
                    value={grund}
                    onChange={(e) => setGrund(e.target.value)}
                    placeholder="z. B. Gründungspartner, Sonderkondition"
                    className={inputCls}
                  />
                </label>
              </div>
              <Button variant="navy" size="sm" loading={pending} onClick={() => toggle('setzen')}>
                Als Netzwerkpartner freistellen (comped)
              </Button>
              {hatComped && (
                <p className="text-caption text-claimondo-ondo/60">
                  Vorherige comped-Freistellung ist abgelaufen — Freistellen erneuert sie.
                </p>
              )}
            </div>
          )}

          {fehler && <p className="text-body-xs text-danger">{fehler}</p>}
        </div>
      )}
    </SectionCard>
  )
}
