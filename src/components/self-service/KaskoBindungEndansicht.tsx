'use client'

// Ehrliche Endseite bei Kasko-Werkstattbindung (Spec §6, Aaron E2). Ersetzt fuer diesen Fall die
// KaskoEndansicht, die vom Gutachter/Haftpflicht spricht — fachlich falsch fuer die Bindung.
// Zeigt Marke/Tarif, Marker, Sanktion (Konditionen der Marke oder GDV-Default), naechste Schritte,
// Versicherer-Kontakt und optional den Rueckruf (bestehende Action des Aufrufers).

import { useState } from 'react'
import { Badge, Button, Card } from '@/components/primitives'
import type { KaskoBindungsInfo } from '@/lib/kasko-wb/types'

export function KaskoBindungEndansicht({
  info,
  onRueckruf,
  onKorrigieren,
  kompakt = false,
}: {
  info: KaskoBindungsInfo
  onRueckruf?: () => Promise<{ ok: boolean; error?: string }>
  /** Abnahme 04.09.: Weg zurueck in die Tariffrage (Fehlklick, spaetere Korrektur nach Blick in den Schein). */
  onKorrigieren?: () => void
  kompakt?: boolean
  /** Kundensicht im Portal duzt (seit 31.08.), FlowLink siezt. Default 'sie'. */
}) {
  const [rueckruf, setRueckruf] = useState<'offen' | 'sendet' | 'fertig' | 'fehler'>('offen')
  const [fehler, setFehler] = useState<string | null>(null)
  const titel = kompakt ? 'text-body font-bold text-claimondo-navy' : 'text-2xl font-semibold text-claimondo-navy mb-2'
  const tarifZeile = [info.markeName, info.tarifName ? `Tarif „${info.tarifName}“` : null].filter(Boolean).join(' · ')

  async function anfordern() {
    if (!onRueckruf) return
    setRueckruf('sendet')
    const r = await onRueckruf()
    if (r.ok) setRueckruf('fertig')
    else {
      setRueckruf('fehler')
      setFehler(r.error ?? 'Der Rückruf konnte nicht angelegt werden.')
    }
  }

  return (
    <div className={kompakt ? 'flex flex-col gap-3' : 'max-w-md w-full flex flex-col gap-4'} data-testid="kasko-bindung-endansicht">
      <div>
        <h1 className={titel}>{'Ihr Kasko-Tarif enthält eine Werkstattbindung'}</h1>
        {tarifZeile && <p className="text-body-sm text-claimondo-navy/70">{tarifZeile}</p>}
        <p className="mt-2 text-body-sm text-claimondo-navy/80">
          {'Ihre Versicherung benennt die Reparaturwerkstatt. Eine Werkstatt-Vermittlung durch uns ist in diesem Fall nicht möglich – damit Ihnen keine Kürzung entsteht.'}
        </p>
        {info.wbMarker.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {info.wbMarker.map((m) => (
              <Badge key={m} tone="warning" size="sm">„{m}“</Badge>
            ))}
          </div>
        )}
      </div>

      <Card p={4} radius="lg" accentColor="warning">
        <p className="text-body-sm font-semibold text-claimondo-navy">{'Was das für Sie bedeutet'}</p>
        <p className="mt-1 text-body-sm text-claimondo-navy/80">{info.sanktionText}</p>
        {info.nachlassText && (
          <p className="mt-2 text-caption text-claimondo-navy/60">{'Dafür erhalten Sie den Beitragsnachlass: '}{info.nachlassText}.</p>
        )}
      </Card>

      <Card p={4} radius="lg">
        <p className="text-body-sm font-semibold text-claimondo-navy">So geht es weiter</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-body-sm text-claimondo-navy/80">
          <li>
            {'Melden Sie den Schaden Ihrer Versicherung'}
            {info.hotline ? <> – Schaden-Hotline <a className="font-semibold text-claimondo-ondo" href={`tel:${info.hotline.replace(/\s/g, '')}`}>{info.hotline}</a></> : null}
            {info.schadenEmail ? <> · <a className="font-semibold text-claimondo-ondo" href={`mailto:${info.schadenEmail}`}>{info.schadenEmail}</a></> : null}
            .
          </li>
          <li>{'Lassen Sie sich die Partnerwerkstatt benennen'}{info.partnernetz ? ` (${info.partnernetz})` : ''}.</li>
          <li>{'Ausnahmen, bei denen Sie frei wählen dürfen: '}{info.ausnahmenText}.</li>
        </ol>
      </Card>

      {onRueckruf && rueckruf !== 'fertig' && (
        <Button variant="ghost" fullWidth onClick={() => void anfordern()} loading={rueckruf === 'sendet'}>
          <span data-testid="kasko-bindung-rueckruf">{'Rückruf anfordern – wir beraten Sie zum weiteren Vorgehen'}</span>
        </Button>
      )}
      {rueckruf === 'fertig' && <p className="text-body-sm text-success-strong">{'Danke – wir rufen Sie zurück.'}</p>}
      {onKorrigieren && (
        <Button variant="bare" size="sm" onClick={onKorrigieren}>
          <span data-testid="kasko-bindung-korrigieren">Angaben korrigieren – ich habe einen anderen Tarif</span>
        </Button>
      )}
      {fehler && <p className="text-body-sm text-danger">{fehler}</p>}

      <p className="text-caption text-claimondo-navy/50">
        {'Maßgeblich sind Ihr Versicherungsschein und Ihre AKB.'} Diese Einschätzung beruht auf dem Tarifnamen (Stand {info.stand}
        {info.verlaesslichkeit !== 'belegt' ? '; Bindungscharakter nicht vollständig belegt' : ''}).
      </p>
    </div>
  )
}
