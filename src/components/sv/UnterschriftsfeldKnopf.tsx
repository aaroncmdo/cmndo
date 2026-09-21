'use client'

// Der eine Knopf, der an allen vier Stellen das Kunden-Unterschriftsfeld setzt:
// Basic-Wizard, bezahlter Wizard, Nachweise-Seite im Gutachter-Portal und Admin-SV-Akte.
// Er zeigt gleichzeitig den Stand des Slots an — „Unterschriftsfeld fehlt" ist die einzige
// Stelle, an der ein Gutachter merkt, dass sein Dokument noch nicht beim Kunden ankommt.
//
// Aaron 20.09.2026: „ja aber das Unterschriftsfeld muss gesetzt werden."

import { useState } from 'react'
import { MousePointerClickIcon, AlertTriangleIcon, CheckCircle2Icon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { UnterschriftsfeldDialog, type VorschauAntwort, type SpeichernAntwort } from './UnterschriftsfeldDialog'
import type { SignaturKonfig } from '@/lib/sv/unterschriftsfeld'
import { setzeSvUnterschriftsfeld, holeSvDokumentVorschau } from '@/lib/actions/sv-verifizierung-actions'

export type UnterschriftsfeldKnopfProps = {
  slotId: string
  slotLabel: string
  /** Position bereits gesetzt? Steuert Text und Warnhinweis. */
  gesetzt: boolean
  /** Dokument liegt bereits im Kundenflow, obwohl kein Feld gesetzt ist (Bestand vor dem 20.09.). */
  bestandOhneFeld?: boolean
  laden: (slotId: string) => Promise<VorschauAntwort>
  speichern: (slotId: string, position: SignaturKonfig) => Promise<SpeichernAntwort>
  /** Nach dem Speichern — z. B. router.refresh() oder lokalen Status hochziehen. */
  onGespeichert?: () => void
  /** Dialog gleich beim Mounten öffnen (direkt nach einem Upload). */
  sofortOeffnen?: boolean
  disabled?: boolean
  /** Ohne Hinweiszeile, nur der Knopf (enge Listen). */
  kompakt?: boolean
}

export function UnterschriftsfeldKnopf({
  slotId,
  slotLabel,
  gesetzt,
  bestandOhneFeld = false,
  laden,
  speichern,
  onGespeichert,
  sofortOeffnen = false,
  disabled,
  kompakt = false,
}: UnterschriftsfeldKnopfProps) {
  const [offen, setOffen] = useState(sofortOeffnen)
  const [lokalGesetzt, setLokalGesetzt] = useState(gesetzt)
  const fertig = gesetzt || lokalGesetzt

  return (
    <>
      {!kompakt && !fertig && (
        <p
          className={`flex items-start gap-1.5 text-[11px] leading-snug ${
            bestandOhneFeld ? 'text-claimondo-ondo' : 'text-warning-strong'
          }`}
          data-testid={`unterschriftsfeld-hinweis-${slotId}`}
        >
          <AlertTriangleIcon className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <span>
            {bestandOhneFeld
              ? 'Ihr Kunde unterschreibt derzeit auf einer angehängten Seite. Setzen Sie das Feld, damit die Unterschrift direkt im Dokument steht.'
              : 'Unterschriftsfeld fehlt — solange es fehlt, legen wir dieses Dokument Ihrem Kunden nicht vor.'}
          </span>
        </p>
      )}
      {!kompakt && fertig && (
        <p className="flex items-center gap-1.5 text-[11px] text-success-strong" data-testid={`unterschriftsfeld-gesetzt-${slotId}`}>
          <CheckCircle2Icon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          Unterschriftsfeld gesetzt
        </p>
      )}

      <Button
        size="sm"
        variant={fertig ? 'ghost' : 'navy'}
        disabled={disabled}
        onClick={() => setOffen(true)}
        data-testid={`unterschriftsfeld-knopf-${slotId}`}
      >
        <MousePointerClickIcon className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        {fertig ? 'Unterschriftsfeld ändern' : 'Unterschriftsfeld setzen'}
      </Button>

      <UnterschriftsfeldDialog
        offen={offen}
        slotId={slotId}
        slotLabel={slotLabel}
        laden={laden}
        speichern={speichern}
        onSchliessen={() => setOffen(false)}
        onGespeichert={() => {
          setLokalGesetzt(true)
          onGespeichert?.()
        }}
      />
    </>
  )
}

/** Gutachter-Variante: fest mit den SV-Actions verdrahtet (Auth aus der Session, Ziel 'hochgeladen'). */
export function SvUnterschriftsfeldKnopf(
  props: Omit<UnterschriftsfeldKnopfProps, 'laden' | 'speichern'>,
) {
  return (
    <UnterschriftsfeldKnopf
      {...props}
      laden={(slotId) => holeSvDokumentVorschau(slotId)}
      speichern={(slotId, position) => setzeSvUnterschriftsfeld(slotId, position)}
    />
  )
}
