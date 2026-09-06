'use client'

// E3 (Aaron 04.09.): Konnte der Kunde die Bindung nicht klaeren, lassen wir ihn zur Werkstatt-Strecke durch,
// sagen ihm aber ehrlich, was er vorher pruefen soll. Der Dispatch bekommt parallel eine Aufgabe.

import { Button, Card } from '@/components/primitives'

export function KaskoUnklarHinweis({
  markeName,
  onWeiter,
  busy = false,
  anrede = 'sie',
}: {
  markeName: string | null
  onWeiter: () => void
  busy?: boolean
  /** Kundensicht im Portal duzt (seit 31.08.), FlowLink siezt. Default 'sie'. */
  anrede?: 'sie' | 'Sie'
}) {
  const du = anrede === 'Sie'
  return (
    <div className="max-w-md w-full flex flex-col gap-4" data-testid="kasko-unklar-hinweis">
      <div>
        <h1 className="text-2xl font-semibold text-claimondo-navy mb-2">{du ? 'Bitte prüfen Sie Ihren Versicherungsschein' : 'Bitte prüfen Sie Ihren Versicherungsschein'}</h1>
        <p className="text-body-sm text-claimondo-navy/80">
          {du ? 'Wir konnten nicht klären, ob Ihr Kasko-Tarif' : 'Wir konnten nicht klären, ob Ihr Kasko-Tarif'}
          {markeName ? ` bei ${markeName}` : ''}
          {du
            ? ' eine Werkstattbindung enthält. Wir zeigen Ihnen trotzdem passende Werkstätten – beauftragen Sie die Reparatur aber erst, wenn Sie das geprüft haben.'
            : ' eine Werkstattbindung enthält. Wir zeigen Ihnen trotzdem passende Werkstätten – beauftragen Sie die Reparatur aber erst, wenn Sie das geprüft haben.'}
        </p>
      </div>
      <Card p={4} radius="lg" accentColor="info">
        <p className="text-body-sm text-claimondo-navy/80">
          {du
            ? 'Steht im Tarifnamen ein Zusatz wie „SELECT“, „mit Werkstattbonus“ oder „mit Werkstattservice“, benennt Ihre Versicherung die Werkstatt – bei freier Wahl droht eine Kürzung. Unser Team meldet sich dazu bei Ihnen.'
            : 'Steht im Tarifnamen ein Zusatz wie „SELECT“, „mit Werkstattbonus“ oder „mit Werkstattservice“, benennt Ihre Versicherung die Werkstatt – bei freier Wahl droht eine Kürzung. Unser Team meldet sich dazu bei Ihnen.'}
        </p>
      </Card>
      <Button variant="navy" fullWidth onClick={onWeiter} loading={busy}>
        <span data-testid="kasko-unklar-weiter">Verstanden – weiter zur Werkstatt</span>
      </Button>
    </div>
  )
}
